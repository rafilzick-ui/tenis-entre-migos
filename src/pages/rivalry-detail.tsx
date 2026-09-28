import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Swords, Trophy, MessageSquare, Calendar } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RivalryMatch = {
  id: string;
  match_date: string | null;
  challenger_id: string;
  challenged_id: string;
  winner_id: string | null;
  set1_p1: number | null;
  set1_p2: number | null;
  set2_p1: number | null;
  set2_p2: number | null;
  sup_p1: number | null;
  sup_p2: number | null;
};

type MessageGroup = {
  matchId: string;
  matchDate: string | null;
  messages: { id: string; sender_id: string; body: string; created_at: string }[];
};

type ProfileInfo = {
  display_name: string;
  avatar_url: string | null;
};

export function RivalryDetailPage() {
  const { opponentId } = useParams<{ opponentId: string }>();
  const { profile } = useAuth();
  const supabase = getSupabase();
  const [opponent, setOpponent] = useState<ProfileInfo | null>(null);
  const [myInfo, setMyInfo] = useState<ProfileInfo | null>(null);
  const [matches, setMatches] = useState<RivalryMatch[]>([]);
  const [messageGroups, setMessageGroups] = useState<MessageGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!supabase || !profile || !opponentId) return;

    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", [profile.id, opponentId]);

    const profileMap = new Map<string, ProfileInfo>();
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      profileMap.set(p.id as string, {
        display_name: (p.display_name as string) ?? "",
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    });

    setMyInfo(profileMap.get(profile.id) ?? null);
    setOpponent(profileMap.get(opponentId) ?? null);

    // Load all completed matches between these two players
    const { data: allMatches } = await supabase
      .from("friendly_matches")
      .select("id, match_date, challenger_id, challenged_id, winner_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, status")
      .or(`challenger_id.eq.${profile.id},challenged_id.eq.${profile.id}`)
      .order("match_date", { ascending: false });

    const rivalryMatches = (allMatches ?? [])
      .filter((m: Record<string, unknown>) => {
        const ch = m.challenger_id as string;
        const cd = m.challenged_id as string;
        return (
          m.status === "completed" &&
          ((ch === profile.id && cd === opponentId) || (ch === opponentId && cd === profile.id))
        );
      }) as RivalryMatch[];

    setMatches(rivalryMatches);

    // Load messages for each match
    const groups: MessageGroup[] = [];
    for (const m of rivalryMatches) {
      const { data: msgs } = await supabase
        .from("friendly_messages")
        .select("id, sender_id, body, created_at")
        .eq("match_id", m.id)
        .order("created_at", { ascending: true });

      if (msgs && msgs.length > 0) {
        groups.push({
          matchId: m.id,
          matchDate: m.match_date,
          messages: msgs as { id: string; sender_id: string; body: string; created_at: string }[],
        });
      }
    }
    setMessageGroups(groups);
    setLoading(false);
  }, [supabase, profile, opponentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile || !opponent) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">Rivalidade nao encontrada.</p>
        <Link to="/amistosos" className="mt-4 inline-flex items-center gap-1.5 text-sm text-secondary">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
      </div>
    );
  }

  const myName = myInfo?.display_name ?? "Voce";
  const oppName = opponent.display_name;
  const myWins = matches.filter((m) => m.winner_id === profile.id).length;
  const oppWins = matches.filter((m) => m.winner_id === opponentId).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/amistosos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar para amistosos
      </Link>

      {/* Rivalry header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h1 className="mb-6 flex items-center justify-center gap-2 font-display text-lg font-bold">
            <Swords className="size-5 text-secondary" /> Rivalidade
          </h1>
          <div className="flex items-center justify-center gap-6 sm:gap-12">
            <div className="flex flex-col items-center gap-2">
              {myInfo?.avatar_url ? (
                <img src={myInfo.avatar_url} alt="" className="size-16 rounded-xl object-cover ring-1 ring-border" />
              ) : (
                <div className="grid size-16 place-items-center rounded-xl bg-secondary font-display text-xl font-bold text-white ring-1 ring-border">
                  {myName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <p className="font-display text-sm font-bold sm:text-base">{myName}</p>
            </div>
            <div className="text-center">
              <p className="font-display text-4xl font-bold">
                <span className="text-secondary">{myWins}</span>
                <span className="mx-2 text-muted-foreground">x</span>
                <span>{oppWins}</span>
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              {opponent.avatar_url ? (
                <img src={opponent.avatar_url} alt="" className="size-16 rounded-xl object-cover ring-1 ring-border" />
              ) : (
                <div className="grid size-16 place-items-center rounded-xl bg-secondary font-display text-xl font-bold text-white ring-1 ring-border">
                  {oppName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <p className="font-display text-sm font-bold sm:text-base">{oppName}</p>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {matches.length} {matches.length === 1 ? "confronto" : "confrontos"}
          </p>
        </CardContent>
      </Card>

      {/* Match history */}
      {matches.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
              <Trophy className="size-5 text-secondary" /> Historico de partidas
            </h2>
            <div className="space-y-3">
              {matches.map((m) => {
                const iAmChallenger = m.challenger_id === profile.id;
                const myS1 = iAmChallenger ? m.set1_p1 : m.set1_p2;
                const oppS1 = iAmChallenger ? m.set1_p2 : m.set1_p1;
                const myS2 = iAmChallenger ? m.set2_p1 : m.set2_p2;
                const oppS2 = iAmChallenger ? m.set2_p2 : m.set2_p1;
                const mySup = iAmChallenger ? m.sup_p1 : m.sup_p2;
                const oppSup = iAmChallenger ? m.sup_p2 : m.sup_p1;
                const iWon = m.winner_id === profile.id;

                return (
                  <Link
                    key={m.id}
                    to={`/amistosos/${m.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="size-3" />
                        {m.match_date ? new Date(m.match_date).toLocaleDateString("pt-BR") : "Data a definir"}
                      </span>
                      <span className="font-display font-bold tabular-nums">
                        {myS1}{myS2 !== null ? ` ${myS2}` : ""} x {oppS1}{oppS2 !== null ? ` ${oppS2}` : ""}
                      </span>
                      {mySup !== null && oppSup !== null && (
                        <span className="text-xs text-muted-foreground">SUP {mySup} x {oppSup}</span>
                      )}
                    </div>
                    <span className={cn(
                      "rounded px-2 py-0.5 text-xs font-bold",
                      iWon ? "bg-primary/15 text-secondary" : "bg-destructive/10 text-destructive",
                    )}>
                      {iWon ? "Vitoria" : "Derrota"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Message history grouped by match */}
      {messageGroups.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
              <MessageSquare className="size-5 text-secondary" /> Historico de mensagens
            </h2>
            <div className="space-y-6">
              {messageGroups.map((group) => (
                <div key={group.matchId}>
                  <Link
                    to={`/amistosos/${group.matchId}`}
                    className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Calendar className="size-3" />
                    Amistoso — {group.matchDate ? new Date(group.matchDate).toLocaleDateString("pt-BR") : "Data a definir"}
                  </Link>
                  <div className="space-y-2 rounded-lg border p-3">
                    {group.messages.map((msg) => {
                      const isMe = msg.sender_id === profile.id;
                      return (
                        <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                          <span className="mb-0.5 text-xs font-semibold text-muted-foreground">
                            {isMe ? myName : oppName}
                          </span>
                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                              isMe ? "bg-primary/10" : "bg-muted",
                            )}
                          >
                            {msg.body}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {matches.length === 0 && (
        <Card>
          <CardContent className="grid place-items-center py-12 text-center">
            <Swords className="size-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhum amistoso concluido com {oppName} ainda.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
