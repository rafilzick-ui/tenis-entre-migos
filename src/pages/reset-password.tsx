import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const supabase = getSupabase();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHasSession(true);
      }
      setChecking(false);
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    if (!newPassword) {
      toast.error("Digite a nova senha");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter no minimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas nao coincidem");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      if (error.message.includes("session") || error.message.includes("token")) {
        toast.error("Link expirado ou invalido. Solicite a recuperacao novamente.");
      } else {
        toast.error(error.message ?? "Nao foi possivel redefinir a senha");
      }
      setLoading(false);
      return;
    }

    toast.success("Senha redefinida com sucesso");
    setLoading(false);
    navigate("/login");
  }

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </main>
    );
  }

  if (!hasSession) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
        <Card className="w-full">
          <CardContent className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight">Link expirado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O link de recuperacao expirou ou e invalido. Solicite a recuperacao de senha novamente.
            </p>
            <Link to="/login" className="mt-6 inline-block">
              <Button variant="outline">Voltar para o login</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardContent className="p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">Redefinir senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Digite sua nova senha
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              Nova senha
              <Input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Confirmar nova senha
              <Input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </label>

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "Redefinindo..." : "Redefinir senha"}
            </Button>
          </form>

          <div className="mt-6 border-t pt-4 text-center">
            <Link to="/login" className="text-sm font-semibold text-secondary hover:underline">
              Voltar para o login
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
