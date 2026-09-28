import { Link } from "react-router-dom";
import { Menu, X, ArrowRight, Trophy, BarChart3, Swords, Users, Calendar, Handshake, Target, ListOrdered, Scale, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { OfficialLogo } from "@/components/official-logo";
import { BrazilFlag, MinasGeraisFlag, TennisBallIcon } from "@/components/flags";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HERO_IMAGE = "https://images.pexels.com/photos/37090946/pexels-photo-37090946.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";
const EDITION_PHOTO = "/foto_1_torneio.jpg";

const NAV_LINKS = [
  { label: "Inicio", href: "#top" },
  { label: "Historia", href: "#historia" },
  { label: "O Torneio", href: "#torneio" },
  { label: "Patrocinadores", href: "#patrocinadores" },
];

export function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div id="top" className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Left: logo */}
          <Link to="/" className="flex items-center">
            <OfficialLogo className="h-11 w-11 rounded-lg object-contain ring-1 ring-primary/15" />
          </Link>

          {/* Center: flags + ball */}
          <div className="flex items-center gap-2">
            <BrazilFlag className="h-4 w-6 rounded-sm shadow-sm" />
            <MinasGeraisFlag className="h-4 w-6 rounded-sm shadow-sm" />
            <TennisBallIcon className="size-4 text-secondary" />
          </div>

          {/* Right: nav + actions */}
          <div className="flex items-center gap-4">
            <nav className="hidden items-center gap-6 lg:flex">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <Link to="/login" className={cn(buttonVariants(), "hidden sm:inline-flex")}>
              Entrar
            </Link>
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="grid size-9 place-items-center rounded-lg border lg:hidden"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-display text-sm font-bold">Menu</span>
              <button onClick={() => setMobileMenuOpen(false)} className="grid size-8 place-items-center rounded-lg">
                <X className="size-5" />
              </button>
            </div>
            <nav className="space-y-1 px-3 py-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
              <Link to="/login" className={cn(buttonVariants(), "mt-2 w-full")}>
                Entrar
              </Link>
            </nav>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={HERO_IMAGE}
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
          <div className="absolute inset-0 bg-secondary/20" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
          <div className="mb-8 flex justify-center">
            <OfficialLogo className="size-32 rounded-3xl object-contain ring-2 ring-primary/30 shadow-2xl backdrop-blur sm:size-40" />
          </div>

          <p className="mt-2 font-display text-2xl text-primary sm:text-3xl">
            Rivalidade na quadra. Amizade fora dela.
          </p>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
            A plataforma que reune torneios, ranking e amistosos entre jogadores.
            Compita, desafie seus amigos e construa sua historia no tenis.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/login"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full sm:w-auto",
              )}
            >
              Entrar <ArrowRight className="size-4" />
            </Link>
            <a
              href="#historia"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full border-white/40 bg-white text-secondary hover:bg-white/90 sm:w-auto",
              )}
            >
              Conheca nossa historia
            </a>
          </div>
        </div>
      </section>

      {/* Historia section */}
      <section id="historia" className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-secondary">A origem</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Como tudo comecou
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                O Tenis Entre Amigos nasceu da vontade de transformar partidas entre amigos
                em algo maior: uma comunidade formada por jogadores, desafios, competicao e,
                principalmente, amizade.
              </p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
                O que comecou com jogos casuais evoluiu para um formato organizado, com torneios,
                ranking oficial e amistosos que fortalecem a rivalidade e o espirito esportivo
                entre os participantes.
              </p>
            </div>
            <figure className="overflow-hidden rounded-xl border bg-muted">
              <img src={EDITION_PHOTO} alt="1ª Edicao do Torneio" className="size-full object-cover" />
              <figcaption className="bg-card px-4 py-3 text-center text-sm font-semibold text-secondary">
                1ª edicao — 18/07/2026
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* O Torneio + Ranking section */}
      <section id="torneio" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-secondary">Como funciona</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Torneio e Ranking</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            O Torneio e o Ranking sao duas dinamicas relacionadas, mas com funcionamento diferente.
            Entenda como cada um funciona.
          </p>
        </div>

        {/* Torneio subsection */}
        <div className="mt-12 rounded-2xl border bg-card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-secondary">
              <Trophy className="size-6" />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold tracking-tight">Torneio</h3>
              <p className="text-xs text-muted-foreground">Competicao por edicao</p>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            O Torneio e a competencia principal. Acontece em edicoes com data marcada e reune todos
            os jogadores inscritos em um formato de grupos seguido de mata-mata.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <InfoBlock icon={<Users className="size-4" />} title="Participacao">
              Todos os jogadores inscritos participam. Os jogadores sao divididos em grupos de 4.
            </InfoBlock>
            <InfoBlock icon={<Calendar className="size-4" />} title="Grupos (Round Robin)">
              4 jogadores por grupo. Todos enfrentam todos dentro do grupo. Sao 6 partidas por grupo.
            </InfoBlock>
            <InfoBlock icon={<Target className="size-4" />} title="Partidas">
              Cada partida tem exatamente 1 set. Nao ha melhor de 3, melhor de 5 ou SUP no Torneio.
              Quem somar mais pontos no set vence.
            </InfoBlock>
            <InfoBlock icon={<ListOrdered className="size-4" />} title="Pontuacao">
              Vitoria vale 3 pontos. Derrota vale 0 pontos. Os melhores de cada grupo avancam.
            </InfoBlock>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <InfoBlock icon={<Trophy className="size-4" />} title="Mata-mata (Top 8)">
              Os 8 melhores classificados disputam quartas, semifinais e final em eliminacao unica.
            </InfoBlock>
            <InfoBlock icon={<Scale className="size-4" />} title="Desempate">
              Pontos, confronto direto, saldo de sets e ordem alfabetica, nesta ordem.
            </InfoBlock>
          </div>
        </div>

        {/* Ranking subsection */}
        <div className="mt-6 rounded-2xl border bg-card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary/10 text-secondary">
              <BarChart3 className="size-6" />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold tracking-tight">Ranking</h3>
              <p className="text-xs text-muted-foreground">Classificacao acumulada na temporada</p>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            O Ranking e a classificacao acumulada dos jogadores ao longo da temporada. Ele existe
            paralelamente ao Torneio e tem regras proprias de pontuacao.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <InfoBlock icon={<Calendar className="size-4" />} title="Rodadas">
              O Ranking tem 4 rodadas durante a temporada. Cada jogador enfrenta um adversario por rodada.
            </InfoBlock>
            <InfoBlock icon={<Target className="size-4" />} title="Pontuacao por sets">
              Cada set vale 9 pontos. Vencer por 2x0 da 18 pontos ao vencedor. Vencer por 2x1 da 18
              ao vencedor e 9 ao perdedor.
            </InfoBlock>
            <InfoBlock icon={<Scale className="size-4" />} title="SUP (Super Tie-break)">
              O SUP acontece somente quando o placar esta 1x1. Ele nao gera pontos, apenas decide
              o vencedor da partida.
            </InfoBlock>
            <InfoBlock icon={<Trophy className="size-4" />} title="Mata-mata do Ranking">
              Apos as 4 rodadas, o admin gera o mata-mata do Ranking: Top 4 (ate 8 jogadores) ou
              Top 8 (mais de 8), com semifinais e final.
            </InfoBlock>
          </div>
        </div>

        {/* Relationship note */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[.04] p-5">
          <ShieldCheck className="size-5 shrink-0 text-secondary" />
          <p className="text-sm leading-6 text-muted-foreground">
            <strong className="font-semibold text-foreground">Torneio e Ranking sao coisas diferentes.</strong>{" "}
            O Torneio e disputado por edicao, com 1 set por partida e 3 pontos por vitoria. O Ranking
            e acumulado na temporada, com 4 rodadas, 9 pontos por set e mata-mata proprio. Os
            resultados do Torneio nao alteram a pontuacao do Ranking.
          </p>
        </div>
      </section>

      {/* Patrocinadores */}
      <section id="patrocinadores" className="border-y border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Patrocinadores
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="grid aspect-[3/2] place-items-center rounded-xl border bg-background"
              >
                <div className="text-center text-muted-foreground">
                  <Handshake className="mx-auto size-6" />
                  <p className="mt-1 text-[11px]">Patrocinador</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="relative overflow-hidden bg-secondary">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-black/20" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Faca parte da nossa comunidade
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
            Entre, desafie seus amigos, compita e construa sua historia no tenis.
          </p>
          <Link
            to="/login"
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-8 w-full bg-primary text-black hover:bg-primary/90 sm:w-auto",
            )}
          >
            Entrar <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
          <OfficialLogo className="h-8 w-8 rounded-lg object-contain" />
          <div className="flex items-center gap-3">
            <BrazilFlag className="h-3.5 w-5 rounded-sm" />
            <MinasGeraisFlag className="h-3.5 w-5 rounded-sm" />
            <TennisBallIcon className="size-3.5 text-secondary" />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/rules" className="hover:text-foreground">Regras</Link>
            <Link to="/login" className="hover:text-foreground">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function InfoBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-secondary">
          {icon}
        </span>
        <h4 className="font-display text-sm font-bold">{title}</h4>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{children}</p>
    </div>
  );
}
