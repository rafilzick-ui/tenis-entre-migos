import { useEffect, useState, useRef, useCallback } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  ref_id: string | null;
  is_read: boolean;
  created_at: string;
};

export function NotificationBell() {
  const { session, loading: authLoading, profile } = useAuth();
  const supabase = getSupabase();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    if (!supabase || !profile) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, ref_id, is_read, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return;
    const notifs = (data ?? []) as Notification[];
    setNotifications(notifs);
    setUnreadCount(notifs.filter((n) => !n.is_read).length);
  }, [supabase, profile]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription — unique channel name per instance to avoid conflicts
  useEffect(() => {
    if (!supabase || !profile) return;
    const channelName = `notifications_realtime_${profile.id}_${Math.random().toString(36).slice(2, 8)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        }, () => {
          loadNotifications();
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        }, () => {
          loadNotifications();
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
  }, [supabase, profile, loadNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function markAsRead(id: string) {
    if (!supabase) return;
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  async function markAllAsRead() {
    if (!supabase || !profile) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", profile.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  function handleNotificationClick(n: Notification) {
    if (!n.is_read) markAsRead(n.id);
  }

  if (authLoading || !session || !profile) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) setLoading(true);
        }}
        className="relative grid size-9 place-items-center rounded-lg transition-colors hover:bg-accent"
        aria-label="Notificacoes"
      >
        <Bell className="size-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] size-[18px] place-items-center rounded-full bg-primary text-[10px] font-bold text-black">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[20rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:w-80 lg:left-0 lg:right-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-display text-sm font-bold">Notificacoes</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-xs font-medium text-secondary transition-colors hover:text-secondary/80"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="size-3.5" />
                  Marcar todas
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Notifications list */}
          <div className="max-h-[24rem] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="grid place-items-center py-8">
                <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="grid place-items-center py-10 text-center">
                <Bell className="size-8 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma notificacao ainda.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const content = (
                  <div
                    className={cn(
                      "flex gap-3 border-b border-border/50 px-4 py-3 transition-colors hover:bg-accent/30",
                      !n.is_read && "bg-primary/[.04]",
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {!n.is_read ? (
                        <span className="block size-2 rounded-full bg-primary" />
                      ) : (
                        <span className="block size-2 rounded-full bg-transparent" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", !n.is_read ? "font-semibold" : "font-medium text-muted-foreground")}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{n.body}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {!n.is_read && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              markAsRead(n.id);
                            }}
                            className="flex items-center gap-0.5 text-[10px] font-medium text-secondary transition-colors hover:text-secondary/80"
                          >
                            <Check className="size-3" /> Marcar como lida
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );

                return n.link ? (
                  <Link
                    key={n.id}
                    to={n.link}
                    onClick={() => {
                      handleNotificationClick(n);
                      setOpen(false);
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={n.id} onClick={() => handleNotificationClick(n)}>
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
