import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CloudUpload, Copy, ExternalLink, KeyRound, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CloudSnapshot } from "@/lib/cloud-types";
import { forgetEditKey, organizedSlugs, recallEditKey, rememberEditKey } from "@/lib/keychain";
import type { TournamentState } from "@/lib/tournament-schema";
import { formatRelativeTime, slugify } from "@/lib/utils";

export function SeedDialog({ open, onOpenChange, state, onApply }: { open: boolean; onOpenChange: (value: boolean) => void; state: TournamentState; onApply: (seeds: string[]) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open && <SeedDialogForm key={state.playoffs?.seeds.join(":")} state={state} onApply={onApply} onOpenChange={onOpenChange} />}</Dialog>;
}

function SeedDialogForm({ state, onApply, onOpenChange }: { state: TournamentState; onApply: (seeds: string[]) => void; onOpenChange: (value: boolean) => void }) {
  const [seeds, setSeeds] = useState<string[]>(state.playoffs?.seeds ?? []);
  const move = (index: number, delta: number) => setSeeds((current) => {
    const next = [...current];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    return next;
  });
  const name = (id: string) => state.players.find((player) => player.id === id)?.name ?? "Unknown";
  return (
      <DialogContent>
        <DialogHeader><DialogTitle>Playoff order</DialogTitle><DialogDescription>Seeds are ranking positions 1-8. Reorder the qualifiers here; applying a new order clears all playoff results.</DialogDescription></DialogHeader>
        <div className="grid gap-2">
          {seeds.map((id, index) => <div key={id} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border bg-background/50 p-2"><span className="text-center font-black text-secondary">{index + 1}</span><span className="truncate text-sm font-semibold">{name(id)}</span><span className="flex gap-1"><Button size="icon-sm" variant="secondary" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button><Button size="icon-sm" variant="secondary" disabled={index === seeds.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button></span></div>)}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { onApply(seeds); onOpenChange(false); }}>Apply seeds</Button></DialogFooter>
      </DialogContent>
  );
}

export function SettingsDialog({ open, onOpenChange, state, onSave, onNewLocal, currentSlug, onDeleteCurrent, onAddPlayer }: { open: boolean; onOpenChange: (value: boolean) => void; state: TournamentState; onSave: (name: string, names: string[]) => void; onNewLocal?: () => void; currentSlug?: string; onDeleteCurrent?: () => void; onAddPlayer?: (name: string) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open && <SettingsDialogForm key={`${state.id}:${state.name}:${state.players.map((player) => player.name).join(":")}`} state={state} onSave={onSave} onNewLocal={onNewLocal} onOpenChange={onOpenChange} currentSlug={currentSlug} onDeleteCurrent={onDeleteCurrent} onAddPlayer={onAddPlayer} />}</Dialog>;
}

function SettingsDialogForm({ state, onSave, onNewLocal, onOpenChange, currentSlug, onDeleteCurrent, onAddPlayer }: { state: TournamentState; onSave: (name: string, names: string[]) => void; onNewLocal?: () => void; onOpenChange: (value: boolean) => void; currentSlug?: string; onDeleteCurrent?: () => void; onAddPlayer?: (name: string) => void }) {
  const [name, setName] = useState(state.name);
  const [players, setPlayers] = useState(state.players.map((player) => player.name).join("\n"));
  const [newPlayer, setNewPlayer] = useState("");
  const names = players.split("\n").map((value) => value.trim()).filter(Boolean);
  const unique = new Set(names.map((value) => value.toLocaleLowerCase())).size === names.length;
  const valid = name.trim() && names.length === state.players.length && unique;
  const newPlayerTrimmed = newPlayer.trim();
  const canAddNew = Boolean(onAddPlayer) && state.players.length < 64;
  const newPlayerValid = newPlayerTrimmed.length > 0 && !state.players.some((player) => player.name.toLocaleLowerCase() === newPlayerTrimmed.toLocaleLowerCase());
  const addNewPlayer = () => { if (canAddNew && newPlayerValid) { onAddPlayer!(newPlayerTrimmed); setNewPlayer(""); } };
  return (
      <DialogContent>
        <DialogHeader><DialogTitle>Tournament settings</DialogTitle><DialogDescription>Correct names without changing player identities or existing results.</DialogDescription></DialogHeader>
        <label className="grid gap-2 text-sm font-semibold">Tournament name<Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-semibold">Player names<Textarea className="min-h-60 font-mono" value={players} onChange={(event) => setPlayers(event.target.value)} /><span className="text-xs font-normal text-muted-foreground">Rename players here - identities and results are preserved. Removing a player still requires a new tournament.</span></label>
        {canAddNew && (
          <div className="grid gap-2 border-t pt-4">
            <span className="text-sm font-semibold">Add a player</span>
            <div className="flex gap-2">
              <Input value={newPlayer} maxLength={80} placeholder="New player name" onChange={(event) => setNewPlayer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addNewPlayer(); } }} />
              <Button type="button" variant="secondary" disabled={!newPlayerValid} onClick={addNewPlayer}><UserPlus /> Add</Button>
            </div>
            <span className="text-xs font-normal text-muted-foreground">Schedules their round-robin matches against everyone. Existing results are kept. Only possible before the bracket is created.</span>
          </div>
        )}
        <ManagePublishedTournaments currentSlug={currentSlug} onDeleteCurrent={onDeleteCurrent} />
        <DialogFooter className="sm:justify-between">{onNewLocal ? <Button variant="destructive" onClick={onNewLocal}>New tournament</Button> : <span />}<span className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid} onClick={() => { onSave(name.trim(), names); onOpenChange(false); }}>Save changes</Button></span></DialogFooter>
      </DialogContent>
  );
}

