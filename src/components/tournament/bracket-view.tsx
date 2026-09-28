import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Network, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Match, TournamentState } from "@/lib/tournament-schema";
import { isMatchComplete, matchWinner } from "@/lib/tournament";
import { cn } from "@/lib/utils";

const CONNECTIONS = [
  ["qf-0", "sf-0"], ["qf-1", "sf-0"],
  ["qf-2", "sf-1"], ["qf-3", "sf-1"],
  ["sf-0", "final-0"], ["sf-1", "final-0"],
];

function BracketMatch({
  match,
  className,
  seeds,
  playerName,
  canEdit,
  bestOf,
  onScore,
}: {
  match: Match;
  className: string;
  seeds: string[];
  playerName: (id: string | null) => string;
  canEdit: boolean;
  bestOf: 5 | 7;
  onScore: (match: Match, bestOf: 5 | 7) => void;
}) {
  const available = Boolean(match.p1 && match.p2);
  const winner = matchWinner(match);
  const row = (id: string | null, score: number | null) => (
    <div className={cn("grid h-10 grid-cols-[24px_minmax(0,1fr)_28px] items-center gap-2 px-3", winner === id && "bg-primary/[.055] text-primary")}>
      <span className="text-[10px] font-black text-muted-foreground">{id ? seeds.indexOf(id) + 1 || "" : ""}</span>
      <span className="truncate text-sm font-semibold">{playerName(id)}</span>
      <span className="text-right font-black tabular-nums">{score ?? "–"}</span>
    </div>
  );

  return (
    <button
      type="button"
      data-bracket-id={className}
      disabled={!available || !canEdit}
      onClick={() => onScore(match, bestOf)}
      className={cn(
        "z-10 self-center overflow-hidden rounded-xl border bg-background text-left shadow-lg transition-colors",
        className,
        isMatchComplete(match) && "border-primary/30",
        available && canEdit && "hover:border-primary/50",
        !available && "opacity-55",
        available && !canEdit && "cursor-default",
      )}
    >
      {row(match.p1, match.s1)}
      <div className="border-t border-border">{row(match.p2, match.s2)}</div>
    </button>
  );
}

export function BracketView({
  state,
  canEdit,
  onScore,
  onEditSeeds,
  onCreatePlayoffs,
}: {
  state: TournamentState;
  canEdit: boolean;
  onScore: (match: Match, bestOf: 5 | 7) => void;
  onEditSeeds: () => void;
  onCreatePlayoffs: () => void;
}) {
  const bracketRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const playoffs = state.playoffs;
  const playerName = (id: string | null) => state.players.find((player) => player.id === id)?.name ?? "TBD";

  useEffect(() => {
    const bracket = bracketRef.current;
    if (!bracket || !playoffs) return;
    const draw = () => {
      const root = bracket.getBoundingClientRect();
      setPaths(CONNECTIONS.map(([fromId, toId]) => {
        const from = bracket.querySelector(`[data-bracket-id="${fromId}"]`)?.getBoundingClientRect();
        const to = bracket.querySelector(`[data-bracket-id="${toId}"]`)?.getBoundingClientRect();
        if (!from || !to) return "";
        const x1 = from.right - root.left;
        const y1 = from.top - root.top + from.height / 2;
        const x2 = to.left - root.left;
        const y2 = to.top - root.top + to.height / 2;
        const middle = (x1 + x2) / 2;
        return `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`;
      }));
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(bracket);
    return () => observer.disconnect();
  }, [playoffs]);

  if (!playoffs) {
    return (
      <Card>
        <CardContent className="grid min-h-[460px] place-items-center p-8 text-center">
          <div><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"><Network className="size-7" /></div><h2 className="mt-5 text-2xl font-bold">The bracket is waiting</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Finish the round robin—or create a provisional top-eight bracket from the current standings.</p>{canEdit ? <Button className="mt-6" onClick={onCreatePlayoffs}>Create top 8 bracket</Button> : <Badge className="mt-6" variant="outline"><LockKeyhole /> Organizer access required</Badge>}</div>
        </CardContent>
      </Card>
    );
  }

  const champion = matchWinner(playoffs.final);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between border-b border-border">
        <div><CardTitle>Playoff bracket</CardTitle><CardDescription>Quarterfinals & semifinals BO5 · Final BO7</CardDescription></div>
        {canEdit && <Button variant="outline" size="sm" onClick={onEditSeeds}>Edit playoff order</Button>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="scrollbar-thin overflow-x-auto px-5 pb-8 pt-10">
          <div ref={bracketRef} className="bracket-grid relative">
            <svg className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible" aria-hidden="true">
              {paths.map((path, index) => path && <path key={index} d={path} fill="none" stroke="var(--border)" strokeWidth="2" />)}
            </svg>
            <span className="title-qf -translate-y-7 self-start text-[11px] font-black uppercase tracking-[.14em] text-muted-foreground">Quarterfinals · BO5</span>
            <span className="title-sf -translate-y-7 self-start text-[11px] font-black uppercase tracking-[.14em] text-muted-foreground">Semifinals · BO5</span>
            <span className="title-final -translate-y-7 self-start text-[11px] font-black uppercase tracking-[.14em] text-muted-foreground">Final · BO7</span>
            {playoffs.qf.map((match, index) => <BracketMatch key={match.id} match={match} className={`qf-${index}`} seeds={playoffs.seeds} playerName={playerName} canEdit={canEdit} bestOf={5} onScore={onScore} />)}
            {playoffs.sf.map((match, index) => <BracketMatch key={match.id} match={match} className={`sf-${index}`} seeds={playoffs.seeds} playerName={playerName} canEdit={canEdit} bestOf={5} onScore={onScore} />)}
            <BracketMatch match={playoffs.final} className="final-0" seeds={playoffs.seeds} playerName={playerName} canEdit={canEdit} bestOf={7} onScore={onScore} />
          </div>
        </div>
        {champion && (
          <div className="m-5 flex items-center justify-between rounded-lg border bg-muted/50 p-5">
            <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-primary">Tournament champion</p><p className="mt-1 text-2xl font-black">{playerName(champion)}</p></div><Trophy className="size-10 text-primary" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
