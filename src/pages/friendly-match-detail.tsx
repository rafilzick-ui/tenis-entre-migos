import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Swords,
  Calendar,
  Clock,
  Send,
  Trophy,
  X,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { computeWinner, validateFriendlyScore } from "@/lib/friendly-scoring";

type MatchDetail = {
  id: string;
  challenger_id: string;
  challenged_id: string;
  challenger_name: string;
  challenged_name: string;
  challenger_avatar: string | null;
  challenged_avatar: string | null;
  match_date: string | null;
  match_time: string | null;
  note: string | null;
  status: string;
  winner_id: string | null;
  set1_p1: number | null;
  set1_p2: number | null;
  set2_p1: number | null;
  set2_p2: number | null;
  sup_p1: number | null;
  sup_p2: number | null;
  created_at: string;
};

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

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

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  refused: "Recusado",
  cancelled: "Cancelado",
  completed: "Concluido",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700",
  accepted: "bg-primary/10 text-secondary",
  refused: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-primary/15 text-secondary",
};

export function FriendlyMatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const supabase = getSupabase();
  const navigate = useNavigate();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rivalry, setRivalry] = useState<RivalryMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageBody, setMessageBody] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [s1p1, setS1p1] = useState("");
  const [s1p2, setS1p2] = useState("");
  const [s2p1, setS2p1] = useState("");
  const [s2p2, setS2p2] = useState("");
  const [sup1, setSup1] = useState("");
  const [sup2, setSup2] = useState("");
  const [savingResult, setSavingResult] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!supabase || !id) return;

    const { data: m, error } = await supabase
      .from("friendly_matches")
      .select("id, challenger_id, challenged_id, match_date, match_time, note, status, winner_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error || !m) {
      setLoading(false);
      return;
    }

    const playerIds = [m.challenger_id, m.challenged_id];
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", playerIds);

    const profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      profileMap.set(p.id as string, {
        display_name: (p.display_name as string) ?? "",
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    });

    const chInfo = profileMap.get(m.challenger_id as string);
    const cdInfo = profileMap.get(m.challenged_id as string);

    setMatch({
      ...m,
      challenger_name: chInfo?.display_name ?? "Jogador",
      challenged_name: cdInfo?.display_name ?? "Jogador",
      challenger_avatar: chInfo?.avatar_url ?? null,
      challenged_avatar: cdInfo?.avatar_url ?? null,
    } as MatchDetail);

    // Load messages
    const { data: msgs } = await supabase
      .from("friendly_messages")
      .select("id, sender_id, body, created_at")
      .eq("match_id", id)
      .order("created_at", { ascending: true });

    setMessages((msgs ?? []) as Message[]);

    // Load rivalry — completed matches between the same two players
    const { data: rivalryData } = await supabase
      .from("friendly_matches")
      .select("id, match_date, challenger_id, challenged_id, winner_id, set1_p1, set1_p2, set2_p1, set2_p2, sup_p1, sup_p2")
      .eq("status", "completed")
      .or(`challenger_id.eq.${m.challenger_id},challenged_id.eq.${m.challenger_id}`)
      .order("match_date", { ascending: false });

    const rivalryMatches = (rivalryData ?? []).filter(
      (rm: Record<string, unknown>) =>
        (rm.challenger_id === m.challenger_id && rm.challenged_id === m.challenged_id) ||
        (rm.challenger_id === m.challenged_id && rm.challenged_id === m.challenger_id),
    ) as RivalryMatch[];

    setRivalry(rivalryMatches);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pre-fill result fields when opening dialog
  useEffect(() => {
    if (resultOpen && match) {
      setS1p1(match.set1_p1?.toString() ?? "");
      setS1p2(match.set1_p2?.toString() ?? "");
      setS2p1(match.set2_p1?.toString() ?? "");
      setS2p2(match.set2_p2?.toString() ?? "");
      setSup1(match.sup_p1?.toString() ?? "");
      setSup2(match.sup_p2?.toString() ?? "");
    }
  }, [resultOpen, match]);

  async function sendMessage() {
    if (!supabase || !profile || !id || !messageBody.trim()) return;
    setSendingMsg(true);
    const { error } = await supabase.from("friendly_messages").insert({
      match_id: id,
      sender_id: profile.id,
      body: messageBody.trim(),
    });
    setSendingMsg(false);
    if (error) {
      toast.error("Erro ao enviar mensagem");
      return;
    }
    setMessageBody("");
    await loadData();
  }

  async function saveResult() {
    if (!supabase || !profile || !match || !id) return;

    const score = {
      set1_p1: s1p1 ? parseInt(s1p1) : null,
      set1_p2: s1p2 ? parseInt(s1p2) : null,
      set2_p1: s2p1 ? parseInt(s2p1) : null,
      set2_p2: s2p2 ? parseInt(s2p2) : null,
      sup_p1: sup1 ? parseInt(sup1) : null,
      sup_p2: sup2 ? parseInt(sup2) : null,
    };

    const validationError = validateFriendlyScore(score);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const winner = computeWinner(score);
    if (!winner) {
      toast.error("Nao foi possivel determinar o vencedor. Verifique o placar.");
      return;
    }

    const winnerId = winner === "p1" ? match.challenger_id : match.challenged_id;

    setSavingResult(true);
    const { error } = await supabase
      .from("friendly_matches")
      .update({
        set1_p1: score.set1_p1,
        set1_p2: score.set1_p2,
        set2_p1: score.set2_p1,
        set2_p2: score.set2_p2,
        sup_p1: score.sup_p1,
        sup_p2: score.sup_p2,
        winner_id: winnerId,
        status: "completed",
      })
      .eq("id", id);

    setSavingResult(false);
    if (error) {
      toast.error("Erro ao salvar resultado");
      return;
    }
    toast.success("Resultado registrado");
    setResultOpen(false);
    await loadData();
  }

  async function cancelMatch() {
    if (!supabase || !id) return;
    const { error } = await supabase
      .from("friendly_matches")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao cancelar amistoso");
      return;
    }
    toast.success("Amistoso cancelado");
    await loadData();
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">Amistoso nao encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/amistosos")}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
      </div>
    );
  }

  if (!profile) return null;

  const isChallenger = profile.id === match.challenger_id;
  const opponentId = isChallenger ? match.challenged_id : match.challenger_id;
  const myName = isChallenger ? match.challenger_name : match.challenged_name;
  const oppName = isChallenger ? match.challenged_name : match.challenger_name;
  const myAvatar = isChallenger ? match.challenger_avatar : match.challenged_avatar;
  const oppAvatar = isChallenger ? match.challenged_avatar : match.challenger_avatar;

  // Rivalry stats
  const myWins = rivalry.filter((m) => m.winner_id === profile.id).length;
  const oppWins = rivalry.filter((m) => m.winner_id === opponentId).length;

  const canAct = match.status === "accepted" || match.status === "completed";
  const canCancel = match.status === "pending" || match.status === "accepted";
  const canRegisterResult = match.status === "accepted";

  // Score display helpers
  const myScore = (s1: number | null, s2: number | null) => {
    if (s1 === null) return null;
    return s1;
  };

  return (
    <div className="mx-auto max-w-3xl">
        <Link to="/amistosos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar para amistosos
        </Link>

        {/* Match header */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-6 sm:gap-12">
              {/* Player 1 */}
              <div className="flex flex-col items-center gap-2">
                {match.challenger_avatar ? (
                  <img src={match.challenger_avatar} alt="" className="size-16 rounded-xl object-cover ring-1 ring-border" />
                ) : (
                  <div className="grid size-16 place-items-center rounded-xl bg-secondary font-display text-xl font-bold text-white ring-1 ring-border">
                    {match.challenger_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <p className="font-display text-sm font-bold sm:text-base">{match.challenger_name}</p>
              </div>

              <div className="flex flex-col items-center">
                <Swords className="size-6 text-muted-foreground" />
                <span className="mt-1 font-display text-xs font-bold text-muted-foreground">X</span>
              </div>

              {/* Player 2 */}
              <div className="flex flex-col items-center gap-2">
                {match.challenged_avatar ? (
                  <img src={match.challenged_avatar} alt="" className="size-16 rounded-xl object-cover ring-1 ring-border" />
                ) : (
                  <div className="grid size-16 place-items-center rounded-xl bg-secondary font-display text-xl font-bold text-white ring-1 ring-border">
                    {match.challenged_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <p className="font-display text-sm font-bold sm:text-base">{match.challenged_name}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
                {match.match_date && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-4" />
                    {new Date(match.match_date).toLocaleDateString("pt-BR")}
                  </span>
                )}
                {match.match_time && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-4" />
                    {match.match_time}
                  </span>
                )}
              </div>
              <span className={cn("rounded-md px-3 py-1 text-xs font-bold", STATUS_COLORS[match.status])}>
                {STATUS_LABELS[match.status]}
              </span>
              {match.note && (
                <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">{match.note}</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {match.status === "pending" && !isChallenger && (
                <>
                  <Button onClick={() => respondFromDetail("accepted")}>
                    Aceitar
                  </Button>
                  <Button variant="outline" onClick={() => respondFromDetail("refused")}>
                    Recusar
                  </Button>
                </>
              )}
              {canRegisterResult && (
                <Button onClick={() => setResultOpen(true)}>
                  <Trophy className="size-4" /> Lancar resultado
                </Button>
              )}
              {canCancel && (
                <Button variant="ghost" onClick={cancelMatch}>
                  <X className="size-4" /> Cancelar amistoso
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Result */}
        {match.status === "completed" && match.set1_p1 !== null && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
                <Trophy className="size-5 text-secondary" /> Resultado
              </h2>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">{match.challenger_name}</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                    {match.set1_p1}
                    {match.set2_p1 !== null && ` ${match.set2_p1}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">{match.challenged_name}</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                    {match.set1_p2}
                    {match.set2_p2 !== null && ` ${match.set2_p2}`}
                  </p>
                </div>
              </div>
              {match.sup_p1 !== null && match.sup_p2 !== null && (
                <p className="mt-3 text-center text-xs font-semibold text-secondary">
                  SUP: {match.sup_p1} x {match.sup_p2}
                </p>
              )}
              {match.winner_id && (
                <p className="mt-4 text-center text-sm font-bold text-secondary">
                  Vencedor: {match.winner_id === match.challenger_id ? match.challenger_name : match.challenged_name}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Rivalry */}
        {rivalry.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
                <Swords className="size-5 text-secondary" /> Rivalidade
              </h2>
              <div className="flex items-center justify-center gap-8 py-2">
                <div className="text-center">
                  <p className="font-display text-3xl font-bold text-secondary">{myWins}</p>
                  <p className="text-xs text-muted-foreground">{myName}</p>
                </div>
                <span className="font-display text-lg text-muted-foreground">x</span>
                <div className="text-center">
                  <p className="font-display text-3xl font-bold">{oppWins}</p>
                  <p className="text-xs text-muted-foreground">{oppName}</p>
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {rivalry.length} {rivalry.length === 1 ? "confronto" : "confrontos"}
              </p>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Ultimos confrontos</p>
                {rivalry.slice(0, 5).map((rm) => {
                  const chIsMe = rm.challenger_id === profile.id;
                  const myP1 = chIsMe;
                  return (
                    <div key={rm.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {rm.match_date ? new Date(rm.match_date).toLocaleDateString("pt-BR") : "Data a definir"}
                      </span>
                      <span className="font-display font-bold tabular-nums">
                        {myP1 ? `${rm.set1_p1} ${rm.set2_p1 ?? ""}`.trim() : `${rm.set1_p2} ${rm.set2_p2 ?? ""}`.trim()}
                        {" x "}
                        {myP1 ? `${rm.set1_p2} ${rm.set2_p2 ?? ""}`.trim() : `${rm.set1_p1} ${rm.set2_p1 ?? ""}`.trim()}
                      </span>
                      <span className={cn(
                        "rounded px-2 py-0.5 text-xs font-bold",
                        rm.winner_id === profile.id ? "bg-primary/15 text-secondary" : "bg-destructive/10 text-destructive",
                      )}>
                        {rm.winner_id === profile.id ? "V" : "D"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
              <MessageSquare className="size-5 text-secondary" /> Mensagens
            </h2>
            <div className="mb-4 max-h-80 space-y-3 overflow-y-auto rounded-lg border p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === profile.id;
                  const senderName = isMe ? myName : oppName;
                  return (
                    <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                      <span className="mb-0.5 text-xs font-semibold text-muted-foreground">{senderName}</span>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                          isMe ? "bg-primary/10 text-foreground" : "bg-muted text-foreground",
                        )}
                      >
                        {msg.body}
                      </div>
                      <span className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="flex gap-2">
              <Input
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Digite sua mensagem..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !sendingMsg) sendMessage();
                }}
              />
              <Button size="icon" onClick={sendMessage} disabled={sendingMsg || !messageBody.trim()}>
                <Send className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

      {/* Result dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lancar resultado</DialogTitle>
            <DialogDescription>
              {match.challenger_name} x {match.challenged_name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="mb-2 text-sm font-semibold">{match.challenger_name}</p>
                <div className="grid gap-2">
                  <label className="grid gap-1 text-xs">
                    1 set
                    <Input type="number" min="0" value={s1p1} onChange={(e) => setS1p1(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    2 set (opcional)
                    <Input type="number" min="0" value={s2p1} onChange={(e) => setS2p1(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    SUP
                    <Input type="number" min="0" value={sup1} onChange={(e) => setSup1(e.target.value)} />
                  </label>
                </div>
              </div>
              <div className="text-center">
                <p className="mb-2 text-sm font-semibold">{match.challenged_name}</p>
                <div className="grid gap-2">
                  <label className="grid gap-1 text-xs">
                    1 set
                    <Input type="number" min="0" value={s1p2} onChange={(e) => setS1p2(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    2 set (opcional)
                    <Input type="number" min="0" value={s2p2} onChange={(e) => setS2p2(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    SUP
                    <Input type="number" min="0" value={sup2} onChange={(e) => setSup2(e.target.value)} />
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResultOpen(false)}>Cancelar</Button>
            <Button disabled={savingResult} onClick={saveResult}>
              {savingResult ? "Salvando..." : "Salvar resultado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function respondFromDetail(status: "accepted" | "refused") {
    if (!supabase || !id) return;
    const { error } = await supabase
      .from("friendly_matches")
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao responder desafio");
      return;
    }
    toast.success(status === "accepted" ? "Desafio aceito" : "Desafio recusado");
    await loadData();
  }
}
