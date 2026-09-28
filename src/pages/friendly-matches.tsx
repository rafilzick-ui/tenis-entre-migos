import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Swords, Search, Send, Check, X, Calendar, Clock, ChevronRight, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FriendlyMatch = {
  id: string;
  challenger_id: string;
  challenged_id: string;
  challenger_name: string;
  challenged_name: string;
  challenger_avatar: string | null;
  challenged_avatar: string | null;
  match_date: string | null;
  match_time: string | null;
  note: string | null;
  status: string;
  winner_id: string | null;
  set1_p1: number | null;
  set1_p2: number | null;
  set2_p1: number | null;
  set2_p2: number | null;
  sup_p1: number | null;
  sup_p2: number | null;
  created_at: string;
};

type PlayerSearchResult = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  refused: "Recusado",
  cancelled: "Cancelado",
  completed: "Concluido",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700",
  accepted: "bg-primary/10 text-secondary",
  refused: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-primary/15 text-secondary",
};

export function FriendlyMatchesPage() {
  const { profile } = useAuth();
  const supabase = getSupabase();
  const [matches, setMatches] = useState<FriendlyMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<PlayerSearchResult | null>(null);
  const [challengeDate, setChallengeDate] = useState("");
  const [challengeTime, setChallengeTime] = useState("");
  const [challengeNote, setChallengeNote] = useState("");
  const [sending, setSending] = useState(false);

  const loadMatches = useCallback(async () => {
    if (!supabase || !profile) return;
    const { data, error } = await supabase
      .from("friendly_matches")
      .select("id, challenger_id, challenged_id, match_date, match_time, note, status, winner_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, created_at")
      .or(`challenger_id.eq.${profile.id},challenged_id.eq.${profile.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar amistosos");
      return;
    }

    const playerIds = new Set<string>();
    (data ?? []).forEach((m: Record<string, unknown>) => {
      playerIds.add(m.challenger_id as string);
      playerIds.add(m.challenged_id as string);
    });

    const profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
    if (playerIds.size > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", [...playerIds]);
      (profiles ?? []).forEach((p: Record<string, unknown>) => {
        profileMap.set(p.id as string, {
          display_name: (p.display_name as string) ?? "",
          avatar_url: (p.avatar_url as string | null) ?? null,
        });
      });
    }

    const enriched: FriendlyMatch[] = (data ?? []).map((m: Record<string, unknown>) => {
      const chId = m.challenger_id as string;
      const cdId = m.challenged_id as string;
      const chInfo = profileMap.get(chId);
      const cdInfo = profileMap.get(cdId);
      return {
        id: m.id as string,
        challenger_id: chId,
        challenged_id: cdId,
        challenger_name: chInfo?.display_name ?? "Jogador",
        challenged_name: cdInfo?.display_name ?? "Jogador",
        challenger_avatar: chInfo?.avatar_url ?? null,
        challenged_avatar: cdInfo?.avatar_url ?? null,
        match_date: m.match_date as string | null,
        match_time: m.match_time as string | null,
        note: m.note as string | null,
        status: m.status as string,
        winner_id: m.winner_id as string | null,
        set1_p1: m.set1_p1 as number | null,
        set1_p2: m.set1_p2 as number | null,
        set2_p1: m.set2_p1 as number | null,
        set2_p2: m.set2_p2 as number | null,
        sup_p1: m.sup_p1 as number | null,
        sup_p2: m.sup_p2 as number | null,
        created_at: m.created_at as string,
      };
    });

    setMatches(enriched);
    setLoading(false);
  }, [supabase, profile]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // Debounced player search
  useEffect(() => {
    if (!supabase || !searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${searchQuery.trim()}%`)
        .neq("id", profile?.id ?? "")
        .limit(10);

      if (error) {
        setSearchResults([]);
      } else {
        setSearchResults(data as PlayerSearchResult[]);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, supabase, profile]);

  async function sendChallenge() {
    if (!supabase || !profile || !challengeTarget) return;

    // Prevent past dates
    if (challengeDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(challengeDate + "T00:00:00");
      if (selected < today) {
        toast.error("A data do amistoso nao pode ser anterior a hoje");
        return;
      }
    }

    setSending(true);
    const { data: insertData, error } = await supabase.from("friendly_matches").insert({
      challenger_id: profile.id,
      challenged_id: challengeTarget.id,
      match_date: challengeDate || null,
      match_time: challengeTime || null,
      note: challengeNote.trim() || null,
    }).select("id").maybeSingle();
    setSending(false);
    if (error) {
      toast.error("Erro ao enviar desafio");
      return;
    }
    toast.success(`Desafio enviado para ${challengeTarget.display_name}`);

    // Send notification to the challenged player
    if (insertData) {
      const matchId = (insertData as Record<string, unknown>).id as string;
      const dedupKey = `friendly_challenge_${matchId}`;
      const dateInfo = challengeDate
        ? `Data: ${challengeDate}${challengeTime ? ` as ${challengeTime}` : ""}`
        : "";
      const noteInfo = challengeNote.trim() ? `Mensagem: ${challengeNote.trim()}` : "";
      const bodyParts = [dateInfo, noteInfo].filter(Boolean);
      const body = bodyParts.length > 0 ? bodyParts.join(" — ") : null;

      await supabase.rpc("create_notification", {
        p_user_id: challengeTarget.id,
        p_type: "friendly_challenge",
        p_title: "Novo desafio de amistoso",
        p_body: body ?? `${profile.display_name ?? profile.full_name ?? "Um jogador"} convidou voce para um amistoso.`,
        p_link: "/amistosos",
        p_ref_id: matchId,
        p_dedup_key: dedupKey,
      }).then(({ error: notifError }) => {
        if (notifError) console.error("Notification error:", notifError.message);
      });

      // Send email notification via edge function
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            type: "friendly_challenge",
            recipientId: challengeTarget.id,
            challengerName: profile.display_name ?? profile.full_name ?? "Um jogador",
            matchDate: challengeDate || null,
            matchTime: challengeTime || null,
            note: challengeNote.trim() || null,
          }),
        });
      } catch (e) {
        console.error("Email notification error:", e);
      }
    }

    setChallengeTarget(null);
    setChallengeDate("");
    setChallengeTime("");
    setChallengeNote("");
    setSearchQuery("");
    setSearchResults([]);
    await loadMatches();
  }

  async function respondToChallenge(matchId: string, accept: boolean) {
    if (!supabase) return;
    const { error } = await supabase
      .from("friendly_matches")
      .update({ status: accept ? "accepted" : "refused" })
      .eq("id", matchId);
    if (error) {
      toast.error("Erro ao responder desafio");
      return;
    }
    toast.success(accept ? "Desafio aceito" : "Desafio recusado");
    await loadMatches();
  }

  async function cancelMatch(matchId: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from("friendly_matches")
      .update({ status: "cancelled" })
      .eq("id", matchId);
    if (error) {
      toast.error("Erro ao cancelar amistoso");
      return;
    }
    toast.success("Amistoso cancelado");
    await loadMatches();
  }

  if (!profile) return null;

  const pendingReceived = matches.filter((m) => m.challenged_id === profile.id && m.status === "pending");
  const pendingSent = matches.filter((m) => m.challenger_id === profile.id && m.status === "pending");
  const upcoming = matches.filter((m) => m.status === "accepted");
  const completed = matches.filter((m) => m.status === "completed");

  // Build rivalries: group completed matches by opponent
  const rivalryMap = new Map<string, { opponentId: string; opponentName: string; opponentAvatar: string | null; myWins: number; oppWins: number; lastDate: string | null }>();
  completed.forEach((m) => {
    const isChal = m.challenger_id === profile.id;
    const oppId = isChal ? m.challenged_id : m.challenger_id;
    const oppName = isChal ? m.challenged_name : m.challenger_name;
    const oppAvatar = isChal ? m.challenged_avatar : m.challenger_avatar;
    if (!rivalryMap.has(oppId)) {
      rivalryMap.set(oppId, { opponentId: oppId, opponentName: oppName, opponentAvatar: oppAvatar, myWins: 0, oppWins: 0, lastDate: null });
    }
    const r = rivalryMap.get(oppId)!;
    if (m.winner_id === profile.id) r.myWins++;
    else r.oppWins++;
    if (m.match_date && (!r.lastDate || m.match_date > r.lastDate)) r.lastDate = m.match_date;
  });
  const rivalries = [...rivalryMap.values()].sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));

  const opponentName = (m: FriendlyMatch) =>
    m.challenger_id === profile.id ? m.challenged_name : m.challenger_name;

  const opponentAvatar = (m: FriendlyMatch) =>
    m.challenger_id === profile.id ? m.challenged_avatar : m.challenger_avatar;

  const isChallenger = (m: FriendlyMatch) => m.challenger_id === profile.id;

  return (
    <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center gap-3">
          <Swords className="size-7 text-secondary" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Amistosos</h1>
        </header>

        {/* Player search */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-1 font-display text-lg font-bold">Quem voce quer desafiar?</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Busque por nome um jogador cadastrado e envie um desafio.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Digite o nome do jogador..."
                className="pl-10"
              />
              {searching && (
                <p className="mt-2 text-xs text-muted-foreground">Buscando...</p>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {player.avatar_url ? (
                        <img src={player.avatar_url} alt="" className="size-8 rounded-lg object-cover" />
                      ) : (
                        <div className="grid size-8 place-items-center rounded-lg bg-secondary text-xs font-bold text-white">
                          {player.display_name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-semibold">{player.display_name}</span>
                    </div>
                    <Button size="sm" onClick={() => setChallengeTarget(player)}>
                      <Send className="size-3.5" /> Desafiar
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum jogador encontrado.</p>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="grid place-items-center py-20">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Pending invites — received */}
            {pendingReceived.length > 0 && (
              <Section title="Convites recebidos" icon={<Swords className="size-4" />}>
                {pendingReceived.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    opponentName={opponentName(m)}
                    opponentAvatar={opponentAvatar(m)}
                    isChallenger={isChallenger(m)}
                    actions={
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => respondToChallenge(m.id, true)}>
                          <Check className="size-3.5" /> Aceitar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => respondToChallenge(m.id, false)}>
                          <X className="size-3.5" /> Recusar
                        </Button>
                      </div>
                    }
                  />
                ))}
              </Section>
            )}

            {/* Pending invites — sent */}
            {pendingSent.length > 0 && (
              <Section title="Convites enviados" icon={<Send className="size-4" />}>
                {pendingSent.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    opponentName={opponentName(m)}
                    opponentAvatar={opponentAvatar(m)}
                    isChallenger={isChallenger(m)}
                    actions={
                      <Button size="sm" variant="ghost" onClick={() => cancelMatch(m.id)}>
                        Cancelar
                      </Button>
                    }
                  />
                ))}
              </Section>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <Section title="Proximos amistosos" icon={<Calendar className="size-4" />}>
                {upcoming.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    opponentName={opponentName(m)}
                    opponentAvatar={opponentAvatar(m)}
                    isChallenger={isChallenger(m)}
                    actions={
                      <Button size="sm" variant="ghost" onClick={() => cancelMatch(m.id)}>
                        Cancelar
                      </Button>
                    }
                  />
                ))}
              </Section>
            )}

            {/* Rivalries */}
            {rivalries.length > 0 && (
              <Section title="Rivalidades" icon={<Trophy className="size-4" />}>
                {rivalries.map((r) => (
                  <Link key={r.opponentId} to={`/amistosos/rivalidade/${r.opponentId}`}>
                    <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          {r.opponentAvatar ? (
                            <img src={r.opponentAvatar} alt="" className="size-9 rounded-lg object-cover" />
                          ) : (
                            <div className="grid size-9 place-items-center rounded-lg bg-secondary text-xs font-bold text-white">
                              {r.opponentName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{r.opponentName}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.myWins + r.oppWins} {r.myWins + r.oppWins === 1 ? "confronto" : "confrontos"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <span className="font-display text-lg font-bold text-secondary">{r.myWins}</span>
                            <span className="mx-1 text-muted-foreground">x</span>
                            <span className="font-display text-lg font-bold">{r.oppWins}</span>
                          </div>
                          <ChevronRight className="size-5 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </Section>
            )}

            {matches.length === 0 && (
              <Card>
                <CardContent className="grid place-items-center py-16 text-center">
                  <Swords className="size-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Voce ainda nao tem amistosos. Busque um jogador acima e envie seu primeiro desafio.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

      {/* Challenge dialog */}
      <Dialog open={!!challengeTarget} onOpenChange={(open) => { if (!open) setChallengeTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desafiar {challengeTarget?.display_name}</DialogTitle>
            <DialogDescription>
              Proponha uma data e horario para o amistoso.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              Data
              <Input type="date" min={new Date().toISOString().split("T")[0]} value={challengeDate} onChange={(e) => setChallengeDate(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Horario
              <Input type="time" value={challengeTime} onChange={(e) => setChallengeTime(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Observacao (opcional)
              <Textarea
                value={challengeNote}
                onChange={(e) => setChallengeNote(e.target.value)}
                placeholder="Vamos jogar na quadra do clube?"
                rows={3}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChallengeTarget(null)}>Cancelar</Button>
            <Button disabled={sending} onClick={sendChallenge}>
              {sending ? "Enviando..." : "Enviar desafio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        {icon}
        {title}
      </h2>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function MatchRow({
  match,
  opponentName,
  opponentAvatar,
  isChallenger,
  actions,
  showResult,
  myId,
}: {
  match: FriendlyMatch;
  opponentName: string;
  opponentAvatar: string | null;
  isChallenger: boolean;
  actions?: React.ReactNode;
  showResult?: boolean;
  myId?: string;
}) {
  const resultLabel = (() => {
    if (!showResult || !match.winner_id || !myId) return null;
    const won = match.winner_id === myId;
    return won ? "Vitoria" : "Derrota";
  })();

  return (
    <Link to={`/amistosos/${match.id}`}>
      <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex min-w-0 items-center gap-3">
            {opponentAvatar ? (
              <img src={opponentAvatar} alt="" className="size-9 rounded-lg object-cover" />
            ) : (
              <div className="grid size-9 place-items-center rounded-lg bg-secondary text-xs font-bold text-white">
                {opponentName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{opponentName}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {match.match_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {new Date(match.match_date).toLocaleDateString("pt-BR")}
                  </span>
                )}
                {match.match_time && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {match.match_time}
                  </span>
                )}
                <span className={cn("rounded px-1.5 py-0.5 font-semibold", STATUS_COLORS[match.status])}>
                  {STATUS_LABELS[match.status]}
                </span>
                {resultLabel && (
                  <span className={cn("rounded px-1.5 py-0.5 font-semibold", resultLabel === "Vitoria" ? "bg-primary/15 text-secondary" : "bg-destructive/10 text-destructive")}>
                    {resultLabel}
                  </span>
                )}
                {isChallenger && <span className="text-muted-foreground">Voce desafiou</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <ChevronRight className="size-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
