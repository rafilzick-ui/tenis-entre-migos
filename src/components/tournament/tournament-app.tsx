import { Link, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cloud, CloudOff, Download, FileUp, Info, KeyRound, Settings, Share2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BracketView } from "@/components/tournament/bracket-view";
import { ConflictDialog, PublishDialog, SeedDialog, SettingsDialog, ShareDialog, UnlockDialog } from "@/components/tournament/management-dialogs";
import { RoundRobinView } from "@/components/tournament/round-robin-view";
import { ScoreDialog } from "@/components/tournament/score-dialog";
import { SetupView } from "@/components/tournament/setup-view";
import { OfficialLogo } from "@/components/official-logo";
import type { CloudMode, CloudSnapshot } from "@/lib/cloud-types";
import { recallEditKey, rememberEditKey } from "@/lib/keychain";
import { getSupabase } from "@/lib/supabase/client";
import type { Match, TournamentState } from "@/lib/tournament-schema";
import { parseTournament } from "@/lib/tournament-schema";
import { addPlayer, allRoundRobinMatches, calculateStandings, createPlayoffs, createTournament, currentRoundNumber, isMatchComplete, matchWinner, PHASE_LABELS, playoffMatches, replaceSeeds, setResult, updatePhase } from "@/lib/tournament";
import { downloadJson, slugify } from "@/lib/utils";

const LOCAL_KEY = "tt-tournament-control-v1";
type SaveStatus = "local" | "live" | "saving" | "saved" | "offline" | "conflict";
type ScoreTarget = { match: Match; bestOf: 3 | 5 | 7 } | null;

