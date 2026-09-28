import { ChevronRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Match, TournamentState } from "@/lib/tournament-schema";
import { calculateStandings, currentRoundNumber, isMatchComplete, matchWinner } from "@/lib/tournament";
import { cn } from "@/lib/utils";

export function RoundRobinView({
  state,
  selectedRound,
  onSelectRound,
  onScore,
  onCreatePlayoffs,
  onViewPlayoffs,
  canEdit,
}: {
  state: TournamentState;
  selectedRound: number;
  onSelectRound: (round: number) => void;
  onScore: (match: Match, bestOf: 3) => void;
  onCreatePlayoffs: () => void;
  onViewPlayoffs: () => void;
  canEdit: boolean;
}) {
  const round = state.rounds.find((candidate) => candidate.number === selectedRound) ?? state.rounds[0];
  const rows = calculateStandings(state);
  const name = (id: string | null) => state.players.find((player) => player.id === id)?.name ?? "TBD";
  const roundDone = round.matches.filter(isMatchComplete).length;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(350px,.8fr)]">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between border-b border-border">
          <div><CardTitle>Round {round.number}</CardTitle><CardDescription>{roundDone} of {round.matches.length} matches complete</CardDescription></div>
          <Button variant="outline" size="sm" onClick={() => onSelectRound(currentRoundNumber(state))}>Current round</Button>
        </CardHeader>
        <CardContent className="p-5">
          <div className="scrollbar-thin mb-4 flex gap-2 overflow-x-auto pb-2">
            {state.rounds.map((item) => (
              <button
                type="button"
                key={item.number}
                onClick={() => onSelectRound(item.number)}
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl border text-xs font-black transition-colors",
                  item.number === round.number
                    ? "border-primary bg-primary text-primary-foreground"
                    : item.matches.every(isMatchComplete)
                      ? "border-primary/30 text-primary hover:bg-primary/10"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >{item.number}</button>
            ))}
          </div>
          <div className="grid gap-2">
            {round.matches.map((match, index) => {
              const complete = isMatchComplete(match);
              const winner = matchWinner(match);
              return (
                <button
                  type="button"
                  key={match.id}
                  disabled={!canEdit}
                  onClick={() => onScore(match, 3)}
                  aria-label={`${complete ? "Edit" : "Enter"} result for ${name(match.p1)} versus ${name(match.p2)}`}
                  title={canEdit ? `${complete ? "Edit" : "Enter"} result` : "Read only"}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_70px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border bg-background/45 px-3 py-3 text-left transition-colors disabled:cursor-default disabled:opacity-100",
                    complete && "border-primary/20",
                    canEdit && "hover:border-primary/50 hover:bg-primary/[.025] focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20",
                  )}
                >
                  <span className={cn("truncate text-sm font-semibold", winner === match.p1 && "text-primary")}>{name(match.p1)}</span>
                  <span className="text-center text-lg font-black tabular-nums">{complete ? `${match.s1} : ${match.s2}` : "– : –"}</span>
                  <span className={cn("truncate text-right text-sm font-semibold", winner === match.p2 && "text-primary")}>{name(match.p2)}</span>
                  {canEdit ? <ChevronRight className="size-4 text-muted-foreground" /> : <LockKeyhole className="size-4 text-muted-foreground" />}
                  <span className="sr-only">Match {index + 1}</span>
                </button>
              );
            })}
            {round.bye && <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground"><strong className="text-foreground">{name(round.bye)}</strong> has a bye this round.</div>}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between border-b border-border">
          <div><CardTitle>Leaderboard</CardTitle><CardDescription>Top eight qualify</CardDescription></div>
          {canEdit && (
            <Button size="sm" onClick={state.playoffs ? onViewPlayoffs : onCreatePlayoffs}>{state.playoffs ? "View bracket" : "Create top 8"}</Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead className="w-10 text-center">#</TableHead><TableHead>Player</TableHead><TableHead className="text-center">P</TableHead><TableHead className="text-center">W</TableHead><TableHead className="text-center">L</TableHead><TableHead className="text-center">±</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.id} className={cn(index < 8 && "bg-primary/[.035]", index === 7 && "border-b border-primary/50")}>
                  <TableCell className="text-center font-bold text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="min-w-36 font-semibold">
                    {row.name}
                    {index < 8 && <span className="ml-2" role="img" aria-label="Top eight qualifier" title="Top eight qualifier">🏓</span>}
                  </TableCell>
                  <TableCell className="text-center">{row.played}</TableCell><TableCell className="text-center">{row.won}</TableCell><TableCell className="text-center">{row.lost}</TableCell><TableCell className="text-center">{row.gameDifference > 0 ? "+" : ""}{row.gameDifference}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t border-border p-4 text-[11px] leading-5 text-muted-foreground">Tiebreak: match wins → head-to-head → game difference → name. Seeds can be adjusted before playoffs.</p>
        </CardContent>
      </Card>
    </div>
  );
}
