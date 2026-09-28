import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoginPage } from "@/pages/login";
import { SignupPage } from "@/pages/signup";
import { ProfilePage } from "@/pages/profile";
import { TournamentPage } from "@/pages/tournament";
import { RulesPage } from "@/pages/rules";
import { HomePage } from "@/pages/home";
import { DashboardPage } from "@/pages/dashboard";
import { TournamentsPage } from "@/pages/tournaments";
import { TournamentDetailPage } from "@/pages/tournament-detail";
import { RankingPage } from "@/pages/ranking";
import { FriendlyMatchesPage } from "@/pages/friendly-matches";
import { FriendlyMatchDetailPage } from "@/pages/friendly-match-detail";
import { RivalryDetailPage } from "@/pages/rivalry-detail";
import { AdminPage } from "@/pages/admin";
import { ResetPasswordPage } from "@/pages/reset-password";
import { TournamentHistoryPage } from "@/pages/tournament-history";
import { AppShell } from "@/components/app-shell";
import { ChatBubble } from "@/components/chat-bubble";
import { ErrorBoundary } from "@/components/error-boundary";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profile } = useAuth();

  // Safety timeout: if loading stays true for more than 8 seconds, force through
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading && !timedOut) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </main>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  // If session exists but profile failed to load, still render — components handle null profile
  return <>{children}</>;
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/rules" element={<RulesPage />} />
      <Route path="/regras" element={<ProtectedShell><RulesPage /></ProtectedShell>} />
      <Route path="/t/:slug" element={<TournamentPage />} />

      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/torneios" element={<ProtectedShell><TournamentsPage /></ProtectedShell>} />
      <Route path="/torneios/:id" element={<ProtectedShell><TournamentDetailPage /></ProtectedShell>} />
      <Route path="/ranking" element={<ProtectedShell><RankingPage /></ProtectedShell>} />
      <Route path="/amistosos" element={<ProtectedShell><FriendlyMatchesPage /></ProtectedShell>} />
      <Route path="/amistosos/:id" element={<ProtectedShell><FriendlyMatchDetailPage /></ProtectedShell>} />
      <Route path="/amistosos/rivalidade/:opponentId" element={<ProtectedShell><RivalryDetailPage /></ProtectedShell>} />
      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      <Route path="/historico-torneios" element={<ProtectedShell><TournamentHistoryPage /></ProtectedShell>} />
      <Route
        path="/perfil"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AuthenticatedChatBubble() {
  const { session, loading } = useAuth();
  if (loading || !session) return null;
  return <ChatBubble />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
        <AuthenticatedChatBubble />
        <Toaster theme="light" richColors position="bottom-right" />
      </AuthProvider>
    </ErrorBoundary>
  );
}
