import { useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Trophy, Target, ListOrdered, Scale, ShieldCheck, BarChart3 } from "lucide-react";

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-secondary">
          {icon}
        </span>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function Seed({ n }: { n: number }) {
  return (
    <span className="inline-grid size-5 place-items-center rounded bg-primary/10 text-[11px] font-bold text-secondary">
      {n}
    </span>
  );
}

export function RulesPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Voltar
        </button>
      </div>

      <header className="mt-8">
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Formato e regras</h1>
        <p className="mt-3 max-w-prose text-base leading-7 text-muted-foreground">
          Um torneio com grupos, classificacao e mata-mata dos 8 melhores para
          decidir o campeao. Veja como cada etapa funciona.
        </p>
      </header>

      <div className="mt-8 grid gap-4">
        {/* Torneio rules */}
        <Section icon={<Trophy className="size-5" />} title="Torneio - As duas fases">
          <p>
            <strong className="font-semibold text-foreground">Grupos (round robin).</strong> 4
            jogadores por grupo. Todos enfrentam todos. Cada grupo tem exatamente
            6 partidas. Isso classifica os melhores para o mata-mata.
          </p>
          <p>
            <strong className="font-semibold text-foreground">Mata-mata (Top 8).</strong> Os 8
            melhores classificados avancam para um bracket de eliminacao unica.
            Perdeu, esta fora. Quartas, semifinais e final.
          </p>
        </Section>

        <Section icon={<Users className="size-5" />} title="Grupos">
          <ul className="ml-4 grid gap-1 list-disc">
            <li>4 jogadores por grupo</li>
            <li>Todos contra todos dentro do grupo</li>
            <li>6 partidas por grupo</li>
            <li>Quantidade de grupos = jogadores / 4</li>
          </ul>
        </Section>

        <Section icon={<Target className="size-5" />} title="Partidas do Torneio">
          <p>
            Cada partida possui <strong className="font-semibold text-foreground">exatamente 1 set</strong>.
            O vencedor e quem tiver a maior pontuacao no unico set. Nao existe
            segundo set, terceiro set, melhor de 3, melhor de 5 ou SUP no Torneio.
          </p>
        </Section>

        <Section icon={<Trophy className="size-5" />} title="Pontuacao do Torneio">
          <ul className="ml-4 grid gap-1 list-disc">
            <li><strong>Vitoria:</strong> 3 pontos</li>
            <li><strong>Derrota:</strong> 0 pontos</li>
          </ul>
        </Section>

        <Section icon={<ListOrdered className="size-5" />} title="Classificacao para o mata-mata">
          <p>
            <strong className="font-semibold text-foreground">8 participantes:</strong> todos os 8 avancam.
          </p>
          <p>
            <strong className="font-semibold text-foreground">Mais de 8:</strong> os dois primeiros de
            cada grupo tem classificacao garantida. As vagas restantes sao preenchidas com os
            melhores jogadores da classificacao geral. Total final sempre de 8 classificados.
          </p>
        </Section>

        <Section icon={<Scale className="size-5" />} title="Criterios de desempate do Torneio">
          <ol className="ml-1 grid gap-2">
            {[
              ["Pontos", "Total de pontos acumulados nas partidas do grupo."],
              ["Confronto direto", "Apenas os jogos entre os jogadores empatados contam."],
              ["Saldo de sets", "Sets ganhos menos sets perdidos em todo o torneio."],
              ["Nome", "Ordem alfabetica como ultimo criterio estavel."],
            ].map(([label, detail], i) => (
              <li key={label} className="flex gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-secondary">{i + 1}</span>
                <span><strong className="font-semibold text-foreground">{label}.</strong> {detail}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section icon={<ListOrdered className="size-5" />} title="Cruzamento do mata-mata">
          <p>
            O cruzamento entre grupos evita jogadores do mesmo grupo nas quartas
            quando ha alternativa. Da vantagem aos primeiros colocados, priorizando
            1 x 2 e utilizando 1 x 3 quando necessario.
          </p>
          <p>
            Para 4 grupos, por exemplo: A1 x B2, B1 x C2, C1 x D2, D1 x A2. Mas isso
            e dinamico, nao fixo.
          </p>
          <p>
            Depois: 4 quartas, 2 semifinais, final. Todas as partidas do mata-mata
            continuam sendo de <strong className="font-semibold text-foreground">1 set</strong>.
          </p>
        </Section>

        {/* Ranking rules */}
        <Section icon={<BarChart3 className="size-5" />} title="Ranking - Regras separadas">
          <p>
            O Ranking oficial possui <strong className="font-semibold text-foreground">4 rodadas</strong>.
            Cada partida tem 2 jogadores. A pontuacao e por sets.
          </p>
          <ul className="ml-4 grid gap-1 list-disc">
            <li>Cada set vale <strong>9 pontos</strong></li>
            <li><strong>2 x 0:</strong> Vencedor = 18 pontos, Perdedor = 0 pontos</li>
            <li><strong>2 x 1:</strong> Vencedor = 18 pontos, Perdedor = 9 pontos</li>
            <li><strong>SUP:</strong> Somente quando 1-1. Nao gera pontos, apenas decide o vencedor</li>
          </ul>
        </Section>

        <Section icon={<ListOrdered className="size-5" />} title="Mata-mata do Ranking">
          <p>
            Apos as 4 rodadas, o admin pode gerar o mata-mata do Ranking.
          </p>
          <p>
            <strong className="font-semibold text-foreground">Ate 8 participantes:</strong> classificam
            os 4 primeiros. Semifinais: 1 x 4 e 2 x 3. Depois final.
          </p>
          <p>
            <strong className="font-semibold text-foreground">Mais de 8:</strong> classificam os 8
            primeiros. Quartas: 1 x 8, 2 x 7, 3 x 6, 4 x 5. Depois semifinais e final.
          </p>
          <p className="text-xs">
            Esse mata-mata e exclusivo do Ranking e nao altera as regras do Torneio.
          </p>
        </Section>

        <Section icon={<ShieldCheck className="size-5" />} title="Disputas e regras completas">
          <p>
            Estas sao as regras do Tenis Entre Amigos. O organizador resolve qualquer
            disputa em quadra.
          </p>
        </Section>
      </div>
    </div>
  );
}
