import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Plus, Calendar, Users, ChevronRight, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type TournamentListItem = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  registration_count: number;
};

export function TournamentsPage() {
  const { profile } = useAuth();
  const supabase = getSupabase();
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TournamentListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data, error } = await supabase
        .from("tournaments_meta")
        .select("id, name, status, start_date, end_date")
        .order("created_at", { ascending: false });
      if (error) { toast.error("Erro ao carregar torneios"); return; }

      const items: TournamentListItem[] = [];
      for (const t of data ?? []) {
        const { count } = await supabase
          .from("tournament_registrations")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", t.id);
        items.push({ ...t, registration_count: count ?? 0 });
      }
      setTournaments(items);
      setLoading(false);
    })();
  }, [supabase]);

  async function createTournament() {
    if (!supabase || !profile) return;
    if (!newName.trim()) { toast.error("Nome do torneio e obrigatorio"); return; }
    setCreating(true);
    const { data, error } = await supabase
      .from("tournaments_meta")
      .insert({
        name: newName.trim(),
        start_date: newStart || null,
        end_date: newEnd || null,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) { toast.error("Erro ao criar torneio"); setCreating(false); return; }
    toast.success("Torneio criado");
    setCreateOpen(false);
    setNewName("");
    setNewStart("");
    setNewEnd("");
    setCreating(false);
    setTournaments((prev) => [{ id: data.id, name: newName.trim(), status: "registration", start_date: newStart || null, end_date: newEnd || null, registration_count: 0 }, ...prev]);
  }

  async function deleteTournament() {
    if (!supabase || !deleteTarget) return;
    setDeleting(true);

    // Delete from tournaments_meta (CASCADE removes groups, matches, registrations)
    const { error: metaError } = await supabase
      .from("tournaments_meta")
      .delete()
      .eq("id", deleteTarget.id);

    // Also delete from tournaments (JSONB store) if it exists
    await supabase.from("tournaments").delete().eq("id", deleteTarget.id);

    setDeleting(false);
    if (metaError) {
      toast.error("Erro ao excluir torneio");
      return;
    }
    toast.success("Torneio excluido");
    setTournaments((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  return (
    <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-tight">Torneios</h1>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Novo torneio
            </Button>
          )}
        </header>

        {loading ? (
          <div className="grid place-items-center py-20">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : tournaments.length === 0 ? (
          <Card>
            <CardContent className="grid place-items-center py-16 text-center">
              <Trophy className="size-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Nenhum torneio disponivel ainda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {tournaments.map((t) => (
              <div key={t.id} className="relative group">
                <Link to={`/torneios/${t.id}`}>
                  <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
                    <CardContent className="flex items-center justify-between p-5 pr-14">
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-lg font-bold">{t.name}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="size-3" /> {t.registration_count} inscritos</span>
                          {t.start_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {new Date(t.start_date).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                          <StatusBadge status={t.status} />
                        </div>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
                {isAdmin && (
                  <button
                    onClick={() => setDeleteTarget(t)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 grid size-8 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="Excluir torneio"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo torneio</DialogTitle>
              <DialogDescription>Defina o nome e o periodo do torneio.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Nome do torneio
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Torneio entre Amigos" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Data de inicio
                  <Input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Data de fim
                  <Input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button disabled={creating} onClick={createTournament}>
                {creating ? "Criando..." : "Criar torneio"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir torneio</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir "{deleteTarget?.name}"? Todos os dados serao permanentemente removidos: inscricoes, grupos, partidas e mata-mata. Esta acao nao pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteTournament}
                disabled={deleting}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {deleting ? "Excluindo..." : "Excluir torneio"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    registration: "Inscricoes abertas",
    groups_drawn: "Grupos sorteados",
    playoffs: "Mata-mata",
    complete: "Concluido",
  };
  return (
    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-secondary">
      {labels[status] ?? status}
    </span>
  );
}
