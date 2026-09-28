import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { canEnterSup } from "@/lib/scoring";

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
  player1_name: string;
  player2_name: string;
  set1_p1: number | null;
  set1_p2: number | null;
  set2_p1: number | null;
  set2_p2: number | null;
  sup_p1: number | null;
  sup_p2: number | null;
  winner_id: string | null;
};

type RankingReg = {
  id: string;
  status: string;
  created_at: string;
};

type RankingMeta = {
  status: string;
};

export function RankingPage() {
  const { profile } = useAuth();
  const supabase = getSupabase();
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [myReg, setMyReg] = useState<RankingReg | null>(null);
  const [rankingStatus, setRankingStatus] = useState<string>("not_started");
  const [registering, setRegistering] = useState(false);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      await loadData();
      setLoading(false);
    })();
  }, [supabase]);

  async function loadData() {
    if (!supabase) return;

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

    // Load my registration
    if (profile) {
      const { data: regData } = await supabase
        .from("ranking_registrations")
        .select("id, status, created_at")
        .eq("player_id", profile.id)
        .maybeSingle();
      setMyReg(regData as RankingReg | null);
    }

    // Load ranking status
    const { data: meta } = await supabase
      .from("ranking_meta")
      .select("status")
      .eq("id", 1)
      .maybeSingle();
    setRankingStatus((meta as RankingMeta | null)?.status ?? "not_started");

    const profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
    (profilesData ?? []).forEach((p: Record<string, unknown>) => {
      profileMap.set(p.id as string, { display_name: (p.display_name as string) ?? "", avatar_url: (p.avatar_url as string | null) ?? null });
    });

    const rounds: RoundData[] = (roundsData ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      round_number: r.round_number as number,
      status: r.status as string,
      matches: (matchesData ?? [])
        .filter((m: Record<string, unknown>) => m.round_id === r.id)
        .map((m: Record<string, unknown>) => ({
          id: m.id as string,
          match_number: m.match_number as number,
          player1_id: m.player1_id as string | null,
          player2_id: m.player2_id as string | null,
          player1_name: m.player1_id ? (profileMap.get(m.player1_id as string)?.display_name ?? "Jogador") : "A definir",
          player2_name: m.player2_id ? (profileMap.get(m.player2_id as string)?.display_name ?? "Jogador") : "A definir",
          set1_p1: m.set1_p1 as number | null,
          set1_p2: m.set1_p2 as number | null,
          set2_p1: m.set2_p1 as number | null,
          set2_p2: m.set2_p2 as number | null,
          sup_p1: m.sup_p1 as number | null,
          sup_p2: m.sup_p2 as number | null,
          winner_id: m.winner_id as string | null,
        })),
    }));

    setRounds(rounds);

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
            rankingMap.set(pid, { player_id: pid, display_name: info.display_name, avatar_url: info.avatar_url, played: 0, won: 0, lost: 0, sets_won: 0, points: 0 });
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

    const sorted = [...rankingMap.values()].sort((a, b) => b.points - a.points || b.won - a.won || b.sets_won - a.sets_won);
    setRankings(sorted);
  }

  async function saveMatchScore(match: MatchData, s1p1: number, s1p2: number, s2p1: number, s2p2: number, sup1: number | null, sup2: number | null) {
    if (!supabase || !match.player1_id || !match.player2_id) return;
    const { error } = await supabase.rpc("save_match_result", {
      p_match_type: "ranking",
      p_match_id: match.id,
      p_set1_p1: s1p1,
      p_set1_p2: s1p2,
      p_set2_p1: s2p1,
      p_set2_p2: s2p2,
      p_sup_p1: sup1 ?? null,
      p_sup_p2: sup2 ?? null,
    });
    if (error) { toast.error(error.message ?? "Erro ao salvar resultado"); return; }
    toast.success("Resultado salvo");
    // Check if the round is now complete
    if (match.round_id) {
      await supabase.rpc("check_round_complete", { p_round_id: match.round_id });
    }
    await loadData();
  }

  async function registerForRanking() {
    if (!supabase || !profile) return;
    setRegistering(true);
    const { error } = await supabase
      .from("ranking_registrations")
      .insert({ player_id: profile.id });
    setRegistering(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Voce ja esta inscrito no ranking");
      } else {
        toast.error(error.message ?? "Erro ao se inscrever");
      }
      return;
    }
    toast.success("Inscricao enviada! Aguarde aprovacao.");
    setMyReg({ id: "pending", status: "pending", created_at: new Date().toISOString() });
  }

  if (loading) {
    return <div className="grid place-items-center py-20"><div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  // Filter "Minhas partidas" for non-admin players
  const myMatches: { round: RoundData; match: MatchData }[] = [];
  if (!isAdmin && profile) {
    for (const round of rounds) {
      for (const match of round.matches) {
        if (match.player1_id === profile.id || match.player2_id === profile.id) {
          myMatches.push({ round, match });
        }
      }
    }
  }

  // Determine which rounds/matches to show in the "Rounds" section
  const visibleRounds = isAdmin
    ? rounds
    : []; // Players see their matches in "Minhas partidas" section, not all rounds

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center gap-3">
        <BarChart3 className="size-7 text-secondary" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Ranking</h1>
        {rankingStatus === "active" && (
          <span className="rounded-md bg-secondary/15 px-2 py-0.5 text-xs font-semibold text-secondary">Ativo</span>
        )}
      </header>

      {/* Registration section — for non-admin players, only when ranking is active */}
      {!isAdmin && profile && rankingStatus === "active" && (
        <Card className="mb-6 border-primary/20">
          <CardContent className="p-5">
            {!myReg ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  O ranking esta aberto! Faca sua inscricao para participar.
                </p>
                <Button className="mt-4" onClick={registerForRanking} disabled={registering}>
                  {registering ? "Enviando..." : "Inscrever-se no Ranking"}
                </Button>
              </div>
            ) : myReg.status === "pending" ? (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="size-5 text-primary" />
                <span className="font-semibold">Inscricao pendente</span>
                <span className="text-muted-foreground">— aguarde aprovacao do administrador.</span>
              </div>
            ) : myReg.status === "approved" ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-5 text-secondary" />
                <span className="font-semibold">Inscricao aprovada</span>
                <span className="text-muted-foreground">— voce esta participando do ranking.</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Sua inscricao foi recusada. Entre em contato com o administrador.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ranking table — visible to all */}
      <Card className="mb-6">
        <CardContent className="p-0">
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
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Nenhuma partida disputada ainda.</TableCell></TableRow>
              ) : rankings.map((row, i) => (
                <TableRow key={row.player_id} className={i < 3 ? "bg-primary/[.04]" : ""}>
                  <TableCell className="text-center font-display font-bold">{i + 1}</TableCell>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      {row.avatar_url && <img src={row.avatar_url} alt="" className="size-6 rounded object-cover" />}
                      {row.display_name}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{row.played}</TableCell>
                  <TableCell className="text-center">{row.won}</TableCell>
                  <TableCell className="text-center">{row.lost}</TableCell>
                  <TableCell className="text-center">{row.sets_won}</TableCell>
                  <TableCell className="text-center font-display font-bold text-secondary">{row.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* "Minhas partidas" — only for non-admin players */}
      {!isAdmin && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-4 font-display text-lg font-bold">Minhas partidas</h2>
            {myMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Voce nao tem partidas no ranking ainda.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {myMatches.map(({ round, match }) => (
                  <MatchScoreCard
                    key={match.id}
                    match={match}
                    roundNumber={round.round_number}
                    canEdit={true}
                    onSave={saveMatchScore}
                    isMyMatch={true}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* All rounds — admin only */}
      {isAdmin && (
        <div className="grid gap-4">
          {visibleRounds.map((round) => (
            <Card key={round.id}>
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Rodada {round.round_number}</h2>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {round.status === "open" ? "Aberta" : round.status === "in_progress" ? "Em andamento" : "Concluida"}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {round.matches.map((m) => (
                    <MatchScoreCard key={m.id} match={m} canEdit={isAdmin} onSave={saveMatchScore} isMyMatch={false} />
                  ))}
                  {round.matches.length === 0 && (
                    <p className="col-span-2 py-4 text-center text-sm text-muted-foreground">
                      Partidas nao sorteadas ainda.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {visibleRounds.length === 0 && (
            <Card>
              <CardContent className="grid place-items-center py-16 text-center">
                <BarChart3 className="size-12 text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">
                  O ranking sera iniciado pelo administrador.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function MatchScoreCard({ match, roundNumber, canEdit, onSave, isMyMatch }: {
  match: MatchData;
  roundNumber?: number;
  canEdit: boolean;
  onSave: (m: MatchData, s1p1: number, s1p2: number, s2p1: number, s2p2: number, sup1: number | null, sup2: number | null) => void;
  isMyMatch: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [s1p1, setS1p1] = useState(match.set1_p1?.toString() ?? "");
  const [s1p2, setS1p2] = useState(match.set1_p2?.toString() ?? "");
  const [s2p1, setS2p1] = useState(match.set2_p1?.toString() ?? "");
  const [s2p2, setS2p2] = useState(match.set2_p2?.toString() ?? "");
  const [sup1, setSup1] = useState(match.sup_p1?.toString() ?? "");
  const [sup2, setSup2] = useState(match.sup_p2?.toString() ?? "");

  const showSup = canEnterSup({
    set1P1: s1p1 ? parseInt(s1p1) : null,
    set1P2: s1p2 ? parseInt(s1p2) : null,
    set2P1: s2p1 ? parseInt(s2p1) : null,
    set2P2: s2p2 ? parseInt(s2p2) : null,
  });

  function handleSave() {
    const n1p1 = parseInt(s1p1) || 0;
    const n1p2 = parseInt(s1p2) || 0;
    const n2p1 = parseInt(s2p1) || 0;
    const n2p2 = parseInt(s2p2) || 0;
    const nsup1 = showSup && sup1 ? parseInt(sup1) : null;
    const nsup2 = showSup && sup2 ? parseInt(sup2) : null;
    onSave(match, n1p1, n1p2, n2p1, n2p2, nsup1, nsup2);
    setEditing(false);
  }

  const hasResult = match.winner_id !== null;
  const myId = isMyMatch ? (match.player1_id === match.winner_id ? match.player1_id : match.player2_id) : null;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className={match.winner_id === match.player1_id ? "text-secondary" : ""}>{match.player1_name}</span>
        <span className="text-xs text-muted-foreground">
          {roundNumber ? `Rodada ${roundNumber}` : `Partida ${match.match_number}`}
        </span>
        <span className={match.winner_id === match.player2_id ? "text-secondary" : ""}>{match.player2_name}</span>
      </div>

      {!editing ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">1 set</p>
              <p className="font-display text-lg font-bold tabular-nums">
                {match.set1_p1 !== null ? `${match.set1_p1} x ${match.set1_p2}` : "- x -"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">2 set</p>
              <p className="font-display text-lg font-bold tabular-nums">
                {match.set2_p1 !== null ? `${match.set2_p1} x ${match.set2_p2}` : "- x -"}
              </p>
            </div>
          </div>
          {match.sup_p1 !== null && (
            <p className="mt-2 text-center text-xs font-semibold text-secondary">SUP: {match.sup_p1} x {match.sup_p2}</p>
          )}
          {match.winner_id && (
            <p className="mt-2 text-center text-xs font-bold text-secondary">
              Vencedor: {match.winner_id === match.player1_id ? match.player1_name : match.player2_name}
            </p>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setEditing(true)}>
              {hasResult ? "Editar resultado" : "Lancar resultado"}
            </Button>
          )}
        </>
      ) : (
        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              1 set - {match.player1_name}
              <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={s1p1} onChange={(e) => setS1p1(e.target.value)} />
            </label>
            <label className="text-xs">
              1 set - {match.player2_name}
              <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={s1p2} onChange={(e) => setS1p2(e.target.value)} />
            </label>
            <label className="text-xs">
              2 set - {match.player1_name}
              <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={s2p1} onChange={(e) => setS2p1(e.target.value)} />
            </label>
            <label className="text-xs">
              2 set - {match.player2_name}
              <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={s2p2} onChange={(e) => setS2p2(e.target.value)} />
            </label>
          </div>
          {showSup && (
            <div className="grid grid-cols-2 gap-2 rounded-md bg-primary/10 p-2">
              <label className="text-xs font-semibold text-secondary">
                SUP - {match.player1_name}
                <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={sup1} onChange={(e) => setSup1(e.target.value)} />
              </label>
              <label className="text-xs font-semibold text-secondary">
                SUP - {match.player2_name}
                <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" value={sup2} onChange={(e) => setSup2(e.target.value)} />
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleSave}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