export function TournamentApp({
  initialState = null,
  cloud = null,
}: {
  initialState?: TournamentState | null;
  cloud?: CloudMode | null;
}) {
  const router = useNavigate();
  const params = useParams<{ slug?: string }>();
  const cloudSlug = cloud?.slug ?? params.slug ?? null;
  const cloudMode = cloudSlug ? { slug: cloudSlug, revision: cloud?.revision ?? 0, updatedAt: cloud?.updatedAt ?? "" } : null;

  const [state, setState] = useState<TournamentState | null>(initialState);
  const [hydrated, setHydrated] = useState(Boolean(initialState));
  const [view, setView] = useState<"round-robin" | "playoffs">(
    initialState?.phase && initialState.phase !== "round-robin" ? "playoffs" : "round-robin",
  );
  const [selectedRound, setSelectedRound] = useState(1);
  const [canEdit, setCanEdit] = useState(!cloudMode);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(cloudMode ? "live" : "local");
  const [scoreTarget, setScoreTarget] = useState<ScoreTarget>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [createBracketConfirm, setCreateBracketConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [conflict, setConflict] = useState<{ local: TournamentState; remote: CloudSnapshot } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const editKeyRef = useRef("");
  const revisionRef = useRef(cloudMode?.revision ?? 0);
  const savingRef = useRef(false);
  const pendingRef = useRef<TournamentState | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(800);

  const localKey = cloudMode ? `${LOCAL_KEY}:${cloudMode.slug}` : LOCAL_KEY;

  useEffect(() => {
    if (initialState) return;
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const parsed = parseTournament(JSON.parse(raw));
        if (parsed.success) {
          queueMicrotask(() => {
            setState(parsed.data);
            setSelectedRound(currentRoundNumber(parsed.data));
          });
        }
      }
    } catch {
      toast.error("The local autosave could not be loaded");
    } finally {
      setHydrated(true);
    }
  }, [initialState]);

  const applySnapshot = useCallback((snapshot: CloudSnapshot) => {
    if (snapshot.revision <= revisionRef.current) return;
    revisionRef.current = snapshot.revision;
    setState(snapshot.data);
    localStorage.setItem(`${LOCAL_KEY}:${snapshot.slug}`, JSON.stringify(snapshot.data));
    setSaveStatus("live");
  }, []);

  useEffect(() => {
    if (!cloudMode) return;
    const supabase = getSupabase();
    const channel = supabase
      ?.channel(`tournament:${cloudMode.slug}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tournaments", filter: `slug=eq.${cloudMode.slug}` },
        (payload) => {
          const row = payload.new as { slug?: string; revision?: number; updated_at?: string; data?: unknown };
          const parsed = parseTournament(row.data);
          if (!parsed.success || typeof row.revision !== "number" || !row.updated_at) return;
          if (savingRef.current || pendingRef.current) return;
          applySnapshot({ slug: cloudMode.slug, revision: row.revision, updatedAt: row.updated_at, data: parsed.data });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSaveStatus("offline");
        if (status === "SUBSCRIBED" && !savingRef.current) setSaveStatus("live");
      });

    const poll = setInterval(async () => {
      if (savingRef.current || pendingRef.current) return;
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tournament-api/${cloudMode.slug}`, { cache: "no-store" });
        if (!response.ok) return;
        const snapshot = (await response.json()) as CloudSnapshot;
        const parsed = parseTournament(snapshot.data);
        if (parsed.success) applySnapshot({ ...snapshot, data: parsed.data });
      } catch {
        setSaveStatus("offline");
      }
    }, 15_000);

    return () => {
      clearInterval(poll);
      if (supabase && channel) supabase.removeChannel(channel);
    };
  }, [applySnapshot, cloudMode]);

  async function flushRemote() {
    if (!cloudMode || savingRef.current || !pendingRef.current || !editKeyRef.current) return;
    const next = pendingRef.current;
    pendingRef.current = null;
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tournament-api/${cloudMode.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tournament-edit-key": editKeyRef.current },
        body: JSON.stringify({ expectedRevision: revisionRef.current, data: next }),
      });
      const result = await response.json();
      if (response.status === 409 && result.current) {
        const parsed = parseTournament(result.current.data);
        if (parsed.success) {
          setConflict({ local: next, remote: { ...result.current, data: parsed.data } });
          setSaveStatus("conflict");
          return;
        }
      }
      if (response.status === 401 || response.status === 403) {
        editKeyRef.current = "";
        pendingRef.current = null;
        sessionStorage.removeItem(`tt-edit-key:${cloudMode.slug}`);
        setCanEdit(false);
        setSaveStatus("live");
        toast.error("Organizer access expired. Enter the edit key again.");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Cloud save failed");
      revisionRef.current = result.revision;
      retryDelayRef.current = 800;
      setSaveStatus("saved");
    } catch (error) {
      pendingRef.current = next;
      setSaveStatus("offline");
      retryDelayRef.current = Math.min(retryDelayRef.current * 2, 15_000);
      toast.error(error instanceof Error ? error.message : "Cloud save failed");
    } finally {
      savingRef.current = false;
      if (pendingRef.current && !conflict) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => void flushRemote(), retryDelayRef.current);
      }
    }
  }

  function queueRemote(next: TournamentState) {
    if (!cloudMode || !editKeyRef.current) return;
    pendingRef.current = next;
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void flushRemote(), 600);
  }

  function commit(next: TournamentState) {
    if (!canEdit) return;
    setState(next);
    localStorage.setItem(localKey, JSON.stringify(next));
    if (cloudMode) queueRemote(next);
  }

  const verifyEditKey = useCallback(async (key: string, quiet = false) => {
    if (!cloudMode) return false;
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tournament-api/${cloudMode.slug}/verify`, {
        method: "POST",
        headers: { "x-tournament-edit-key": key },
      });
      if (!response.ok) {
        if (!quiet) toast.error("Incorrect edit key");
        return false;
      }
      editKeyRef.current = key;
      sessionStorage.setItem(`tt-edit-key:${cloudMode.slug}`, key);
      rememberEditKey(cloudMode.slug, key);
      setCanEdit(true);
      setSaveStatus("saved");
      if (!quiet) toast.success("Organizer editing unlocked");
      return true;
    } catch {
      if (!quiet) toast.error("Could not verify the edit key");
      return false;
    }
  }, [cloudMode]);

  useEffect(() => {
    if (!cloudMode) return;
    const savedKey = sessionStorage.getItem(`tt-edit-key:${cloudMode.slug}`) ?? recallEditKey(cloudMode.slug);
    if (savedKey) queueMicrotask(() => void verifyEditKey(savedKey, true));
  }, [cloudMode, verifyEditKey]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const stats = useMemo(() => {
    if (!state) return null;
    const rr = allRoundRobinMatches(state);
    const playoff = playoffMatches(state.playoffs);
    const done = [...rr, ...playoff].filter(isMatchComplete).length;
    const total = rr.length + (state.playoffs ? 7 : 0);
    return { rrDone: rr.filter(isMatchComplete).length, rrTotal: rr.length, done, total, progress: total ? Math.round((done / total) * 100) : 0 };
  }, [state]);

  function createBracket() {
    if (!state) return;
    if (allRoundRobinMatches(state).some((match) => !isMatchComplete(match))) {
      setCreateBracketConfirm(true);
      return;
    }
    applyBracket();
  }

  function applyBracket() {
    if (!state) return;
    const next = structuredClone(state);
    next.playoffs = createPlayoffs(calculateStandings(next).slice(0, 8).map((row) => row.id));
    next.phase = updatePhase(next.playoffs);
    commit(next);
    setView("playoffs");
    setCreateBracketConfirm(false);
    toast.success("Top-eight bracket created");
  }

  function saveScore(s1: number | null, s2: number | null) {
    if (!state || !scoreTarget) return;
    commit(setResult(state, scoreTarget.match.id, s1, s2));
    setScoreTarget(null);
    toast.success(s1 === null ? "Result cleared" : "Result saved");
  }

  async function importFile(file: File) {
    try {
      const parsed = parseTournament(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error();
      if (cloudMode && !canEdit) return toast.error("Organizer access is required to import into a shared tournament");
      if (state) commit(parsed.data);
      else {
        setState(parsed.data);
        localStorage.setItem(localKey, JSON.stringify(parsed.data));
      }
      setSelectedRound(currentRoundNumber(parsed.data));
      setView(parsed.data.playoffs ? "playoffs" : "round-robin");
      toast.success("Tournament backup imported");
    } catch {
      toast.error("That file is not a valid tournament backup");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  if (!hydrated) {
    return <main className="grid min-h-screen place-items-center"><div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></main>;
  }

  if (!state) {
    return (
      <>
        <SetupView onCreate={(name, players) => { const next = createTournament(name, players); setState(next); localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); }} onImport={() => importRef.current?.click()} />
        <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
      </>
    );
  }

  const playerName = (id: string | null) => state.players.find((player) => player.id === id)?.name ?? "TBD";
  const champion = state.playoffs ? matchWinner(state.playoffs.final) : null;
  const cloudLabel = !cloudMode ? "Local only" : !canEdit ? "Live · read only" : saveStatus === "saving" ? "Saving..." : saveStatus === "offline" ? "Offline · retrying" : saveStatus === "conflict" ? "Save conflict" : "Live · saved";

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" aria-label="Tenis Entre Amigos" className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 p-1.5 text-secondary ring-1 ring-primary/15 transition-colors hover:bg-primary/15">
            <OfficialLogo className="size-full rounded-lg object-contain" />
          </Link>
          <div className="min-w-0"><h1 className="truncate font-display text-xl font-bold tracking-tight">{state.name}</h1><p className="mt-0.5 text-xs font-medium tracking-wide text-muted-foreground">Round robin · Top 8 playoffs</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant={saveStatus === "offline" || saveStatus === "conflict" ? "destructive" : cloudMode ? "default" : "outline"}>{saveStatus === "offline" ? <WifiOff /> : cloudMode ? <Wifi /> : <CloudOff />}{cloudLabel}</Badge>
          {cloudMode && !canEdit && <Button size="sm" variant="secondary" onClick={() => setUnlockOpen(true)}><KeyRound /> Organizer</Button>}
          {cloudMode && <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)}><Share2 /> Share</Button>}
          {!cloudMode && canEdit && <Button size="sm" variant="secondary" onClick={() => setPublishOpen(true)}><Cloud /> Share live</Button>}
          <Link to="/rules" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} title="Tournament format & rules" aria-label="Tournament format and rules"><Info /></Link>
          {canEdit && <Button size="icon-sm" variant="ghost" title="Export JSON backup" onClick={() => downloadJson(`${slugify(state.name) || "tournament"}-backup.json`, state)}><Download /></Button>}
          {canEdit && <Button size="icon-sm" variant="ghost" title="Import JSON backup" onClick={() => importRef.current?.click()}><FileUp /></Button>}
          {canEdit && <Button size="icon-sm" variant="ghost" title="Settings" onClick={() => setSettingsOpen(true)}><Settings /></Button>}
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryCard label="Players" value={String(state.players.length)} sub="Top 8 advance" />
        <SummaryCard label="Current stage" value={PHASE_LABELS[state.phase]} sub={state.phase === "round-robin" ? `Round ${currentRoundNumber(state)} of ${state.rounds.length}` : champion ? `${playerName(champion)} wins` : "Knockout stage"} />
        <SummaryCard label="Round robin" value={`${stats?.rrDone} / ${stats?.rrTotal}`} sub="Best of 3" />
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Overall progress</p><p className="mt-1 font-display text-2xl font-bold tracking-tight">{stats?.progress}%</p><Progress className="mt-2" value={stats?.progress} /></Card>
      </section>

      <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
        <TabsList className="w-full"><TabsTrigger className="flex-1" value="round-robin">Round robin</TabsTrigger><TabsTrigger className="flex-1" value="playoffs">Playoff bracket</TabsTrigger></TabsList>
        <TabsContent value="round-robin"><RoundRobinView state={state} selectedRound={selectedRound} onSelectRound={setSelectedRound} onScore={(match, bestOf) => setScoreTarget({ match, bestOf })} onCreatePlayoffs={createBracket} onViewPlayoffs={() => setView("playoffs")} canEdit={canEdit} /></TabsContent>
        <TabsContent value="playoffs"><BracketView state={state} canEdit={canEdit} onScore={(match, bestOf) => setScoreTarget({ match, bestOf })} onEditSeeds={() => setSeedOpen(true)} onCreatePlayoffs={createBracket} /></TabsContent>
      </Tabs>

      <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
      <ScoreDialog match={scoreTarget?.match ?? null} bestOf={scoreTarget?.bestOf ?? 3} playerName={playerName} open={Boolean(scoreTarget)} onOpenChange={(open) => { if (!open) setScoreTarget(null); }} onSave={saveScore} />
      <SeedDialog open={seedOpen} onOpenChange={setSeedOpen} state={state} onApply={(seeds) => { commit(replaceSeeds(state, seeds)); toast.success("Playoff seeds updated"); }} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} state={state} onSave={(name, names) => { const next = structuredClone(state); next.name = name; next.players = next.players.map((player, index) => ({ ...player, name: names[index] })); commit(next); toast.success("Tournament details updated"); }} onNewLocal={!cloudMode ? () => { setSettingsOpen(false); setResetConfirm(true); } : undefined} currentSlug={cloudMode?.slug} onDeleteCurrent={cloudMode ? () => { localStorage.removeItem(localKey); sessionStorage.removeItem(`tt-edit-key:${cloudMode.slug}`); setSettingsOpen(false); router("/"); } : undefined} onAddPlayer={state.phase === "round-robin" && !state.playoffs ? (playerName) => { try { commit(addPlayer(state, playerName)); toast.success(`${playerName} added to the round robin`); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add the player"); } } : undefined} />
      {!cloudMode && <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} state={state} onPublished={(slug) => router(`/t/${slug}`)} />}
      {cloudMode && <UnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} slug={cloudMode.slug} onUnlocked={verifyEditKey} />}
      {cloudMode && <ShareDialog open={shareOpen} onOpenChange={setShareOpen} slug={cloudMode.slug} />}
      <ConflictDialog conflict={conflict} onUseRemote={() => { if (!conflict) return; revisionRef.current = conflict.remote.revision; setState(conflict.remote.data); localStorage.setItem(localKey, JSON.stringify(conflict.remote.data)); setConflict(null); setSaveStatus("live"); toast.info("Latest cloud version loaded"); }} onKeepMine={() => { if (!conflict) return; revisionRef.current = conflict.remote.revision; const local = conflict.local; setConflict(null); setState(local); pendingRef.current = local; setSaveStatus("saving"); setTimeout(() => void flushRemote(), 0); }} />

      <AlertDialog open={createBracketConfirm} onOpenChange={setCreateBracketConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Round robin is not finished</AlertDialogTitle><AlertDialogDescription>The bracket will use the current provisional leaderboard. You can reseed it later, but reseeding clears playoff results.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep playing</AlertDialogCancel><AlertDialogAction onClick={applyBracket}>Create provisional bracket</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Start a new tournament?</AlertDialogTitle><AlertDialogDescription>The current local tournament will be removed from this browser. Export a backup first if you need it.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { localStorage.removeItem(LOCAL_KEY); setState(null); setResetConfirm(false); }}>Start over</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <Card className="min-w-0 p-4"><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{label}</p><p className="mt-1 truncate font-display text-xl font-bold tracking-tight sm:text-2xl">{value}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p></Card>;
}
