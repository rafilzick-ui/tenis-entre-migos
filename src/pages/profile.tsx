import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Camera, LogOut, Mail, Phone, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";

export function ProfilePage() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const supabase = getSupabase();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </main>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !profile) return;
    setSaving(true);
    const { error } = await supabase.rpc("update_own_profile", {
      p_full_name: fullName.trim(),
      p_display_name: displayName.trim() || fullName.trim(),
      p_phone: phone.trim() || null,
    });
    if (error) {
      toast.error("Nao foi possivel salvar o perfil");
    } else {
      await refreshProfile();
      toast.success("Perfil atualizado");
    }
    setSaving(false);
  }

  async function handleAvatar(file: File) {
    if (!supabase || !profile) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${profile.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      const { error: updErr } = await supabase.rpc("update_own_profile", {
        p_avatar_url: urlData.publicUrl,
      });
      if (updErr) throw updErr;

      await refreshProfile();
      toast.success("Foto de perfil atualizada");
    } catch {
      toast.error("Nao foi possivel enviar a foto");
    } finally {
      setUploading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  const initials = (profile.display_name || profile.full_name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppShell>
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Meu perfil</h1>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="size-4" /> Sair
        </Button>
      </header>

      <Card>
        <CardContent className="p-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="size-20 rounded-xl object-cover ring-1 ring-border"
                />
              ) : (
                <div className="grid size-20 place-items-center rounded-xl bg-secondary text-white font-display text-xl font-bold ring-1 ring-border">
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-lg bg-primary text-brand-black shadow-sm transition-colors hover:bg-primary/80 disabled:opacity-50"
              >
                <Camera className="size-3.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAvatar(f);
                }}
              />
            </div>
            <div>
              <p className="font-display text-lg font-bold">{profile.display_name || profile.full_name}</p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-block rounded-md bg-secondary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-secondary">
                  {profile.role === "admin" ? "Administrador" : "Jogador"}
                </span>
                <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  Nivel: {profile.skill_level}
                </span>
              </div>
            </div>
          </div>

          {/* Edit form */}
          <form onSubmit={handleSave} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              Nome completo
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Nome de exibicao
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              E-mail
              <Input value={profile.email} disabled className="bg-muted/50" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Celular
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </label>

            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar alteracoes"}
            </Button>
          </form>

          {/* Account info */}
          <div className="mt-6 grid gap-2 border-t pt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="size-4" />
              <span>Membro desde {new Date(profile.created_at).toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="size-4" />
              <span>{profile.email}</span>
            </div>
            {profile.phone && (
              <div className="flex items-center gap-2">
                <Phone className="size-4" />
                <span>{profile.phone}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
    </AppShell>
  );
}
