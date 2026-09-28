import { useMemo, useState } from "react";
import { ArrowRight, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OfficialLogo } from "@/components/official-logo";
import { Textarea } from "@/components/ui/textarea";
import { RulesLink } from "@/components/tournament/tournament-format-info";

const DEFAULT_PLAYERS = Array.from({ length: 17 }, (_, index) => `Player ${index + 1}`).join("\n");

export function SetupView({
  onCreate,
  onImport,
}: {
  onCreate: (name: string, players: string[]) => void;
  onImport: () => void;
}) {
  const [name, setName] = useState("Torneio entre Amigos");
  const [playersText, setPlayersText] = useState(DEFAULT_PLAYERS);
  const players = useMemo(
    () => playersText.split("\n").map((value) => value.trim()).filter(Boolean),
    [playersText],
  );
  const unique = new Set(players.map((player) => player.toLocaleLowerCase())).size === players.length;
  const valid = players.length >= 8 && players.length <= 64 && unique && name.trim().length > 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="grid gap-6">
      <Card className="w-full overflow-hidden">
        <CardContent className="grid p-0 lg:grid-cols-[.8fr_1.2fr]">
          <div className="relative overflow-hidden border-b border-border bg-secondary p-8 text-white lg:border-b-0 lg:border-r sm:p-10">
            <div className="absolute -bottom-24 -right-20 size-72 rounded-full border-[45px] border-primary/8" />
            <OfficialLogo className="size-11 shrink-0 rounded-lg object-contain" />
            <p className="mt-10 text-xs font-semibold uppercase tracking-[.2em] opacity-70">Tournament control</p>
            <h1 className="mt-3 max-w-md font-display text-4xl font-black leading-[.95] tracking-[-.045em] sm:text-6xl">
              Run the whole event from one screen.
            </h1>
            <div className="mt-10 grid gap-4 text-sm font-semibold sm:grid-cols-2 lg:grid-cols-1">
              <div><span className="block font-display text-2xl font-black">BO3</span>Round robin</div>
              <div><span className="block font-display text-2xl font-black">Top 8</span>Playoff bracket</div>
              <div className="flex items-center gap-2"><Cloud className="size-5" />Optional live sharing</div>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-secondary">New tournament</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Add the field</h2>
              <p className="mt-1 text-sm text-muted-foreground">One player per line. Names can be corrected later without losing results.</p>
            </div>

            <div className="mt-7 grid gap-5">
              <label className="grid gap-2 text-sm font-semibold">
                Tournament name
                <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Players
                <Textarea className="min-h-64 font-mono text-sm leading-6" value={playersText} onChange={(event) => setPlayersText(event.target.value)} spellCheck={false} />
                <span className="flex justify-between text-xs font-normal text-muted-foreground">
                  <span>{unique ? "Minimum 8 players" : "Names must be unique"}</span>
                  <strong className={players.length < 8 || !unique ? "text-destructive" : "text-foreground"}>{players.length} players</strong>
                </span>
              </label>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={onImport}>Import JSON backup</Button>
              <Button type="button" size="lg" disabled={!valid} onClick={() => onCreate(name.trim(), players)}>
                Create tournament <ArrowRight />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <RulesLink />
      </div>
    </main>
  );
}
