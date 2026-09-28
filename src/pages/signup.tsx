import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OfficialLogo } from "@/components/official-logo";
import { BrazilFlag, MinasGeraisFlag, TennisBallIcon } from "@/components/flags";

export function SignupPage() {
  const navigate = useNavigate();
  const supabase = getSupabase();
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 6) {
      toast.error("A senha deve ter no minimo 6 caracteres");
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          display_name: displayName.trim() || fullName.trim(),
          phone: phone.trim() || null,
        },
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.rpc("create_own_profile", {
        p_email: email.trim(),
        p_full_name: fullName.trim(),
        p_display_name: displayName.trim() || fullName.trim(),
        p_phone: phone.trim() || null,
      });

      if (profileError) {
        console.error("Profile creation failed", profileError);
        toast.error("Conta criada, mas o perfil nao foi salvo. Tente fazer login.");
      } else {
        toast.success("Conta criada com sucesso");
      }
    }

    setLoading(false);
    navigate("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center px-4 py-10">
      <div className="mb-4 flex items-center gap-1.5">
        <BrazilFlag className="h-4 w-6 rounded-sm" />
        <MinasGeraisFlag className="h-4 w-6 rounded-sm" />
        <TennisBallIcon className="size-4 text-secondary" />
      </div>
      <div className="mb-6 flex justify-center">
        <OfficialLogo className="size-16 rounded-2xl object-contain" />
      </div>
      <Card className="w-full">
        <CardContent className="p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre-se para participar dos torneios
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              Nome completo
              <Input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Nome de exibicao
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Como aparecer nos torneios (opcional)"
              />
            </label>
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
              Celular
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Senha
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
              />
            </label>

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "Criando conta..." : "Cadastrar"}
            </Button>
          </form>

          <div className="mt-6 border-t pt-4 text-center">
            <span className="text-sm text-muted-foreground">Ja tem conta? </span>
            <Link to="/login" className="text-sm font-semibold text-secondary hover:underline">
              Fazer login
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
