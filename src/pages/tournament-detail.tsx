import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Trophy, Users, ArrowLeft, Shuffle, Check, X, ChevronRight, Swords, Crown, Flag, History } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type TournamentDetail = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_by: string;
};

type Registration = {
  id: string;
  player_id: string;
  approved: boolean;
  display_name: string;
  avatar_url: string | null;
};

type StandingRow = {
  player_id: string;
  display_name: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  points: number;
  sets_won: number;
  played: number;
};

type GroupWithMembers = {
  id: string;
  group_label: string;
  members: { player_id: string; display_name: string; avatar_url: string | null; seed_position: number }[];
  matches: GroupMatchRow[];
  standings: StandingRow[];
};

type GroupMatchRow = {
  id: string;
  player1_id: string;
  player2_id: string;
  p1_name: string;
  p2_name: string;
  score_p1: number | null;
  score_p2: number | null;
  winner_id: string | null;
};

type PlayoffMatch = {
  id: string;
  stage: string;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  p1_name: string;
  p2_name: string;
  score_p1: number | null;
  score_p2: number | null;
  winner_id: string | null;
};

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const supabase = getSupabase();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [playoffMatches, setPlayoffMatches] = useState<PlayoffMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [myReg, setMyReg] = useState<Registration | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!supabase || !id) return;
    (async () => {
      await loadData();
      setLoading(false);
    })();
  }, [supabase, id]);

  async function loadData() {
    if (!supabase || !id) return;

    const { data: t } = await supabase
      .from("tournaments_meta")
      .select("id, name, status, start_date, end_date, created_by")
      .eq("id", id)
      .maybeSingle();
    if (!t) { setLoading(false); return; }
    setTournament(t as TournamentDetail);

    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("id, player_id, approved")
      .eq("tournament_id", id);

    const playerIds = (regs ?? []).map((r: Record<string, unknown>) => r.player_id as string);
    let profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
    if (playerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", playerIds);
      (profiles ?? []).forEach((p: Record<string, unknown>) => {
        profileMap.set(p.id as string, { display_name: (p.display_name as string) ?? "", avatar_url: (p.avatar_url as string | null) ?? null });
      });
    }

    const regList: Registration[] = (regs ?? []).map((r: Record<string, unknown>) => {
      const info = profileMap.get(r.player_id as string);
      return { id: r.id as string, player_id: r.player_id as string, approved: r.approved as boolean, display_name: info?.display_name ?? "Jogador", avatar_url: info?.avatar_url ?? null };
    });
    setRegistrations(regList);
    setMyReg(regList.find((r) => r.player_id === profile?.id) ?? null);

    const { data: groupsData } = await supabase
      .from("tournament_groups")
      .select("id, group_label")
      .eq("tournament_id", id)
      .order("group_label", { ascending: true });

    const groupList: GroupWithMembers[] = [];
    for (const g of groupsData ?? []) {
      const { data: members } = await supabase
        .from("tournament_group_members")
        .select("player_id, seed_position")
        .eq("group_id", g.id)
        .order("seed_position", { ascending: true });

      const { data: matches } = await supabase
        .from("tournament_group_matches")
        .select("id, player1_id, player2_id, set1_p1, set1_p2, winner_id")
        .eq("group_id", g.id);

      const memberList = (members ?? []).map((m: Record<string, unknown>) => {
        const info = profileMap.get(m.player_id as string);
        return { player_id: m.player_id as string, display_name: info?.display_name ?? "Jogador", avatar_url: info?.avatar_url ?? null, seed_position: m.seed_position as number };
      });

      const matchList: GroupMatchRow[] = (matches ?? []).map((m: Record<string, unknown>) => {
        const p1Info = profileMap.get(m.player1_id as string);
        const p2Info = profileMap.get(m.player2_id as string);
        return {
          id: m.id as string,
          player1_id: m.player1_id as string,
          player2_id: m.player2_id as string,
          p1_name: p1Info?.display_name ?? "Jogador",
          p2_name: p2Info?.display_name ?? "Jogador",
          score_p1: m.set1_p1 as number | null,
          score_p2: m.set1_p2 as number | null,
          winner_id: m.winner_id as string | null,
        };
      });

      let standings: StandingRow[] = [];
      const { data: standingsData } = await supabase.rpc("get_group_standings", { p_group_id: g.id });
      if (standingsData) {
        standings = (standingsData as Record<string, unknown>[]).map((s) => ({
          player_id: s.player_id as string,
          display_name: s.display_name as string,
          avatar_url: s.avatar_url as string | null,
          wins: s.wins as number,
          losses: s.losses as number,
          points: s.points as number,
          sets_won: s.sets_won as number,
          played: s.played as number,
        }));
      }

      groupList.push({ id: g.id as string, group_label: g.group_label as string, members: memberList, matches: matchList, standings });
    }
    setGroups(groupList);

    const { data: playoffsData } = await supabase
      .from("tournament_playoff_matches")
      .select("id, stage, match_number, player1_id, player2_id, set1_p1, set1_p2, winner_id")
      .eq("tournament_id", id)
      .order("stage", { ascending: true })
      .order("match_number", { ascending: true });

    const playoffList: PlayoffMatch[] = (playoffsData ?? []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      stage: m.stage as string,
      match_number: m.match_number as number,
      player1_id: m.player1_id as string | null,
      player2_id: m.player2_id as string | null,
      p1_name: m.player1_id ? (profileMap.get(m.player1_id as string)?.display_name ?? "Jogador") : "A definir",
      p2_name: m.player2_id ? (profileMap.get(m.player2_id as string)?.display_name ?? "Jogador") : "A definir",
      score_p1: m.set1_p1 as number | null,
      score_p2: m.set1_p2 as number | null,
      winner_id: m.winner_id as string | null,
    }));
    setPlayoffMatches(playoffList);
  }

  async function handleRegister() {
    if (!supabase || !id || !profile) return;
    const { error } = await supabase
      .from("tournament_registrations")
      .insert({ tournament_id: id, player_id: profile.id });
    if (error) {
      if (error.code === "23505") toast.error("Voce ja esta inscrito neste torneio");
      else toast.error("Erro ao se inscrever");
      return;
    }
    toast.success("Inscricao realizada");
    await loadData();
  }

  async function handleCancelReg() {
    if (!supabase || !myReg) return;
    const { error } = await supabase
      .from("tournament_registrations")
      .delete()
      .eq("id", myReg.id);
    if (error) { toast.error("Erro ao cancelar inscricao"); return; }
    toast.success("Inscricao cancelada");
    await loadData();
  }

  async function handleApprove(regId: string, approved: boolean) {
    if (!supabase) return;
    const { error } = await supabase
      .from("tournament_registrations")
      .update({ approved })
      .eq("id", regId);
    if (error) { toast.error("Erro ao atualizar inscricao"); return; }
    toast.success(approved ? "Jogador aprovado" : "Jogador removido");
    await loadData();
  }

  async function handleDrawGroups() {
    if (!supabase || !id) return;

    // Always re-fetch approved registrations from DB — don't rely on React state
    const { data: freshRegs } = await supabase
      .from("tournament_registrations")
      .select("id, player_id, approved")
      .eq("tournament_id", id)
      .eq("approved", true);

    const approved = (freshRegs ?? []) as Record<string, unknown>[];
    if (approved.length < 4 || approved.length % 4 !== 0) {
      toast.error(`Numero de aprovados deve ser multiplo de 4 (atual: ${approved.length})`);
      return;
    }

    // Fetch skill levels for balanced draw
    const approvedIds = approved.map((r) => r.player_id as string);
    const { data: profilesData } = await supabase
      .from("public_profiles")
      .select("id, skill_level")
      .in("id", approvedIds);
    const skillMap = new Map<string, number>();
    (profilesData ?? []).forEach((p: Record<string, unknown>) => {
      skillMap.set(p.id as string, (p.skill_level as number) ?? 1);
    });

    // Sort by skill level descending, then distribute across groups (snake draft)
    const sortedBySkill = [...approved].sort((a, b) => {
      const sa = skillMap.get((a as Record<string, unknown>).player_id as string) ?? 1;
      const sb = skillMap.get((b as Record<string, unknown>).player_id as string) ?? 1;
      return sb - sa;
    });

    const numGroups = Math.ceil(sortedBySkill.length / 4);
    const labels = "ABCDEFGHIJKLMNOP".slice(0, numGroups).split("");

    // Snake draft: distribute players so skill sums are balanced
    // Round 1: A, B, C, D  |  Round 2: D, C, B, A  |  etc.
    const groups: Record<string, Record<string, unknown>[]> = {};
    labels.forEach((l) => { groups[l] = []; });
    let forward = true;
    let gIdx = 0;
    for (const player of sortedBySkill) {
      const label = labels[gIdx];
      groups[label].push(player);
      if (forward) {
        gIdx++;
        if (gIdx >= numGroups) { gIdx = numGroups - 1; forward = false; }
      } else {
        gIdx--;
        if (gIdx < 0) { gIdx = 0; forward = true; }
      }
    }

    // Clean up existing groups
    const { data: existingGroups } = await supabase
      .from("tournament_groups")
      .select("id")
      .eq("tournament_id", id);
    const existingIds = (existingGroups ?? []).map((r: Record<string, unknown>) => r.id as string);
    if (existingIds.length > 0) {
      await supabase.from("tournament_group_members").delete().in("group_id", existingIds);
    }
    await supabase.from("tournament_groups").delete().eq("tournament_id", id);

    for (let g = 0; g < numGroups; g++) {
      const label = labels[g];
      const members = groups[label];
      const { data: group } = await supabase
        .from("tournament_groups")
        .insert({ tournament_id: id, group_label: label })
        .select("id")
        .single();
      if (!group) continue;

      for (let i = 0; i < members.length; i++) {
        await supabase.from("tournament_group_members").insert({
          group_id: group.id,
          player_id: members[i].player_id as string,
          seed_position: i,
        });
      }

      // Round-robin matches within group: C(n,2)
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          await supabase.from("tournament_group_matches").insert({
            group_id: group.id,
            player1_id: members[i].player_id as string,
            player2_id: members[j].player_id as string,
          });
        }
      }
    }

    await supabase.from("tournaments_meta").update({ status: "groups_drawn" }).eq("id", id);
    toast.success("Grupos sorteados");
    await loadData();
  }

  async function handleGeneratePlayoffs() {
    if (!supabase || !id) return;
    const { error } = await supabase.rpc("generate_playoffs", { p_tournament_id: id });
    if (error) {
      toast.error(error.message ?? "Erro ao gerar mata-mata");
      return;
    }
    toast.success("Mata-mata gerado");
    await loadData();
  }

  async function handleFinalizeTournament() {
    if (!supabase || !id) return;
    setFinalizing(true);
    const { error } = await supabase.rpc("finalize_tournament", { p_tournament_id: id });
    setFinalizing(false);
    if (error) {
      toast.error(error.message ?? "Erro ao finalizar torneio");
      return;
    }
    toast.success("Torneio finalizado e salvo no historico");
    await loadData();
  }

  async function saveGroupMatchScore(match: GroupMatchRow, scoreP1: number, scoreP2: number) {
    if (!supabase) return;
    const { error } = await supabase.rpc("save_tournament_match_result", {
      p_match_type: "group",
      p_match_id: match.id,
      p_score_p1: scoreP1,
      p_score_p2: scoreP2,
    });
    if (error) { toast.error(error.message ?? "Erro ao salvar resultado"); return; }
    toast.success("Resultado salvo");
    await loadData();
  }

  async function savePlayoffMatchScore(match: PlayoffMatch, scoreP1: number, scoreP2: number) {
    if (!supabase) return;
    const { error } = await supabase.rpc("save_tournament_match_result", {
      p_match_type: "playoff",
      p_match_id: match.id,
      p_score_p1: scoreP1,
      p_score_p2: scoreP2,
    });
    if (error) { toast.error(error.message ?? "Erro ao salvar resultado"); return; }
    toast.success("Resultado salvo");
    await loadData();
  }

  if (loading) {
    return <div className="grid place-items-center py-20"><div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  if (!tournament) {
    return <div className="mx-auto max-w-2xl py-20 text-center"><p className="text-muted-foreground">Torneio nao encontrado.</p><Link to="/torneios" className="mt-4 inline-block text-secondary hover:underline">Voltar para torneios</Link></div>;
  }

  const statusLabels: Record<string, string> = {
    registration: "Inscricoes abertas",
    groups_drawn: "Grupos sorteados",
    playoffs: "Mata-mata",
    complete: "Concluido",
  };

  const allGroupMatchesComplete = groups.length > 0 && groups.every((g) => g.matches.every((m) => m.winner_id !== null));
  const hasPlayoffs = playoffMatches.length > 0;

  const qfMatches = playoffMatches.filter((m) => m.stage === "quarterfinal");
  const sfMatches = playoffMatches.filter((m) => m.stage === "semifinal");
  const finalMatches = playoffMatches.filter((m) => m.stage === "final");
  const champion = tournament.status === "complete" && finalMatches.length > 0 ? finalMatches[0] : null;

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/torneios" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Torneios
      </Link>

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{tournament.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLabels[tournament.status]}
            {tournament.start_date && ` · ${new Date(tournament.start_date).toLocaleDateString("pt-BR")}`}
          </p>
        </div>
        {isAdmin && tournament.status === "registration" && (
          <Button onClick={handleDrawGroups}>
            <Shuffle className="size-4" /> Sortear grupos
          </Button>
        )}
        {isAdmin && tournament.status === "groups_drawn" && allGroupMatchesComplete && !hasPlayoffs && (
          <Button onClick={handleGeneratePlayoffs}>
            <Swords className="size-4" /> Gerar mata-mata
          </Button>
        )}
        {isAdmin && hasPlayoffs && tournament.status !== "complete" && (
          <Button onClick={handleFinalizeTournament} disabled={finalizing}>
            <Flag className="size-4" /> {finalizing ? "Finalizando..." : "Finalizar torneio"}
          </Button>
        )}
        {tournament.status === "complete" && (
          <Link to="/historico-torneios">
            <Button variant="outline">
              <History className="size-4" /> Historico
            </Button>
          </Link>
        )}
      </header>

      {champion && champion.winner_id && (
        <Card className="mb-6 border-secondary/30 bg-secondary/5">
          <CardContent className="flex items-center gap-3 p-5">
            <Crown className="size-8 text-secondary" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campeao</p>
              <p className="font-display text-xl font-bold text-secondary">
                {champion.winner_id === champion.player1_id ? champion.p1_name : champion.p2_name}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {tournament.status === "registration" && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-4 font-display text-lg font-bold">Inscricoes</h2>
            {!myReg ? (
              <Button onClick={handleRegister}><Users className="size-4" /> Inscrever-se</Button>
            ) : (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  {myReg.avatar_url ? <img src={myReg.avatar_url} alt="" className="size-8 rounded object-cover" /> : <div className="size-8 rounded bg-secondary" />}
                  <span className="text-sm font-semibold">{myReg.display_name}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${myReg.approved ? "bg-primary/15 text-secondary" : "bg-muted text-muted-foreground"}`}>
                    {myReg.approved ? "Aprovado" : "Pendente"}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={handleCancelReg}>Cancelar</Button>
              </div>
            )}

            {isAdmin && registrations.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-muted-foreground">Inscritos ({registrations.length})</p>
                <div className="space-y-2">
                  {registrations.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {r.avatar_url ? <img src={r.avatar_url} alt="" className="size-6 rounded object-cover" /> : <div className="size-6 rounded bg-secondary" />}
                        <span className="text-sm font-medium">{r.display_name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-xs ${r.approved ? "bg-primary/15 text-secondary" : "bg-muted text-muted-foreground"}`}>
                          {r.approved ? "Aprovado" : "Pendente"}
                        </span>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          {!r.approved && <Button size="icon-sm" variant="ghost" onClick={() => handleApprove(r.id, true)} title="Aprovar"><Check className="size-4 text-secondary" /></Button>}
                          {r.approved && <Button size="icon-sm" variant="ghost" onClick={() => handleApprove(r.id, false)} title="Remover"><X className="size-4 text-destructive" /></Button>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {groups.length > 0 && (
        <>
          {/* Quadro visual dos grupos sorteados */}
          <section className="mb-6">
            <div className="mb-4">
              <h2 className="font-display text-xl font-bold tracking-tight">Grupos sorteados</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Confira a composicao dos grupos antes de acompanhar as partidas.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <Card key={`board-${g.id}`} className="overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-border bg-secondary/5 px-5 py-3">
                    <span className="grid size-7 place-items-center rounded-lg bg-secondary font-display text-sm font-bold text-brand-black">
                      {g.group_label}
                    </span>
                    <span className="font-display text-sm font-bold uppercase tracking-wide">
                      Grupo {g.group_label}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {g.members.length} jogadores
                    </span>
                  </div>
                  <CardContent className="p-4">
                    <ol className="grid gap-1.5">
                      {g.members.map((m, idx) => (
                        <li
                          key={m.player_id}
                          className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
                        >
                          <span className="w-6 shrink-0 text-right font-display text-sm font-bold tabular-nums text-muted-foreground">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span className="h-4 w-px bg-border" />
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="size-6 rounded object-cover" />
                          ) : (
                            <span className="grid size-6 place-items-center rounded bg-secondary/20 text-[10px] font-bold text-secondary">
                              {m.display_name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span className="text-sm font-semibold">{m.display_name}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Partidas da fase de grupos */}
          <div className="mb-4 flex items-center gap-2">
            <Swords className="size-5 text-secondary" />
            <h2 className="font-display text-xl font-bold tracking-tight">Partidas da fase de grupos</h2>
          </div>
          <div className="grid gap-4">
            {groups.map((g) => (
              <Card key={g.id}>
                <CardContent className="p-5">
                  <h3 className="mb-4 font-display text-lg font-bold">Grupo {g.group_label}</h3>

                  {g.standings.length > 0 && (
                    <div className="mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Jogador</TableHead>
                            <TableHead className="text-center">J</TableHead>
                            <TableHead className="text-center">V</TableHead>
                            <TableHead className="text-center">D</TableHead>
                            <TableHead className="text-center">Pts</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.standings.map((s, i) => (
                            <TableRow key={s.player_id} className={i < 2 ? "bg-primary/[.04]" : ""}>
                              <TableCell className="font-display font-bold">{i + 1}</TableCell>
                              <TableCell className="font-semibold">
                                <div className="flex items-center gap-2">
                                  {s.avatar_url && <img src={s.avatar_url} alt="" className="size-5 rounded object-cover" />}
                                  {s.display_name}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">{s.played}</TableCell>
                              <TableCell className="text-center">{s.wins}</TableCell>
                              <TableCell className="text-center">{s.losses}</TableCell>
                              <TableCell className="text-center font-display font-bold text-secondary">{s.points}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <div className="space-y-2">
                    {g.matches.map((m) => (
                      <GroupMatchCard key={m.id} match={m} canEdit={isAdmin} onSave={saveGroupMatchScore} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {hasPlayoffs && (
        <div className="mt-6 grid gap-4">
          <div className="flex items-center gap-2">
            <Swords className="size-5 text-secondary" />
            <h2 className="font-display text-lg font-bold">Mata-mata</h2>
          </div>

          {qfMatches.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-4 font-display text-base font-bold">Quartas de Final</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {qfMatches.map((m) => (
                    <PlayoffMatchCard key={m.id} match={m} canEdit={isAdmin} onSave={savePlayoffMatchScore} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {sfMatches.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-4 font-display text-base font-bold">Semifinais</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sfMatches.map((m) => (
                    <PlayoffMatchCard key={m.id} match={m} canEdit={isAdmin} onSave={savePlayoffMatchScore} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {finalMatches.length > 0 && (
            <Card className="border-secondary/30">
              <CardContent className="p-5">
                <h3 className="mb-4 font-display text-base font-bold text-secondary">Final</h3>
                <div className="mx-auto max-w-md">
                  {finalMatches.map((m) => (
                    <PlayoffMatchCard key={m.id} match={m} canEdit={isAdmin} onSave={savePlayoffMatchScore} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {groups.length === 0 && tournament.status !== "registration" && (
        <Card>
          <CardContent className="grid place-items-center py-16 text-center">
            <Trophy className="size-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Grupos ainda nao foram sorteados.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GroupMatchCard({ match, canEdit, onSave }: {
  match: GroupMatchRow;
  canEdit: boolean;
  onSave: (m: GroupMatchRow, scoreP1: number, scoreP2: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sP1, setSP1] = useState(match.score_p1?.toString() ?? "");
  const [sP2, setSP2] = useState(match.score_p2?.toString() ?? "");

  function handleSave() {
    const n1 = parseInt(sP1) || 0;
    const n2 = parseInt(sP2) || 0;
    if (n1 === n2) {
      toast.error("Empate nao permitido no torneio");
      return;
    }
    onSave(match, n1, n2);
    setEditing(false);
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className={match.winner_id === match.player1_id ? "text-secondary" : ""}>{match.p1_name}</span>
        <span className="text-[10px] uppercase text-muted-foreground">1 set</span>
        <span className={match.winner_id === match.player2_id ? "text-secondary" : ""}>{match.p2_name}</span>
      </div>
      {!editing ? (
        <>
          <p className="mt-2 text-center font-display text-lg font-bold tabular-nums">
            {match.score_p1 !== null ? `${match.score_p1} x ${match.score_p2}` : "- x -"}
          </p>
          {match.winner_id && (
            <p className="mt-1 text-center text-xs font-bold text-secondary">
              Vencedor: {match.winner_id === match.player1_id ? match.p1_name : match.p2_name}
            </p>
          )}
          {canEdit && <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setEditing(true)}>Lancar resultado</Button>}
        </>
      ) : (
        <div className="mt-2 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">{match.p1_name}
              <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="Placar" value={sP1} onChange={(e) => setSP1(e.target.value)} />
            </label>
            <label className="text-xs">{match.p2_name}
              <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="Placar" value={sP2} onChange={(e) => setSP2(e.target.value)} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleSave}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayoffMatchCard({ match, canEdit, onSave }: {
  match: PlayoffMatch;
  canEdit: boolean;
  onSave: (m: PlayoffMatch, scoreP1: number, scoreP2: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sP1, setSP1] = useState(match.score_p1?.toString() ?? "");
  const [sP2, setSP2] = useState(match.score_p2?.toString() ?? "");

  const canEditMatch = canEdit && match.player1_id !== null && match.player2_id !== null;

  function handleSave() {
    const n1 = parseInt(sP1) || 0;
    const n2 = parseInt(sP2) || 0;
    if (n1 === n2) {
      toast.error("Empate nao permitido no torneio");
      return;
    }
    onSave(match, n1, n2);
    setEditing(false);
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className={match.winner_id === match.player1_id ? "text-secondary" : ""}>{match.p1_name}</span>
        <span className="text-[10px] uppercase text-muted-foreground">1 set</span>
        <span className={match.winner_id === match.player2_id ? "text-secondary" : ""}>{match.p2_name}</span>
      </div>
      {!editing ? (
        <>
          <p className="mt-3 text-center font-display text-lg font-bold tabular-nums">
            {match.score_p1 !== null ? `${match.score_p1} x ${match.score_p2}` : "- x -"}
          </p>
          {match.winner_id && (
            <p className="mt-2 text-center text-xs font-bold text-secondary">
              Vencedor: {match.winner_id === match.player1_id ? match.p1_name : match.p2_name}
            </p>
          )}
          {canEditMatch && (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setEditing(true)}>
              {match.winner_id ? "Editar resultado" : "Lancar resultado"}
            </Button>
          )}
        </>
      ) : (
        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">{match.p1_name}
              <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="Placar" value={sP1} onChange={(e) => setSP1(e.target.value)} />
            </label>
            <label className="text-xs">{match.p2_name}
              <input type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" placeholder="Placar" value={sP2} onChange={(e) => setSP2(e.target.value)} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleSave}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
