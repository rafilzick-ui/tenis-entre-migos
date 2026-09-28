import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, X, Send, ChevronRight, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type ChatMatch = {
  id: string;
  opponent_id: string;
  opponent_name: string;
  opponent_avatar: string | null;
  last_message: string;
  last_message_at: string;
  last_sender_id: string;
  unread: boolean;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export function ChatBubble() {
  const { session, loading: authLoading, profile } = useAuth();
  const supabase = getSupabase();
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<ChatMatch[]>([]);
  const [activeMatch, setActiveMatch] = useState<ChatMatch | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [readMatchIds, setReadMatchIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);

  const loadMatches = useCallback(async () => {
    if (!supabase || !profile) return;
    const { data } = await supabase
      .from("friendly_matches")
      .select("id, challenger_id, challenged_id, status")
      .or(`challenger_id.eq.${profile.id},challenged_id.eq.${profile.id}`)
      .in("status", ["pending", "accepted", "completed"])
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) {
      setMatches([]);
      return;
    }

    const opponentIds = new Set<string>();
    (data as Record<string, unknown>[]).forEach((m) => {
      const chId = m.challenger_id as string;
      const cdId = m.challenged_id as string;
      const oppId = chId === profile.id ? cdId : chId;
      opponentIds.add(oppId);
    });

    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", [...opponentIds]);

    const profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      profileMap.set(p.id as string, {
        display_name: (p.display_name as string) ?? "",
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    });

    const matchList: ChatMatch[] = [];
    for (const m of data as Record<string, unknown>[]) {
      const chId = m.challenger_id as string;
      const cdId = m.challenged_id as string;
      const oppId = chId === profile.id ? cdId : chId;
      const oppInfo = profileMap.get(oppId);

      const { data: lastMsg } = await supabase
        .from("friendly_messages")
        .select("id, sender_id, body, created_at")
        .eq("match_id", m.id as string)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastMsg) {
        const lm = lastMsg as Record<string, unknown>;
        matchList.push({
          id: m.id as string,
          opponent_id: oppId,
          opponent_name: oppInfo?.display_name ?? "Jogador",
          opponent_avatar: oppInfo?.avatar_url ?? null,
          last_message: (lm.body as string) ?? "",
          last_message_at: (lm.created_at as string) ?? "",
          last_sender_id: (lm.sender_id as string) ?? "",
          unread: lm.sender_id !== profile.id && !readMatchIds.has(m.id as string),
        });
      }
    }

    matchList.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
    setMatches(matchList);
  }, [supabase, profile, readMatchIds]);

  const loadMessages = useCallback(async (matchId: string) => {
    if (!supabase) return;
    setLoadingMessages(true);
    const { data } = await supabase
      .from("friendly_messages")
      .select("id, sender_id, body, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });

    setMessages((data ?? []) as ChatMessage[]);
    setLoadingMessages(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [supabase]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // Realtime subscription — unique channel name per instance
  useEffect(() => {
    if (!supabase || !profile) return;
    const channelName = `friendly_messages_realtime_${Math.random().toString(36).slice(2, 8)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "friendly_messages",
        }, () => {
          loadMatches();
          if (activeMatch) loadMessages(activeMatch.id);
        })
        .on("postgres_changes", {
          event: "DELETE",
          schema: "public",
          table: "friendly_messages",
        }, (payload) => {
          const deletedId = (payload.old as Record<string, unknown>).id as string;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          loadMatches();
        })
        .subscribe();
    } catch (err) {
      console.error("Realtime subscription failed:", err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [supabase, profile, activeMatch, loadMatches, loadMessages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function sendMessage() {
    if (!supabase || !profile || !activeMatch || !messageBody.trim()) return;
    setSending(true);
    const { error } = await supabase.from("friendly_messages").insert({
      match_id: activeMatch.id,
      sender_id: profile.id,
      body: messageBody.trim(),
    });
    setSending(false);
    if (error) return;
    setMessageBody("");
    await loadMessages(activeMatch.id);
    await loadMatches();
  }

  async function deleteMessage() {
    if (!supabase || !profile || !deleteTarget) return;
    const msgId = deleteTarget.id;
    const { error } = await supabase
      .from("friendly_messages")
      .delete()
      .eq("id", msgId)
      .eq("sender_id", profile.id);
    if (error) return;
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setDeleteTarget(null);
    await loadMatches();
  }

  function openChat(match: ChatMatch) {
    setActiveMatch(match);
    setReadMatchIds((prev) => new Set(prev).add(match.id));
    loadMessages(match.id);
  }

  function closeChat() {
    setActiveMatch(null);
  }

  const totalUnread = matches.filter((m) => m.unread).length;

  if (authLoading || !session || !profile) return null;

  return (
    <>
      {/* Floating bubble button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-[7.5rem] right-5 z-50 grid size-12 place-items-center rounded-full bg-secondary text-white shadow-lg transition-transform hover:scale-105"
        aria-label="Mensagens"
      >
        <MessageSquare className="size-5" />
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-black">
            {totalUnread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-[12.5rem] right-5 z-50 flex h-[28rem] w-80 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-display text-sm font-bold">
              {activeMatch ? activeMatch.opponent_name : "Mensagens"}
            </h3>
            <div className="flex items-center gap-2">
              {activeMatch && (
                <button onClick={closeChat} className="text-xs text-muted-foreground hover:text-foreground">
                  Voltar
                </button>
              )}
              <button onClick={() => { setOpen(false); setActiveMatch(null); }} className="grid size-6 place-items-center rounded">
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Match list or messages */}
          {!activeMatch ? (
            <div className="flex-1 overflow-y-auto">
              {matches.length === 0 ? (
                <div className="grid place-items-center py-12 text-center">
                  <MessageSquare className="size-8 text-muted-foreground" />
                  <p className="mt-2 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
                </div>
              ) : (
                matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openChat(m)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-accent/40",
                      m.unread && "bg-primary/[.03]",
                    )}
                  >
                    {m.opponent_avatar ? (
                      <img src={m.opponent_avatar} alt="" className="size-9 rounded-lg object-cover" />
                    ) : (
                      <div className="grid size-9 place-items-center rounded-lg bg-secondary text-xs font-bold text-white">
                        {m.opponent_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.opponent_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.last_message}</p>
                    </div>
                    {m.unread && (
                      <span className="size-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {loadingMessages ? (
                  <div className="grid place-items-center py-8">
                    <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma mensagem ainda.</p>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender_id === profile.id;
                    return (
                      <div key={msg.id} className={cn("group/msg flex flex-col gap-0.5", isMe ? "items-end" : "items-start")}>
                        <div className="flex items-center gap-1">
                          {isMe && (
                            <button
                              onClick={() => setDeleteTarget(msg)}
                              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/msg:opacity-100"
                              title="Excluir mensagem"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg px-3 py-2 text-xs",
                              isMe ? "bg-primary/10" : "bg-muted",
                            )}
                          >
                            {msg.body}
                          </div>
                        </div>
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(msg.created_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="flex gap-2 border-t border-border p-3">
                <input
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !sending) sendMessage(); }}
                  placeholder="Mensagem..."
                  className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !messageBody.trim()}
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
              <Link
                to={`/amistosos/${activeMatch.id}`}
                onClick={() => { setOpen(false); setActiveMatch(null); }}
                className="flex items-center justify-center gap-1 border-t border-border py-2 text-xs font-semibold text-secondary hover:underline"
              >
                Ver amistoso completo <ChevronRight className="size-3" />
              </Link>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] grid place-items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-10 mx-4 w-full max-w-xs rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="font-display text-sm font-bold">Excluir mensagem</h3>
            <p className="mt-2 text-xs text-muted-foreground">Deseja excluir esta mensagem? Esta acao nao pode ser desfeita.</p>
            <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs italic text-muted-foreground">{deleteTarget.body}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={deleteMessage}
                className="flex-1 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
