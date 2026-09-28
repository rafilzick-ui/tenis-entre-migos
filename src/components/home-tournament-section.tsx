import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Users, Calendar, ChevronRight } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TournamentItem = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  registration_count: number;
};

type GroupStanding = {
  player_id: string;
  display_name: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  points: number;
  sets_won: number;
  played: number;
};

const STATUS_LABELS: Record<string, string> = {
  registration: "Inscricoes abertas",
  groups_drawn: "Grupos sorteados",
  playoffs: "Mata-mata",
  complete: "Concluido",
};

export function HomeTournamentSection() {
  const supabase = getSupabase();
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [activeTournament, setActiveTournament] = useState<TournamentItem | null>(null);
  const [standingsByGroup, setStandingsByGroup] = useState<{ label: string; rows: GroupStanding[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("tournaments_meta")
          .select("id, name, status, start_date, end_date")
          .order("created_at", { ascending: false });

        if (error || !data || data.length === 0) {
          setLoading(false);
          return;
        }

        const items: TournamentItem[] = [];
        for (const t of data) {
          const { count } = await supabase
            .from("tournament_registrations")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", t.id);
          items.push({
            id: t.id,
            name: t.name,
            status: t.status,
            start_date: t.start_date,
            end_date: t.end_date,
            registration_count: count ?? 0,
          });
        }
        setTournaments(items);

        const active = items.find((t) => t.status !== "complete") ?? items[0] ?? null;
        setActiveTournament(active);

        if (active && (active.status === "groups_drawn" || active.status === "playoffs")) {
          const { data: groupsData } = await supabase
            .from("tournament_groups")
            .select("id, group_label")
            .eq("tournament_id", active.id)
            .order("group_label", { ascending: true });

          const groupStandings: { label: string; rows: GroupStanding[] }[] = [];
          for (const g of groupsData ?? []) {
            const { data: standingsData } = await supabase.rpc("get_group_standings", { p_group_id: g.id });
            if (standingsData) {
              groupStandings.push({
                label: g.group_label,
                rows: (standingsData as Record<string, unknown>[]).map((s) => ({
                  player_id: s.player_id as string,
                  display_name: s.display_name as string,
                  avatar_url: s.avatar_url as string | null,
                  wins: s.wins as number,
                  losses: s.losses as number,
                  points: s.points as number,
                  sets_won: s.sets_won as number,
                  played: s.played as number,
                })),
              });
            }
          }
          setStandingsByGroup(groupStandings);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  if (loading) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-12">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  if (tournaments.length === 0) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-12 text-center">
          <Trophy className="size-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhum torneio disponivel ainda.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Tournament list */}
      {tournaments.slice(0, 4).map((t) => (
        <Link key={t.id} to={`/torneios/${t.id}`}>
          <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <h3 className="truncate font-display text-base font-bold">{t.name}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="size-3" /> {t.registration_count} inscritos</span>
                  {t.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(t.start_date).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-secondary">
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </div>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ))}

      {/* Active tournament standings */}
      {activeTournament && standingsByGroup.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b px-5 py-4">
              <Trophy className="size-5 text-secondary" />
              <h2 className="font-display text-lg font-bold">{activeTournament.name} - Classificacao</h2>
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {standingsByGroup.map((group) => (
                <div key={group.label}>
                  <h3 className="mb-2 px-2 font-display text-sm font-bold text-muted-foreground">
                    Grupo {group.label}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-center">#</TableHead>
                        <TableHead>Jogador</TableHead>
                        <TableHead className="text-center">J</TableHead>
                        <TableHead className="text-center">V</TableHead>
                        <TableHead className="text-center">Pts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                            Sem partidas concluidas.
                          </TableCell>
                        </TableRow>
                      ) : (
                        group.rows.map((row, i) => (
                          <TableRow key={row.player_id} className={i < 2 ? "bg-primary/[.04]" : ""}>
                            <TableCell className="text-center font-display font-bold">{i + 1}</TableCell>
                            <TableCell className="font-semibold">
                              <div className="flex items-center gap-2">
                                {row.avatar_url && (
                                  <img src={row.avatar_url} alt="" className="size-5 rounded object-cover" />
                                )}
                                {row.display_name}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{row.played}</TableCell>
                            <TableCell className="text-center">{row.wins}</TableCell>
                            <TableCell className="text-center font-display font-bold text-secondary">{row.points}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
