import { useEffect, useState } from "react";
import {
  Shield,
  BarChart3,
  Users,
  Shuffle,
  Play,
  RotateCcw,
  Trophy,
  Trash2,
  Check,
  X,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  generatePairings,
  type PlayerRanking,
  type MatchupHistory,
} from "@/lib/ranking-engine";

type ProfileRow = {
  id: string;
  display_name: string;
  role: string;
  skill_level: number;
};

type RoundRow = {
  id: string;
  round_number: number;
  status: string;
};

type TournamentRow = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export function AdminPage() {
  const { profile } = useAuth();
  const supabase = getSupabase();

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resettingRanking, setResettingRanking] = useState(false);
  const [generatingPlayoffs, setGeneratingPlayoffs] = useState(false);
  const [deletingPlayer, setDeletingPlayer] = useState<string | null>(null);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);

  const [playoffMatches, setPlayoffMatches] = useState<
    {
      id: string;
      stage: string;
      match_number: number;
      player1_id: string | null;
      player2_id: string | null;
      winner_id: string | null;
    }[]
  >([]);

  const [rankingRegs, setRankingRegs] = useState<
    {
      id: string;
      player_id: string;
      player_name: string;
      status: string;
      created_at: string;
    }[]
  >([]);

  const [rankingStatus, setRankingStatus] =
    useState<string>("not_started");

  const [startingRanking, setStartingRanking] = useState(false);

  // ============================================================
  // TORNEIOS
  // ============================================================

  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);

  const [registerTarget, setRegisterTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [registerTournament, setRegisterTournament] =
    useState<TournamentRow | null>(null);

  const [registering, setRegistering] = useState(false);

  const isAdmin = profile?.role === "admin";

  // ============================================================
  // CARREGAMENTO
  // ============================================================

  useEffect(() => {
    if (!supabase || !isAdmin) return;

    (async () => {
      setLoading(true);

      const { data: p, error: profilesError } = await supabase
        .from("public_profiles")
        .select("id, display_name, role, skill_level")
        .order("display_name");

      if (profilesError) {
        console.error(
          "Erro ao carregar jogadores:",
          profilesError.message
        );

        toast.error(
          "Não foi possível carregar os jogadores."
        );
      }

      setProfiles(
        (p as ProfileRow[]) ?? []
      );

      const { data: r } = await supabase
        .from("ranking_rounds")
        .select("id, round_number, status")
        .order("round_number");

      setRounds(
        (r as RoundRow[]) ?? []
      );

      const { data: pm } = await supabase
        .from("ranking_playoff_matches")
        .select(
          "id, stage, match_number, player1_id, player2_id, winner_id"
        )
        .order("stage, match_number");

      setPlayoffMatches(
        (pm as {
          id: string;
          stage: string;
          match_number: number;
          player1_id: string | null;
          player2_id: string | null;
          winner_id: string | null;
        }[]) ?? []
      );

      // ========================================================
      // CARREGAR TORNEIOS
      // ========================================================

      const { data: tournamentData, error: tournamentError } =
        await supabase
          .from("tournaments_meta")
          .select(
            "id, name, status, start_date, end_date"
          )
          .order("created_at", {
            ascending: false,
          });

      if (tournamentError) {
        console.error(
          "Erro ao carregar torneios:",
          tournamentError.message
        );
      }

      setTournaments(
        (tournamentData as TournamentRow[]) ?? []
      );

      // ========================================================
      // INSCRICOES DO RANKING
      // ========================================================

      const { data: regs } = await supabase
        .from("ranking_registrations")
        .select(
          "id, player_id, status, created_at"
        )
        .order("created_at", {
          ascending: false,
        });

      const regsWithNames = await Promise.all(
        (regs ?? []).map(
          async (r: Record<string, unknown>) => {
            const { data: p } = await supabase
              .from("public_profiles")
              .select("display_name")
              .eq(
                "id",
                r.player_id as string
              )
              .maybeSingle();

            return {
              id: r.id as string,
              player_id:
                r.player_id as string,
              player_name:
                ((p as Record<
                  string,
                  unknown
                > | null)?.display_name as
                  | string
                  | undefined) ??
                "Jogador",
              status: r.status as string,
              created_at:
                r.created_at as string,
            };
          }
        )
      );

      setRankingRegs(regsWithNames);

      // ========================================================
      // STATUS DO RANKING
      // ========================================================

      const { data: meta } = await supabase
        .from("ranking_meta")
        .select("status")
        .eq("id", 1)
        .maybeSingle();

      setRankingStatus(
        ((meta as Record<
          string,
          unknown
        > | null)?.status as string) ??
          "not_started"
      );

      setLoading(false);
    })();
  }, [supabase, isAdmin]);

  // ============================================================
  // ALTERAR NIVEL DO JOGADOR
  // ============================================================

  async function updatePlayerSkill(
    playerId: string,
    skillLevel: number
  ) {
    if (!supabase) return;

    setUpdatingSkill(playerId);

    const { error } = await supabase.rpc(
      "admin_set_player_skill_level",
      {
        p_player_id: playerId,
        p_skill_level: skillLevel,
      }
    );

    setUpdatingSkill(null);

    if (error) {
      console.error(
        "Erro ao atualizar nível:",
        error.message
      );

      toast.error(
        error.message ??
          "Erro ao atualizar nível do jogador"
      );

      return;
    }

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? {
              ...p,
              skill_level: skillLevel,
            }
          : p
      )
    );

    toast.success(
      "Nível do jogador atualizado"
    );
  }

  // ============================================================
  // INSCRICAO MANUAL NO TORNEIO
  // ============================================================

  function openTournamentRegistration(
    tournament: TournamentRow
  ) {
    setRegisterTournament(tournament);
    setRegisterTarget(null);
  }

  function closeTournamentRegistration() {
    if (registering) return;

    setRegisterTournament(null);
    setRegisterTarget(null);
  }

  async function confirmRegisterPlayer() {
    if (
      !supabase ||
      !registerTournament ||
      !registerTarget
    ) {
      return;
    }

    setRegistering(true);

    const { error } = await supabase.rpc(
      "admin_register_player",
      {
        p_tournament_id:
          registerTournament.id,
        p_player_id:
          registerTarget.id,
      }
    );

    setRegistering(false);

    if (error) {
      console.error(
        "Erro ao inscrever jogador:",
        error.message
      );

      toast.error(
        error.message ??
          "Erro ao inscrever jogador"
      );

      return;
    }

    toast.success(
      `${registerTarget.name} foi inscrito no torneio`
    );

    closeTournamentRegistration();
  }

  // ============================================================
  // FUNCOES EXISTENTES
  // ============================================================

  async function setRole(
    playerId: string,
    role: "player" | "admin"
  ) {
    if (!supabase) return;

    const { error } = await supabase.rpc(
      "set_user_role",
      {
        target_user_id: playerId,
        new_role: role,
      }
    );

    if (error) {
      toast.error(
        "Erro ao atualizar papel"
      );
      return;
    }

    toast.success(
      role === "admin"
        ? "Administrador atribuido"
        : "Jogador atribuido"
    );

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, role }
          : p
      )
    );
  }

  async function createRankingRounds() {
    if (!supabase) return;

    for (let i = 1; i <= 4; i++) {
      const { data: existing } =
        await supabase
          .from("ranking_rounds")
          .select("id")
          .eq("round_number", i)
          .maybeSingle();

      if (existing) continue;

      await supabase
        .from("ranking_rounds")
        .insert({
          round_number: i,
          status: "open",
        });
    }

    toast.success(
      "Rodadas de ranking criadas"
    );

    const { data: r } =
      await supabase
        .from("ranking_rounds")
        .select(
          "id, round_number, status"
        )
        .order("round_number");

    setRounds(
      (r as RoundRow[]) ?? []
    );
  }

  async function drawRankingRound(
    roundNumber: number
  ) {
    if (!supabase) return;

    const { data: round } =
      await supabase
        .from("ranking_rounds")
        .select("id")
        .eq(
          "round_number",
          roundNumber
        )
        .maybeSingle();

    if (!round) {
      toast.error(
        "Rodada nao encontrada"
      );
      return;
    }

    const { data: profilesData } =
      await supabase
        .from("public_profiles")
        .select(
          "id, display_name, role"
        );

    const allProfiles = (
      profilesData ?? []
    ).map(
      (p: Record<string, unknown>) => ({
        id: p.id as string,
        display_name:
          p.display_name as string,
        role: p.role as string,
      })
    );

    const playerIds =
      allProfiles.map(
        (p) => p.id
      );

    if (playerIds.length < 4) {
      toast.error(
        "Necessario pelo menos 4 jogadores"
      );
      return;
    }

    const { data: historyData } =
      await supabase
        .from("ranking_match_history")
        .select(
          "player1_id, player2_id"
        );

    const history: MatchupHistory =
      new Map();

    (historyData ?? []).forEach(
      (h: Record<string, unknown>) => {
        const a =
          h.player1_id as string;
        const b =
          h.player2_id as string;

        if (!history.has(a))
          history.set(
            a,
            new Set()
          );

        if (!history.has(b))
          history.set(
            b,
            new Set()
          );

        history.get(a)!.add(b);
        history.get(b)!.add(a);
      }
    );

    const { data: allMatches } =
      await supabase
        .from("ranking_matches")
        .select(
          "player1_id, player2_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, winner_id"
        );

    const rankings: PlayerRanking[] =
      allProfiles.map((p) => ({
        playerId: p.id,
        displayName:
          p.display_name,
        avatarUrl: null,
        played: 0,
        won: 0,
        lost: 0,
        setsWon: 0,
        setsLost: 0,
        points: 0,
      }));

    const rankMap =
      new Map(
        rankings.map(
          (r) => [
            r.playerId,
            r,
          ]
        )
      );

    (allMatches ?? []).forEach(
      (m: Record<string, unknown>) => {
        const p1 =
          m.player1_id as string;

        const p2 =
          m.player2_id as string;

        const winner =
          m.winner_id as
            | string
            | null;

        if (
          !winner ||
          !rankMap.has(p1) ||
          !rankMap.has(p2)
        ) {
          return;
        }

        const r1 =
          rankMap.get(p1)!;

        const r2 =
          rankMap.get(p2)!;

        r1.played++;
        r2.played++;

        if (winner === p1) {
          r1.won++;
          r1.points += 18;
          r2.lost++;
        } else {
          r2.won++;
          r2.points += 18;
          r1.lost++;
        }
      }
    );

    rankings.sort(
      (a, b) =>
        b.points - a.points
    );

    const {
      data: previousByesData,
    } = await supabase
      .from("ranking_match_byes")
      .select("player_id");

    const previousByes =
      new Set(
        (previousByesData ?? []).map(
          (
            b: Record<
              string,
              unknown
            >
          ) =>
            b.player_id as string
        )
      );

    const result =
      generatePairings(
        roundNumber as
          | 1
          | 2
          | 3
          | 4,
        playerIds,
        history,
        rankings,
        previousByes
      );

    if (
      result.pairs.length ===
      0
    ) {
      toast.error(
        "Nao foi possivel formar partidas"
      );
      return;
    }

    if (
      result.repeatedPairs
        .length > 0
    ) {
      const names =
        result.repeatedPairs
          .map(([a, b]) => {
            const pa =
              allProfiles.find(
                (p) =>
                  p.id === a
              );

            const pb =
              allProfiles.find(
                (p) =>
                  p.id === b
              );

            return `${
              pa?.display_name ??
              a
            } vs ${
              pb?.display_name ??
              b
            }`;
          })
          .join(", ");

      toast.warning(
        `Confrontos repetidos (sem alternativa): ${names}`
      );
    }

    await supabase
      .from("ranking_matches")
      .delete()
      .eq(
        "round_id",
        round.id
      );

    for (
      let i = 0;
      i < result.pairs.length;
      i++
    ) {
      await supabase
        .from("ranking_matches")
        .insert({
          round_id:
            round.id,
          match_number:
            i + 1,
          player1_id:
            result.pairs[i][0],
          player2_id:
            result.pairs[i][1],
        });

      await supabase
        .from(
          "ranking_match_history"
        )
        .insert({
          player1_id:
            result.pairs[i][0],
          player2_id:
            result.pairs[i][1],
          round_id:
            round.id,
        });
    }

    if (result.bye) {
      await supabase
        .from(
          "ranking_match_byes"
        )
        .insert({
          round_id:
            round.id,
          player_id:
            result.bye,
        });
    }

    await supabase
      .from("ranking_rounds")
      .update({
        status:
          "in_progress",
      })
      .eq(
        "id",
        round.id
      );

    const profileMap =
      new Map(
        allProfiles.map(
          (p) => [
            p.id,
            p.display_name,
          ]
        )
      );

    for (const pair of result.pairs) {
      const p1Name =
        profileMap.get(
          pair[0]
        ) ?? "Jogador";

      const p2Name =
        profileMap.get(
          pair[1]
        ) ?? "Jogador";

      await supabase
        .rpc(
          "create_notification",
          {
            p_user_id:
              pair[0],
            p_type:
              "ranking_round",
            p_title:
              `Nova rodada do Ranking`,
            p_body:
              `A Rodada ${roundNumber} foi sorteada. Seu adversario: ${p2Name}.`,
            p_link:
              "/ranking",
            p_ref_id:
              round.id,
            p_dedup_key:
              `ranking_round_${round.id}_${pair[0]}`,
          }
        )
        .then(
          ({
            error,
          }) => {
            if (error)
              console.error(
                "Notification error (p1):",
                error.message
              );
          }
        );

      await supabase
        .rpc(
          "create_notification",
          {
            p_user_id:
              pair[1],
            p_type:
              "ranking_round",
            p_title:
              `Nova rodada do Ranking`,
            p_body:
              `A Rodada ${roundNumber} foi sorteada. Seu adversario: ${p1Name}.`,
            p_link:
              "/ranking",
            p_ref_id:
              round.id,
            p_dedup_key:
              `ranking_round_${round.id}_${pair[1]}`,
          }
        )
        .then(
          ({
            error,
          }) => {
            if (error)
              console.error(
                "Notification error (p2):",
                error.message
              );
          }
        );

      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-email`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(
              {
                type: "ranking_round",
                recipientId:
                  pair[0],
                roundNumber,
                opponentName:
                  p2Name,
              }
            ),
          }
        );

        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-email`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(
              {
                type: "ranking_round",
                recipientId:
                  pair[1],
                roundNumber,
                opponentName:
                  p1Name,
              }
            ),
          }
        );
      } catch (e) {
        console.error(
          "Email notification error:",
          e
        );
      }
    }

    if (result.bye) {
      const byeName =
        allProfiles.find(
          (p) =>
            p.id ===
            result.bye
        )?.display_name ??
        "Jogador";

      toast.success(
        `Rodada ${roundNumber} sorteada (bye: ${byeName})`
      );
    } else {
      toast.success(
        `Rodada ${roundNumber} sorteada`
      );
    }

    const { data: r } =
      await supabase
        .from("ranking_rounds")
        .select(
          "id, round_number, status"
        )
        .order(
          "round_number"
        );

    setRounds(
      (r as RoundRow[]) ??
        []
    );
  }

  const allRoundsDone =
    rounds.length === 4 &&
    rounds.every(
      (r) =>
        r.status ===
        "completed"
    );

  async function resetTournament() {
    if (!supabase) return;

    setResetting(true);

    const { error } =
      await supabase.rpc(
        "reset_tournament"
      );

    setResetting(false);

    if (error) {
      toast.error(
        error.message ??
          "Erro ao recomecar torneio"
      );
      return;
    }

    toast.success(
      "Torneio reiniciado com sucesso"
    );
  }

  async function resetRanking() {
    if (!supabase) return;

    setResettingRanking(true);

    const { error } =
      await supabase.rpc(
        "reset_ranking"
      );

    setResettingRanking(false);

    if (error) {
      toast.error(
        error.message ??
          "Erro ao recomecar ranking"
      );
      return;
    }

    toast.success(
      "Ranking reiniciado com sucesso"
    );

    const { data: r } =
      await supabase
        .from("ranking_rounds")
        .select(
          "id, round_number, status"
        )
        .order(
          "round_number"
        );

    setRounds(
      (r as RoundRow[]) ??
        []
    );

    setPlayoffMatches([]);
  }

  async function generateRankingPlayoffs() {
    if (!supabase) return;

    setGeneratingPlayoffs(
      true
    );

    const {
      data,
      error,
    } = await supabase.rpc(
      "generate_ranking_playoffs"
    );

    setGeneratingPlayoffs(
      false
    );

    if (error) {
      toast.error(
        error.message ??
          "Erro ao gerar mata-mata do ranking"
      );
      return;
    }

    toast.success(
      (data as string) ??
        "Mata-mata do ranking gerado"
    );

    const { data: pm } =
      await supabase
        .from(
          "ranking_playoff_matches"
        )
        .select(
          "id, stage, match_number, player1_id, player2_id, winner_id"
        )
        .order(
          "stage, match_number"
        );

    setPlayoffMatches(
      (pm as {
        id: string;
        stage: string;
        match_number: number;
        player1_id:
          | string
          | null;
        player2_id:
          | string
          | null;
        winner_id:
          | string
          | null;
      }[]) ?? []
    );
  }

  async function updateRegStatus(
    regId: string,
    status:
      | "approved"
      | "rejected"
  ) {
    if (!supabase) return;

    const { error } =
      await supabase
        .from(
          "ranking_registrations"
        )
        .update({ status })
        .eq("id", regId);

    if (error) {
      toast.error(
        "Erro ao atualizar inscricao"
      );
      return;
    }

    toast.success(
      status === "approved"
        ? "Inscricao aprovada"
        : "Inscricao recusada"
    );

    setRankingRegs(
      (prev) =>
        prev.map((r) =>
          r.id === regId
            ? {
                ...r,
                status,
              }
            : r
        )
    );
  }

  async function startRanking() {
    if (!supabase) return;

    setStartingRanking(
      true
    );

    const { error } =
      await supabase.rpc(
        "start_ranking"
      );

    setStartingRanking(
      false
    );

    if (error) {
      toast.error(
        error.message ??
          "Erro ao iniciar ranking"
      );
      return;
    }

    toast.success(
      "Ranking iniciado"
    );

    setRankingStatus(
      "active"
    );
  }

  async function deletePlayer(
    playerId: string
  ) {
    if (!supabase) return;

    setDeletingPlayer(
      playerId
    );

    const { error } =
      await supabase.rpc(
        "delete_player",
        {
          p_player_id:
            playerId,
        }
      );

    setDeletingPlayer(
      null
    );

    if (error) {
      toast.error(
        error.message ??
          "Erro ao excluir jogador"
      );
      return;
    }

    toast.success(
      "Jogador excluido com sucesso"
    );

    setProfiles(
      (prev) =>
        prev.filter(
          (p) =>
            p.id !==
            playerId
        )
    );
  }

  // ============================================================
  // REDIRECIONAMENTO
  // ============================================================

  if (!isAdmin) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }

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
        <header className="mb-6 flex items-center gap-3">
          <Shield className="size-7 text-secondary" />

          <h1 className="font-display text-2xl font-bold tracking-tight">
            Administracao
          </h1>
        </header>

        {/* ======================================================
            RANKING
            ====================================================== */}

        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="size-5 text-secondary" />

              <h2 className="font-display text-lg font-bold">
                Ranking
              </h2>

              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                  rankingStatus ===
                  "active"
                    ? "bg-secondary text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {rankingStatus ===
                "active"
                  ? "Ativo"
                  : "Nao iniciado"}
              </span>
            </div>

            {rankingStatus ===
              "not_started" && (
              <div className="mb-4">
                <AlertDialog>
                  <AlertDialogTrigger
                    asChild
                  >
                    <Button
                      disabled={
                        startingRanking
                      }
                    >
                      <Play className="size-4" />

                      {startingRanking
                        ? "Iniciando..."
                        : "Iniciar Ranking"}
                    </Button>
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Iniciar Ranking?
                      </AlertDialogTitle>

                      <AlertDialogDescription>
                        Tem certeza que deseja iniciar o ranking? Apos iniciar, as inscricoes aprovadas passam a valer e o ranking estara ativo.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        Cancelar
                      </AlertDialogCancel>

                      <AlertDialogAction
                        onClick={
                          startRanking
                        }
                      >
                        Confirmar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            <h3 className="mb-3 text-sm font-semibold">
              Inscricoes do Ranking
            </h3>

            {rankingRegs.length ===
            0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma inscricao recebida.
              </p>
            ) : (
              <div className="space-y-2">
                {rankingRegs.map(
                  (r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {
                            r.player_name
                          }
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {new Date(
                            r.created_at
                          ).toLocaleDateString(
                            "pt-BR"
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            r.status ===
                            "approved"
                              ? "bg-secondary/15 text-secondary"
                              : r.status ===
                                "rejected"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {r.status ===
                          "approved"
                            ? "Aprovado"
                            : r.status ===
                              "rejected"
                            ? "Recusado"
                            : "Pendente"}
                        </span>

                        {r.status ===
                          "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateRegStatus(
                                  r.id,
                                  "approved"
                                )
                              }
                            >
                              <Check className="size-3.5" />
                              Aceitar
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                updateRegStatus(
                                  r.id,
                                  "rejected"
                                )
                              }
                            >
                              <X className="size-3.5" />
                              Recusar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ======================================================
            TORNEIOS
            ====================================================== */}

        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="size-5 text-secondary" />

              <h2 className="font-display text-lg font-bold">
                Torneios
              </h2>
            </div>

            {tournaments.length ===
            0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum torneio encontrado.
              </p>
            ) : (
              <div className="space-y-3">
                {tournaments.map(
                  (tournament) => (
                    <div
                      key={
                        tournament.id
                      }
                      className="rounded-lg border p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {
                              tournament.name
                            }
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span
                              className={`rounded px-2 py-0.5 font-semibold ${
                                tournament.status ===
                                "registration"
                                  ? "bg-secondary/15 text-secondary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {tournament.status ===
                              "registration"
                                ? "Inscricoes abertas"
                                : tournament.status}
                            </span>

                            {tournament.start_date && (
                              <span>
                                Inicio:{" "}
                                {new Date(
                                  `${tournament.start_date}T00:00:00`
                                ).toLocaleDateString(
                                  "pt-BR"
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {tournament.status ===
                          "registration" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              openTournamentRegistration(
                                tournament
                              )
                            }
                          >
                            <UserPlus className="size-4" />
                            Inscrever jogador
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ======================================================
            RODADAS DO RANKING
            ====================================================== */}

        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="size-5 text-secondary" />

              <h2 className="font-display text-lg font-bold">
                Rodadas do Ranking
              </h2>
            </div>

            {rounds.length === 0 ? (
              <Button
                onClick={
                  createRankingRounds
                }
              >
                <Play className="size-4" />
                Iniciar ranking
              </Button>
            ) : (
              <div className="grid gap-3">
                {rounds.map(
                  (r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-semibold">
                          Rodada{" "}
                          {
                            r.round_number
                          }
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {r.status ===
                          "open"
                            ? "Aberta para sorteio"
                            : r.status ===
                              "in_progress"
                            ? "Em andamento"
                            : "Concluida"}
                        </p>
                      </div>

                      {r.status ===
                        "open" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            drawRankingRound(
                              r.round_number
                            )
                          }
                        >
                          <Shuffle className="size-4" />
                          Sortear
                        </Button>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ======================================================
            MATA-MATA
            ====================================================== */}

        {rounds.length ===
          4 && (
          <Card className="mb-6">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="size-5 text-secondary" />

                <h2 className="font-display text-lg font-bold">
                  Mata-mata do Ranking
                </h2>
              </div>

              {allRoundsDone ? (
                <div>
                  {playoffMatches.length >
                  0 ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      Mata-mata ja gerado com{" "}
                      {
                        playoffMatches.length
                      }{" "}
                      partidas.
                    </p>
                  ) : (
                    <p className="mb-3 text-sm text-muted-foreground">
                      As 4 rodadas estao concluidas. Gere o mata-mata do ranking.
                    </p>
                  )}

                  <Button
                    onClick={
                      generateRankingPlayoffs
                    }
                    disabled={
                      generatingPlayoffs
                    }
                  >
                    <Trophy className="size-4" />

                    {generatingPlayoffs
                      ? "Gerando..."
                      : playoffMatches.length >
                        0
                      ? "Regenerar quartas de final"
                      : "Gerar quartas de final"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Disponivel apenas quando as 4 rodadas do ranking estiverem concluidas.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ======================================================
            RECOMECAR TORNEIO
            ====================================================== */}

        <Card className="mb-6 border-destructive/30">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <RotateCcw className="size-5 text-destructive" />

              <h2 className="font-display text-lg font-bold">
                Recomecar Torneio
              </h2>
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              Limpa todo o estado competitivo do torneio: grupos, partidas, resultados, classificacao e mata-mata.
              Usuarios, perfis, ranking, amistosos e mensagens nao sao afetados.
            </p>

            <AlertDialog>
              <AlertDialogTrigger
                asChild
              >
                <Button
                  variant="destructive"
                  disabled={resetting}
                >
                  <RotateCcw className="size-4" />

                  {resetting
                    ? "Reiniciando..."
                    : "Recomecar Torneio"}
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Recomecar Torneio?
                  </AlertDialogTitle>

                  <AlertDialogDescription>
                    Esta acao ira limpar grupos, partidas, resultados, classificacao e mata-mata do torneio. Nao podera ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel>
                    Cancelar
                  </AlertDialogCancel>

                  <AlertDialogAction
                    onClick={
                      resetTournament
                    }
                  >
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* ======================================================
            RECOMECAR RANKING
            ====================================================== */}

        <Card className="mb-6 border-destructive/30">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="size-5 text-destructive" />

              <h2 className="font-display text-lg font-bold">
                Recomecar Ranking
              </h2>
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              Zera todos os dados do ranking: partidas, historico, byes e mata-mata. As rodadas voltam ao estado inicial.
              Jogadores, torneios e amistosos nao sao afetados.
            </p>

            <AlertDialog>
              <AlertDialogTrigger
                asChild
              >
                <Button
                  variant="destructive"
                  disabled={
                    resettingRanking
                  }
                >
                  <RotateCcw className="size-4" />

                  {resettingRanking
                    ? "Reiniciando..."
                    : "Recomecar Ranking"}
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Recomecar Ranking?
                  </AlertDialogTitle>

                  <AlertDialogDescription>
                    Tem certeza que deseja recomecar o ranking? Essa acao ira zerar os dados de ranking e nao podera ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel>
                    Cancelar
                  </AlertDialogCancel>

                  <AlertDialogAction
                    onClick={
                      resetRanking
                    }
                  >
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* ======================================================
            JOGADORES
            ====================================================== */}

        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users className="size-5 text-secondary" />

              <h2 className="font-display text-lg font-bold">
                Jogadores
              </h2>
            </div>

            {profiles.length ===
            0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum jogador encontrado.
              </p>
            ) : (
              <div className="space-y-2">
                {profiles.map(
                  (p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {
                            p.display_name
                          }
                        </p>

                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Nivel
                          </span>

                          <select
                            value={
                              p.skill_level ??
                              1
                            }
                            onChange={(
                              e
                            ) =>
                              updatePlayerSkill(
                                p.id,
                                Number(
                                  e.target
                                    .value
                                )
                              )
                            }
                            disabled={
                              updatingSkill ===
                              p.id
                            }
                            className="rounded-md border bg-background px-2 py-1 text-xs font-semibold disabled:opacity-50"
                          >
                            {Array.from(
                              {
                                length: 10,
                              },
                              (
                                _,
                                index
                              ) => {
                                const level =
                                  index +
                                  1;

                                return (
                                  <option
                                    key={
                                      level
                                    }
                                    value={
                                      level
                                    }
                                  >
                                    {level}
                                  </option>
                                );
                              }
                            )}
                          </select>

                          {updatingSkill ===
                            p.id && (
                            <span className="text-xs text-muted-foreground">
                              Salvando...
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            p.role ===
                            "admin"
                              ? "bg-secondary text-white"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {p.role ===
                          "admin"
                            ? "Admin"
                            : "Jogador"}
                        </span>

                        {p.id !==
                          profile?.id && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setRole(
                                  p.id,
                                  p.role ===
                                    "admin"
                                    ? "player"
                                    : "admin"
                                )
                              }
                            >
                              {p.role ===
                              "admin"
                                ? "Tornar jogador"
                                : "Tornar admin"}
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger
                                asChild
                              >
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={
                                    deletingPlayer ===
                                    p.id
                                  }
                                >
                                  <Trash2 className="size-3.5" />

                                  {deletingPlayer ===
                                  p.id
                                    ? "..."
                                    : "Excluir"}
                                </Button>
                              </AlertDialogTrigger>

                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Excluir jogador?
                                  </AlertDialogTitle>

                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir este jogador? Essa acao podera remover os dados relacionados a ele e nao podera ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>

                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    Cancelar
                                  </AlertDialogCancel>

                                  <AlertDialogAction
                                    onClick={() =>
                                      deletePlayer(
                                        p.id
                                      )
                                    }
                                  >
                                    Confirmar exclusao
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ======================================================
            DIALOG - INSCRICAO MANUAL
            ====================================================== */}

        <Dialog
          open={
            !!registerTournament
          }
          onOpenChange={(
            open
          ) => {
            if (
              !open &&
              !registering
            ) {
              closeTournamentRegistration();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Inscrever jogador
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div>
                <p className="text-xs text-muted-foreground">
                  Torneio
                </p>

                <p className="font-semibold">
                  {
                    registerTournament?.name
                  }
                </p>

                {registerTournament?.start_date && (
                  <p className="text-xs text-muted-foreground">
                    Data:{" "}
                    {new Date(
                      `${registerTournament.start_date}T00:00:00`
                    ).toLocaleDateString(
                      "pt-BR"
                    )}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Jogador
                </label>

                <select
                  value={
                    registerTarget?.id ??
                    ""
                  }
                  onChange={(
                    e
                  ) => {
                    const player =
                      profiles.find(
                        (p) =>
                          p.id ===
                          e.target
                            .value
                      );

                    setRegisterTarget(
                      player
                        ? {
                            id: player.id,
                            name: player.display_name,
                          }
                        : null
                    );
                  }}
                  disabled={
                    registering
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">
                    Selecione um jogador...
                  </option>

                  {profiles
                    .filter(
                      (p) =>
                        p.id !==
                        profile?.id
                    )
                    .map(
                      (player) => (
                        <option
                          key={
                            player.id
                          }
                          value={
                            player.id
                          }
                        >
                          {
                            player.display_name
                          }{" "}
                          — Nível{" "}
                          {
                            player.skill_level
                          }
                        </option>
                      )
                    )}
                </select>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  O jogador será inscrito como{" "}
                  <strong>
                    aprovado
                  </strong>
                  , sem precisar passar pela aprovação normal.
                </p>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    registering
                  }
                >
                  Cancelar
                </Button>
              </DialogClose>

              <Button
                type="button"
                onClick={
                  confirmRegisterPlayer
                }
                disabled={
                  registering ||
                  !registerTarget
                }
              >
                {registering
                  ? "Inscrevendo..."
                  : "Confirmar inscrição"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}