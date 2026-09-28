import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Swords, Trophy, ChevronRight, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PendingInvite = {
  id: string;
  challenger_name: string;
};

type RivalrySummary = {
  opponentId: string;
  opponentName: string;
  opponentAvatar: string | null;
  myWins: number;
  oppWins: number;
  lastDate: string | null;
};

export function HomeFriendlySection() {
  const { profile } = useAuth();
  const supabase = getSupabase();
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [friendlyStats, setFriendlyStats] = useState({ played: 0, won: 0, lost: 0 });
  const [rivalries, setRivalries] = useState<RivalrySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !profile) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("friendly_matches")
          .select("id, challenger_id, challenged_id, status, winner_id, match_date")
          .or(`challenger_id.eq.${profile.id},challenged_id.eq.${profile.id}`)
          .order("created_at", { ascending: false });

        const allMatches = data ?? [];
        const pending = allMatches.filter(
          (m: Record<string, unknown>) => m.status === "pending" && m.challenged_id === profile.id,
        );
        const completed = allMatches.filter(
          (m: Record<string, unknown>) => m.status === "completed" && m.winner_id,
        );

        // Fetch challenger names for pending invites
        const challengerIds = pending.map((m: Record<string, unknown>) => m.challenger_id as string);
        const profileMap = new Map<string, string>();
        const allPlayerIds = new Set<string>();
        allPlayerIds.add(profile.id);
        completed.forEach((m: Record<string, unknown>) => {
          allPlayerIds.add(m.challenger_id as string);
          allPlayerIds.add(m.challenged_id as string);
        });
        challengerIds.forEach((id) => allPlayerIds.add(id));

        if (allPlayerIds.size > 0) {
          const { data: profiles } = await supabase
            .from("public_profiles")
            .select("id, display_name, avatar_url")
            .in("id", [...allPlayerIds]);
          (profiles ?? []).forEach((p: Record<string, unknown>) => {
            profileMap.set(p.id as string, (p.display_name as string) ?? "");
          });
        }

        setPendingInvites(
          pending.map((m: Record<string, unknown>) => ({
            id: m.id as string,
            challenger_name: profileMap.get(m.challenger_id as string) ?? "Jogador",
          })),
        );

        // Friendly stats
        const myWins = completed.filter((m: Record<string, unknown>) => m.winner_id === profile.id).length;
        const myLosses = completed.filter((m: Record<string, unknown>) => m.winner_id !== profile.id).length;
        setFriendlyStats({ played: completed.length, won: myWins, lost: myLosses });

        // Rivalries
        const rivalMap = new Map<string, RivalrySummary>();
        completed.forEach((m: Record<string, unknown>) => {
          const isChal = m.challenger_id === profile.id;
          const oppId = (isChal ? m.challenged_id : m.challenger_id) as string;
          if (!rivalMap.has(oppId)) {
            rivalMap.set(oppId, {
              opponentId: oppId,
              opponentName: profileMap.get(oppId) ?? "Jogador",
              opponentAvatar: null,
              myWins: 0,
              oppWins: 0,
              lastDate: null,
            });
          }
          const r = rivalMap.get(oppId)!;
          if (m.winner_id === profile.id) r.myWins++;
          else r.oppWins++;
          const md = m.match_date as string | null;
          if (md && (!r.lastDate || md > r.lastDate)) r.lastDate = md;
        });
        setRivalries(
          [...rivalMap.values()].sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "")),
        );
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, profile]);

  if (loading || !profile) return null;

  return (
    <div className="grid gap-4">
      {/* Pending invites notification */}
      {pendingInvites.length > 0 && (
        <Card className="border-primary/30 bg-primary/[.03]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-secondary">
                  <Mail className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">
                    {pendingInvites.length === 1
                      ? `Novo convite de amistoso de ${pendingInvites[0].challenger_name}`
                      : `Voce tem ${pendingInvites.length} novos convites para amistosos`}
                  </p>
                  <p className="text-xs text-muted-foreground">Acesse para aceitar ou recusar</p>
                </div>
              </div>
              <Link
                to="/amistosos"
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Ver convite
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Friendly stats + rivalries */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Swords className="size-5 text-secondary" />
            <h2 className="font-display text-lg font-bold">Amistosos</h2>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="font-display text-xl font-bold">{friendlyStats.played}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Partidas</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="font-display text-xl font-bold text-secondary">{friendlyStats.won}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Vitorias</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="font-display text-xl font-bold">{friendlyStats.lost}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Derrotas</p>
            </div>
          </div>

          {rivalries.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Minhas rivalidades
              </p>
              <div className="space-y-2">
                {rivalries.slice(0, 5).map((r) => (
                  <Link
                    key={r.opponentId}
                    to={`/amistosos/rivalidade/${r.opponentId}`}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
                  >
                    <span className="text-sm font-semibold">{r.opponentName}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold">
                        <span className="text-secondary">{r.myWins}</span>
                        <span className="mx-1 text-muted-foreground">x</span>
                        {r.oppWins}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {friendlyStats.played === 0 && pendingInvites.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Voce ainda nao tem amistosos.{" "}
              <Link to="/amistosos" className="font-semibold text-secondary hover:underline">
                Enviar um desafio
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