type ListedTournament = { slug: string; name: string; revision: number; createdAt: string; updatedAt: string };

function ManagePublishedTournaments({ currentSlug, onDeleteCurrent }: { currentSlug?: string; onDeleteCurrent?: () => void }) {
  const [items, setItems] = useState<ListedTournament[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [onlyMine, setOnlyMine] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setMine(new Set(organizedSlugs()));
    let active = true;
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tournament-api`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((body) => { if (active) setItems(Array.isArray(body.tournaments) ? body.tournaments : []); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  async function remove(slug: string) {
    const key = recallEditKey(slug) ?? keyInput.trim();
    if (!key) { toast.error("Enter this tournament's edit key to delete it"); return; }
    setBusy(slug);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tournament-api/${slug}`, {
        method: "DELETE",
        headers: { "x-tournament-edit-key": key },
      });
      if (response.status === 403 || response.status === 401) { toast.error("That edit key is incorrect"); return; }
      if (!response.ok) throw new Error();
      forgetEditKey(slug);
      setConfirming(null);
      setKeyInput("");
      toast.success("Tournament deleted");
      if (slug === currentSlug) {
        onDeleteCurrent?.();
        return;
      }
      setItems((current) => current?.filter((item) => item.slug !== slug) ?? null);
      setMine((current) => { const next = new Set(current); next.delete(slug); return next; });
    } catch {
      toast.error("Could not delete the tournament");
    } finally {
      setBusy(null);
    }
  }

  const organizedCount = items?.filter((item) => mine.has(item.slug)).length ?? 0;
  const visible = items?.filter((item) => !onlyMine || mine.has(item.slug)) ?? [];

  return (
    <section className="grid gap-2 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Published tournaments</h3>
          <p className="text-xs text-muted-foreground">Delete stale live tournaments you organize.</p>
        </div>
        {(organizedCount > 0 || !onlyMine) && items && items.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOnlyMine((value) => !value)}>
            {onlyMine ? "Show all" : "Show mine"}
          </Button>
        )}
      </div>

      {failed && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">Cloud storage is unavailable, so tournaments can't be listed right now.</p>}
      {!failed && items === null && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!failed && items?.length === 0 && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No tournaments have been published yet.</p>}
      {!failed && items && items.length > 0 && onlyMine && organizedCount === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          You haven't organized any tournaments on this device.{" "}
          <button type="button" className="font-medium text-secondary underline underline-offset-2" onClick={() => setOnlyMine(false)}>Show all published</button>
        </p>
      )}

      {visible.length > 0 && (
        <ul className="grid max-h-56 gap-1.5 overflow-y-auto pr-0.5">
          {visible.map((item) => {
            const owned = mine.has(item.slug);
            const isCurrent = item.slug === currentSlug;
            return (
              <li key={item.slug} className="flex items-center gap-2 rounded-lg border bg-background/50 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <a href={`/t/${item.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-semibold hover:text-secondary">
                      <span className="truncate">{item.name}</span>
                      <ExternalLink className="size-3 shrink-0 opacity-60" />
                    </a>
                    {isCurrent && <Badge variant="secondary">Open now</Badge>}
                    {owned && <Badge variant="outline">You organize</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">/t/{item.slug} - updated {formatRelativeTime(item.updatedAt)}</p>
                </div>
                {confirming === item.slug ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!owned && <Input autoFocus type="password" className="h-8 w-28" placeholder="Edit key" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void remove(item.slug); }} />}
                    <Button size="sm" variant="destructive" disabled={busy === item.slug} onClick={() => void remove(item.slug)}>{busy === item.slug ? "Deleting..." : "Confirm"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setConfirming(null); setKeyInput(""); }}>Cancel</Button>
                  </div>
                ) : (
                  <Button size="icon-sm" variant="ghost" title="Delete tournament" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => { setConfirming(item.slug); setKeyInput(""); }}><Trash2 /></Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function PublishDialog({ open, onOpenChange, state, onPublished }: { open: boolean; onOpenChange: (value: boolean) => void; state: TournamentState; onPublished: (slug: string, key: string) => void }) {
  const [slug, setSlug] = useState(slugify(state.name));
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 3;
  async function publish() {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tournament-api`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, editKey: key, data: state }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not publish tournament");
      sessionStorage.setItem(`tt-edit-key:${slug}`, key);
      rememberEditKey(slug, key);
      onPublished(slug, key);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish tournament");
    } finally { setLoading(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CloudUpload className="text-secondary" /> Share live tournament</DialogTitle><DialogDescription>Publish this state to Supabase. Anyone with the link can watch; only people with the edit key can change results.</DialogDescription></DialogHeader>
        <label className="grid gap-2 text-sm font-semibold">Public link<Input value={slug} onChange={(event) => setSlug(slugify(event.target.value))} /><span className="text-xs font-normal text-muted-foreground">/t/{slug || "your-link"}</span></label>
        <label className="grid gap-2 text-sm font-semibold">Organizer edit key<Input type="password" value={key} minLength={12} maxLength={128} onChange={(event) => setKey(event.target.value)} placeholder="At least 12 characters" /><span className="text-xs font-normal text-muted-foreground">Store this somewhere safe. It cannot be recovered.</span></label>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!validSlug || key.length < 12 || loading} onClick={publish}>{loading ? "Publishing..." : "Publish & open"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnlockDialog({ open, onOpenChange, slug, onUnlocked }: { open: boolean; onOpenChange: (value: boolean) => void; slug: string; onUnlocked: (key: string) => Promise<boolean> }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  async function unlock() { setLoading(true); const ok = await onUnlocked(key); setLoading(false); if (ok) { setKey(""); onOpenChange(false); } }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="text-secondary" /> Organizer access</DialogTitle><DialogDescription>Enter the edit key for <strong>{slug}</strong>. It is kept only in this browser session.</DialogDescription></DialogHeader>
        <Input autoFocus type="password" value={key} onChange={(event) => setKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && key) unlock(); }} placeholder="Tournament edit key" />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!key || loading} onClick={unlock}>{loading ? "Checking..." : "Unlock editing"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShareDialog({ open, onOpenChange, slug }: { open: boolean; onOpenChange: (value: boolean) => void; slug: string }) {
  const url = typeof window === "undefined" ? `/t/${slug}` : `${window.location.origin}/t/${slug}`;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Share live results</DialogTitle><DialogDescription>Spectators can open this link without an account.</DialogDescription></DialogHeader><div className="flex gap-2"><Input readOnly value={url} /><Button size="icon" onClick={async () => { await navigator.clipboard.writeText(url); toast.success("Link copied"); }}><Copy /></Button></div><DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter></DialogContent></Dialog>;
}

export function ConflictDialog({ conflict, onUseRemote, onKeepMine }: { conflict: { local: TournamentState; remote: CloudSnapshot } | null; onUseRemote: () => void; onKeepMine: () => void }) {
  return <Dialog open={Boolean(conflict)}><DialogContent><DialogHeader><DialogTitle>Another organizer updated the tournament</DialogTitle><DialogDescription>Your local edit and the newest cloud version conflict. Choose which version should continue.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={onUseRemote}>Use latest cloud version</Button><Button onClick={onKeepMine}>Keep my version</Button></DialogFooter></DialogContent></Dialog>;
}
