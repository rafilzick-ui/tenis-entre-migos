import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, TrendingUp, Target, Award, History } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computePoints } from "@/lib/scoring";
import { HomeRankingSection } from "@/components/home-ranking-section";
import { HomeTournamentSection } from "@/components/home-tournament-section";
import { HomeFriendlySection } from "@/components/home-friendly-section";

type Stats = {
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  points: number;
  position: number;
};

type RecentMatch = {
  id: string;
  opponentName: string;
  score: string;
  result: "win" | "loss";
  tournamentName: string | null;
  date: string;
};

export function DashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = getSupabase();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !profile) return;
    (async () => {
      try {
        const [groupMatches, playoffMatches, rankingMatches] = await Promise.all([
          supabase.from("tournament_group_matches").select("id, player1_id, player2_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, winner_id, created_at").or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`),
          supabase.from("tournament_playoff_matches").select("id, player1_id, player2_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, winner_id, stage, created_at").or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`),
          supabase.from("ranking_matches").select("id, player1_id, player2_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, winner_id, created_at").or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`),
        ]);

        const opponentIds = new Set<string>();
        [...(groupMatches.data ?? []), ...(playoffMatches.data ?? []), ...(rankingMatches.data ?? [])].forEach((m: Record<string, unknown>) => {
          const p1 = m.player1_id as string | null;
          const p2 = m.player2_id as string | null;
          if (p1 && p1 !== profile.id) opponentIds.add(p1);
          if (p2 && p2 !== profile.id) opponentIds.add(p2);
        });
        const opponentMap = new Map<string, string>();
        if (opponentIds.size > 0) {
          const { data: oppProfiles } = await supabase.from("public_profiles").select("id, display_name").in("id", [...opponentIds]);
          (oppProfiles ?? []).forEach((p: Record<string, unknown>) => opponentMap.set(p.id as string, (p.display_name as string) ?? "Jogador"));
        }

        let played = 0, won = 0, lost = 0, setsWon = 0, points = 0;
        const allMatches: RecentMatch[] = [];

        const processMatch = (
          p1Id: string, p2Id: string,
          s1p1: number | null, s1p2: number | null,
          s2p1: number | null, s2p2: number | null,
          sup1: number | null, sup2: number | null,
          winnerId: string | null,
          matchId: string,
          createdAt: string,
          tournamentName: string | null,
        ) => {
          if (!winnerId) return;
          played++;
          const isP1 = p1Id === profile.id;
          const oppId = isP1 ? p2Id : p1Id;
          const oppName = opponentMap.get(oppId) ?? "Jogador";

          const scoreResult = computePoints({ set1P1: s1p1, set1P2: s1p2, set2P1: s2p1, set2P2: s2p2, supP1: sup1, supP2: sup2 });
          const myPoints = isP1 ? scoreResult.p1Points : scoreResult.p2Points;

          let p1Sets = 0, p2Sets = 0;
          const n1p1 = s1p1 ?? 0, n1p2 = s1p2 ?? 0, n2p1 = s2p1 ?? 0, n2p2 = s2p2 ?? 0;
          if (n1p1 > n1p2) p1Sets++; else if (n1p2 > n1p1) p2Sets++;
          if (n2p1 > n2p2) p1Sets++; else if (n2p2 > n2p1) p2Sets++;
          const mySets = isP1 ? p1Sets : p2Sets;
          setsWon += mySets;
          if (winnerId === profile.id) won++; else lost++;
          points += myPoints;

          allMatches.push({
            id: matchId,
            opponentName: oppName,
            score: `${s1p1 ?? 0}-${s1p2 ?? 0} ${s2p1 ?? 0}-${s2p2 ?? 0}`,
            result: winnerId === profile.id ? "win" : "loss",
            tournamentName,
            date: createdAt,
          });
        };

        (groupMatches.data ?? []).forEach((m: Record<string, unknown>) => {
          processMatch(
            m.player1_id as string, m.player2_id as string,
            m.set1_p1 as number | null, m.set1_p2 as number | null,
            m.set2_p1 as number | null, m.set2_p2 as number | null,
            m.sup_p1 as number | null, m.sup_p2 as number | null,
            m.winner_id as string | null, m.id as string, m.created_at as string, null,
          );
        });

        (playoffMatches.data ?? []).forEach((m: Record<string, unknown>) => {
          processMatch(
            m.player1_id as string, m.player2_id as string,
            m.set1_p1 as number | null, m.set1_p2 as number | null,
            m.set2_p1 as number | null, m.set2_p2 as number | null,
            m.sup_p1 as number | null, m.sup_p2 as number | null,
            m.winner_id as string | null, m.id as string, m.created_at as string, m.stage as string,
          );
        });

        (rankingMatches.data ?? []).forEach((m: Record<string, unknown>) => {
          processMatch(
            m.player1_id as string, m.player2_id as string,
            m.set1_p1 as number | null, m.set1_p2 as number | null,
            m.set2_p1 as number | null, m.set2_p2 as number | null,
            m.sup_p1 as number | null, m.sup_p2 as number | null,
            m.winner_id as string | null, m.id as string, m.created_at as string, "Ranking",
          );
        });

        setStats({ played, won, lost, setsWon, points, position: 0 });
        setRecent(allMatches.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5));
      } catch (err) {
        console.error("Dashboard data load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, profile]);

  if (authLoading) {
    return (
      <AppShell>
        <div className="grid place-items-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md py-20 text-center">
          <h2 className="font-display text-lg font-bold">Perfil nao carregado</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nao foi possivel carregar seu perfil. Tente novamente.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              window.location.reload();
            }}
          >
            Recarregar
          </Button>
        </div>
      </AppShell>
    );
  }

  const initials = (profile?.display_name || profile?.full_name || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center gap-4">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="size-16 rounded-xl object-cover ring-1 ring-border" />
          ) : (
            <div className="grid size-16 place-items-center rounded-xl bg-secondary font-display text-xl font-bold text-white ring-1 ring-border">
              {initials}
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Ola, {profile?.display_name || profile?.full_name?.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground">
              {profile?.role === "admin" ? "Administrador" : "Jogador"}
            </p>
          </div>
        </header>

        {loading ? (
          <div className="grid place-items-center py-20">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard icon={<TrendingUp className="size-4" />} label="Posicao" value={stats ? `#${stats.position || "-"}` : "-"} />
              <StatCard icon={<Target className="size-4" />} label="Pontos" value={String(stats?.points ?? 0)} />
              <StatCard icon={<Trophy className="size-4" />} label="Partidas" value={String(stats?.played ?? 0)} />
              <StatCard icon={<Award className="size-4" />} label="Vitorias" value={String(stats?.won ?? 0)} />
              <StatCard icon={<Award className="size-4" />} label="Derrotas" value={String(stats?.lost ?? 0)} />
              <StatCard icon={<Target className="size-4" />} label="Sets vencidos" value={String(stats?.setsWon ?? 0)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-4 font-display text-lg font-bold">Ultimos resultados</h2>
                  {recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma partida jogada ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {recent.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{m.opponentName}</p>
                            <p className="text-xs text-muted-foreground">{m.tournamentName ?? "Ranking"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-sm font-bold tabular-nums">{m.score}</span>
                            <span className={cn(
                              "rounded px-2 py-0.5 text-xs font-bold",
                              m.result === "win" ? "bg-primary/15 text-secondary" : "bg-destructive/10 text-destructive",
                            )}>
                              {m.result === "win" ? "V" : "D"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tabela do Torneio — ao lado dos Últimos Resultados */}
              <HomeTournamentSection />
            </div>
          </>
        )}

        {/* Ranking table — real data from the database */}
        <section className="mt-8">
          <HomeRankingSection />
        </section>

        {/* Amistosos — invites, stats, rivalities */}
        <section className="mt-8">
          <HomeFriendlySection />
        </section>

        {/* Histórico de Torneios */}
        <section className="mt-8">
          <Link to="/historico-torneios">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="grid size-12 place-items-center rounded-xl bg-secondary/10">
                  <History className="size-6 text-secondary" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold">Historico de Torneios</p>
                  <p className="text-sm text-muted-foreground">Veja os resultados dos torneios finalizados.</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 font-display text-xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}
