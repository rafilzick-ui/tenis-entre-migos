import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OfficialLogo } from "@/components/official-logo";
import { BrazilFlag, MinasGeraisFlag, TennisBallIcon } from "@/components/flags";

export function LoginPage() {
  const navigate = useNavigate();
  const supabase = getSupabase();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (session) navigate("/dashboard", { replace: true });
  }, [session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      toast.error(error.message === "Invalid login credentials"
        ? "E-mail ou senha incorretos"
        : error.message);
      setLoading(false);
      return;
    }
    toast.success("Login realizado com sucesso");
    // Navigation happens automatically via the session useEffect above
    setLoading(false);
  }

  async function handleResetPassword() {
    if (!supabase || !email.trim()) {
      toast.error("Digite seu e-mail para recuperar a senha");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) {
      toast.error("Nao foi possivel enviar o e-mail de recuperacao");
      return;
    }
    setResetSent(true);
    toast.success("E-mail de recuperacao enviado");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center px-4 py-10">
      <div className="mb-6 flex items-center gap-1.5">
        <BrazilFlag className="h-4 w-6 rounded-sm" />
        <MinasGeraisFlag className="h-4 w-6 rounded-sm" />
        <TennisBallIcon className="size-4 text-secondary" />
      </div>
      <div className="mb-6 flex justify-center">
        <OfficialLogo className="size-16 rounded-2xl object-contain" />
      </div>
      <Card className="w-full">
        <CardContent className="p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">Entrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse sua conta do Tenis Entre Amigos
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              E-mail
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Senha
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          {resetSent ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Verifique seu e-mail para redefinir a senha.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResetPassword}
              className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Esqueci minha senha
            </button>
          )}

          <div className="mt-6 border-t pt-4 text-center">
            <span className="text-sm text-muted-foreground">Nao tem conta? </span>
            <Link to="/signup" className="text-sm font-semibold text-secondary hover:underline">
              Criar conta
            </Link>
          </div>
        </CardContent>
      </Card>
      <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar para a pagina inicial
      </Link>
    </main>
  );
}
