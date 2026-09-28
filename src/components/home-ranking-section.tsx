import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type RankingRow = {
  player_id: string;
  display_name: string;
  avatar_url: string | null;
  played: number;
  won: number;
  lost: number;
  sets_won: number;
  points: number;
};

type RoundData = {
  id: string;
  round_number: number;
  status: string;
  matches: MatchData[];
};

type MatchData = {
  id: string;
  round_id: string;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  set1_p1: number | null;
  set1_p2: number | null;
  set2_p1: number | null;
  set2_p2: number | null;
  sup_p1: number | null;
  sup_p2: number | null;
  winner_id: string | null;
};

export function HomeRankingSection() {
  const supabase = getSupabase();
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        const { data: roundsData } = await supabase
          .from("ranking_rounds")
          .select("id, round_number, status")
          .order("round_number", { ascending: true });

        const { data: matchesData } = await supabase
          .from("ranking_matches")
          .select("id, round_id, match_number, player1_id, player2_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, winner_id")
          .order("match_number", { ascending: true });

        const { data: profilesData } = await supabase
          .from("public_profiles")
          .select("id, display_name, avatar_url");

        const profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
        (profilesData ?? []).forEach((p: Record<string, unknown>) => {
          profileMap.set(p.id as string, {
            display_name: (p.display_name as string) ?? "",
            avatar_url: (p.avatar_url as string | null) ?? null,
          });
        });

        const rounds: RoundData[] = (roundsData ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          round_number: r.round_number as number,
          status: r.status as string,
          matches: (matchesData ?? [])
            .filter((m: Record<string, unknown>) => m.round_id === r.id)
            .map((m: Record<string, unknown>) => ({
              id: m.id as string,
              round_id: m.round_id as string,
              match_number: m.match_number as number,
              player1_id: m.player1_id as string | null,
              player2_id: m.player2_id as string | null,
              set1_p1: m.set1_p1 as number | null,
              set1_p2: m.set1_p2 as number | null,
              set2_p1: m.set2_p1 as number | null,
              set2_p2: m.set2_p2 as number | null,
              sup_p1: m.sup_p1 as number | null,
              sup_p2: m.sup_p2 as number | null,
              winner_id: m.winner_id as string | null,
            })),
        }));

        const rankingMap = new Map<string, RankingRow>();
        rounds.forEach((round) => {
          round.matches.forEach((m) => {
            if (!m.winner_id || !m.player1_id || !m.player2_id) return;
            const p1Info = profileMap.get(m.player1_id);
            const p2Info = profileMap.get(m.player2_id);
            if (!p1Info || !p2Info) return;

            [m.player1_id, m.player2_id].forEach((pid, idx) => {
              if (!pid) return;
              const info = profileMap.get(pid);
              if (!info) return;
              if (!rankingMap.has(pid)) {
                rankingMap.set(pid, {
                  player_id: pid,
                  display_name: info.display_name,
                  avatar_url: info.avatar_url,
                  played: 0, won: 0, lost: 0, sets_won: 0, points: 0,
                });
              }
              const row = rankingMap.get(pid)!;
              row.played++;
              const isWinner = m.winner_id === pid;
              if (isWinner) { row.won++; row.points += 18; } else { row.lost++; }
              const s1p1 = m.set1_p1, s1p2 = m.set1_p2, s2p1 = m.set2_p1, s2p2 = m.set2_p2;
              const sup1 = m.sup_p1, sup2 = m.sup_p2;
              let p1Sets = 0, p2Sets = 0;
              if (s1p1 !== null && s1p2 !== null) { if (s1p1 > s1p2) p1Sets++; else if (s1p2 > s1p1) p2Sets++; }
              if (s2p1 !== null && s2p2 !== null) { if (s2p1 > s2p2) p1Sets++; else if (s2p2 > s2p1) p2Sets++; }
              if (p1Sets === 1 && p2Sets === 1 && sup1 !== null && sup2 !== null) {
                if (sup1 > sup2) p1Sets++; else if (sup2 > sup1) p2Sets++;
              }
              const mySets = idx === 0 ? p1Sets : p2Sets;
              row.sets_won += mySets;
              if (!isWinner && mySets >= 1) row.points += 9;
            });
          });
        });

        const sorted = [...rankingMap.values()].sort(
          (a, b) => b.points - a.points || b.won - a.won || b.sets_won - a.sets_won
        );
        setRankings(sorted);
      } catch {
        setRankings([]);
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

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <BarChart3 className="size-5 text-secondary" />
          <h2 className="font-display text-lg font-bold">Ranking</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Jogador</TableHead>
              <TableHead className="text-center">J</TableHead>
              <TableHead className="text-center">V</TableHead>
              <TableHead className="text-center">D</TableHead>
              <TableHead className="text-center">Sets</TableHead>
              <TableHead className="text-center">Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma partida disputada ainda.
                </TableCell>
              </TableRow>
            ) : (
              rankings.map((row, i) => (
                <TableRow key={row.player_id} className={i < 3 ? "bg-primary/[.04]" : ""}>
                  <TableCell className="text-center font-display font-bold">{i + 1}</TableCell>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      {row.avatar_url && (
                        <img src={row.avatar_url} alt="" className="size-6 rounded object-cover" />
                      )}
                      {row.display_name}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{row.played}</TableCell>
                  <TableCell className="text-center">{row.won}</TableCell>
                  <TableCell className="text-center">{row.lost}</TableCell>
                  <TableCell className="text-center">{row.sets_won}</TableCell>
                  <TableCell className="text-center font-display font-bold text-secondary">{row.points}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
