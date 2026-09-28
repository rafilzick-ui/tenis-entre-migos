import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Match } from "@/lib/tournament-schema";
import { validScoreOptions } from "@/lib/tournament";

export function ScoreDialog({
  match,
  bestOf,
  playerName,
  open,
  onOpenChange,
  onSave,
}: {
  match: Match | null;
  bestOf: 3 | 5 | 7;
  playerName: (id: string | null) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (s1: number | null, s2: number | null) => void;
}) {
  if (!match) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter result</DialogTitle>
          <DialogDescription>{playerName(match.p1)} vs {playerName(match.p2)} · Best of {bestOf}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {validScoreOptions(bestOf).map(({ s1, s2 }) => {
            const winner = s1 > s2 ? match.p1 : match.p2;
            return (
              <Button key={`${s1}-${s2}`} variant="outline" className="h-auto justify-between px-4 py-3" onClick={() => onSave(s1, s2)}>
                <span className="text-left text-xs text-muted-foreground"><strong className="block text-base text-primary">{s1} : {s2}</strong>{playerName(winner)} wins</span>
              </Button>
            );
          })}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="destructive" disabled={match.s1 === null} onClick={() => onSave(null, null)}><Trash2 /> Clear result</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
