import { useEffect, useState } from "react";
import { Trophy, ArrowLeft, Crown, Users, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type HistoryEntry = {
  id: string;
  tournament_name: string;
  finalized_date: string;
  participant_count: number;
  champion_name: string | null;
  final_standings: StandingRow[];
  playoff_results: PlayoffResultRow[];
};

type StandingRow = {
  player_id: string;
  display_name: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  points: number;
  played: number;
  group_label: string;
};

type PlayoffResultRow = {
  stage: string;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  set1_p1: number | null;
  set1_p2: number | null;
};

export function TournamentHistoryPage() {
  const supabase = getSupabase();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase
        .from("tournament_history")
        .select("id, tournament_name, finalized_date, participant_count, champion_name, final_standings, playoff_results")
        .order("finalized_date", { ascending: false });
      setEntries((data ?? []) as unknown as HistoryEntry[]);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) {
    return (
      <AppShell>
        <div className="grid place-items-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar
        </Link>

        <header className="mb-6 flex items-center gap-3">
          <Trophy className="size-7 text-secondary" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Historico de Torneios</h1>
        </header>

        {entries.length === 0 ? (
          <Card>
            <CardContent className="grid place-items-center py-16 text-center">
              <Trophy className="size-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhum torneio finalizado ainda.
              </p>
            </CardContent>
          </Card>
        ) : selected ? (
          <HistoryDetail entry={selected} onBack={() => setSelected(null)} />
        ) : (
          <div className="grid gap-4">
            {entries.map((e) => (
              <Card
                key={e.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setSelected(e)}
              >
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className="grid size-12 place-items-center rounded-xl bg-secondary/10">
                      <Trophy className="size-6 text-secondary" />
                    </div>
                    <div>
                      <p className="font-display text-lg font-bold">{e.tournament_name}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3.5" />
                          {new Date(e.finalized_date).toLocaleDateString("pt-BR")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="size-3.5" />
                          {e.participant_count} participantes
                        </span>
                      </div>
                    </div>
                  </div>
                  {e.champion_name && (
                    <div className="flex items-center gap-2">
                      <Crown className="size-5 text-secondary" />
                      <span className="font-display text-sm font-bold text-secondary">{e.champion_name}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function HistoryDetail({ entry, onBack }: { entry: HistoryEntry; onBack: () => void }) {
  const standings = entry.final_standings ?? [];
  const playoffs = entry.playoff_results ?? [];

  const stageLabels: Record<string, string> = {
    quarterfinal: "Quartas de Final",
    semifinal: "Semifinais",
    final: "Final",
  };

  const playerName = (id: string | null) =>
    standings.find((s) => s.player_id === id)?.display_name ?? "Jogador";

  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="w-fit">
        <ArrowLeft className="size-4" /> Voltar para a lista
      </Button>

      {entry.champion_name && (
        <Card className="border-secondary/30 bg-secondary/5">
          <CardContent className="flex items-center gap-3 p-5">
            <Crown className="size-8 text-secondary" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campeao</p>
              <p className="font-display text-xl font-bold text-secondary">{entry.champion_name}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 font-display text-lg font-bold">Classificacao Final</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Jogador</TableHead>
                <TableHead className="text-center">Grupo</TableHead>
                <TableHead className="text-center">J</TableHead>
                <TableHead className="text-center">V</TableHead>
                <TableHead className="text-center">D</TableHead>
                <TableHead className="text-center">Pts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((s, i) => (
                <TableRow key={s.player_id} className={i < 3 ? "bg-primary/[.04]" : ""}>
                  <TableCell className="text-center font-display font-bold">{i + 1}</TableCell>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      {s.avatar_url && <img src={s.avatar_url} alt="" className="size-5 rounded object-cover" />}
                      {s.display_name}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{s.group_label}</TableCell>
                  <TableCell className="text-center">{s.played}</TableCell>
                  <TableCell className="text-center">{s.wins}</TableCell>
                  <TableCell className="text-center">{s.losses}</TableCell>
                  <TableCell className="text-center font-display font-bold text-secondary">{s.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {playoffs.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 font-display text-lg font-bold">Mata-mata</h2>
            {["quarterfinal", "semifinal", "final"].map((stage) => {
              const matches = playoffs.filter((m) => m.stage === stage);
              if (matches.length === 0) return null;
              return (
                <div key={stage} className="mb-4">
                  <h3 className="mb-3 font-display text-base font-bold">{stageLabels[stage]}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {matches.map((m) => (
                      <div key={`${m.stage}-${m.match_number}`} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between text-sm font-semibold">
                          <span className={m.winner_id === m.player1_id ? "text-secondary" : ""}>
                            {playerName(m.player1_id)}
                          </span>
                          <span className="font-display text-lg font-bold tabular-nums">
                            {m.set1_p1 !== null ? `${m.set1_p1} x ${m.set1_p2}` : "- x -"}
                          </span>
                          <span className={m.winner_id === m.player2_id ? "text-secondary" : ""}>
                            {playerName(m.player2_id)}
                          </span>
                        </div>
                        {m.winner_id && (
                          <p className="mt-2 text-center text-xs font-bold text-secondary">
                            Vencedor: {playerName(m.winner_id)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
