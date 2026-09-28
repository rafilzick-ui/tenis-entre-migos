import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, LayoutDashboard, Trophy, BarChart3, User, Shield, LogOut, Menu, X, Swords, BookOpen } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { OfficialLogo } from "@/components/official-logo";
import { BrazilFlag, MinasGeraisFlag, TennisBallIcon } from "@/components/flags";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Inicio", icon: <LayoutDashboard className="size-5" /> },
  { to: "/torneios", label: "Torneios", icon: <Trophy className="size-5" /> },
  { to: "/ranking", label: "Ranking", icon: <BarChart3 className="size-5" /> },
  { to: "/amistosos", label: "Amistosos", icon: <Swords className="size-5" /> },
  { to: "/regras", label: "Regras", icon: <BookOpen className="size-5" /> },
  { to: "/perfil", label: "Meu perfil", icon: <User className="size-5" /> },
  { to: "/admin", label: "Administracao", icon: <Shield className="size-5" />, adminOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = profile?.role === "admin";
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  const initials = (profile?.display_name || profile?.full_name || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <Link to="/" className="flex items-center">
            <OfficialLogo className="h-10 w-10 rounded-lg object-contain ring-1 ring-primary/15" />
          </Link>
        </div>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <NotificationBell />
          <BrazilFlag className="h-4 w-6 rounded-sm" />
          <MinasGeraisFlag className="h-4 w-6 rounded-sm" />
          <TennisBallIcon className="size-4 text-secondary" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-secondary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="size-9 rounded-lg object-cover" />
            ) : (
              <div className="grid size-9 place-items-center rounded-lg bg-secondary text-sm font-bold text-white">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile?.display_name || profile?.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{isAdmin ? "Administrador" : "Jogador"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={handleSignOut}>
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <Link to="/" className="flex items-center">
          <OfficialLogo className="h-8 w-8 rounded-lg object-contain" />
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => setMobileOpen(true)} className="grid size-9 place-items-center rounded-lg border">
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-display text-sm font-bold">Menu</span>
              <button onClick={() => setMobileOpen(false)} className="grid size-8 place-items-center rounded-lg">
                <X className="size-5" />
              </button>
            </div>
            <nav className="space-y-1 px-3 py-4">
              {items.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-primary/10 text-secondary" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-border p-3">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
                <LogOut className="size-4" /> Sair
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 px-4 pb-8 pt-16 sm:px-6 lg:px-8 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
