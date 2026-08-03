import { Building2, Check, MessageCircle, Paperclip, User } from 'lucide-react';
import { HeaderSecao, LPSection } from './LPSection';

/**
 * Bloco Antes/Depois. Em vez de duas listas de bullets, cada lado mostra uma
 * simulação do que o vendedor realmente vê hoje (conversas soltas no WhatsApp)
 * e do que passa a ver (o mesmo pedido virado negócio, com contexto).
 */
export function AntesAgoraSection() {
  return (
    <LPSection id="problema" tom="elevado">
      <HeaderSecao
        eyebrow="O cenário"
        titulo={
          <>
            Seu vendedor está na rua. Sua carteira, <span className="text-primary">na cabeça dele</span>.
          </>
        }
        apoio="O pedido combinado por mensagem, o orçamento no e-mail de alguém, o retorno prometido na memória de quem visitou a obra. Enquanto der certo, dá certo — até o vendedor tirar férias, ficar doente ou pedir demissão."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ANTES */}
        <div className="overflow-hidden rounded-xl border border-border bg-lp-ink">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="rounded-md bg-destructive/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-destructive">
              ANTES
            </span>
            <span className="font-display text-sm font-semibold text-foreground">
              WhatsApp do vendedor
            </span>
            <span className="ml-auto text-xs text-muted-foreground">sem rastro</span>
          </div>

          <div className="relative h-[19rem] overflow-hidden p-4">
            <div className="flex flex-col gap-2.5">
              <BalaoWhats texto="Boa tarde! Consegue me passar o preço do bloco de 14?" hora="09:12" />
              <BalaoWhats texto="Vou levantar e te retorno ainda hoje" hora="09:40" meu />
              <BalaoWhats texto="E aquele orçamento da obra do Alecrim, saiu?" hora="14:03" />
              {/* A cobrança do cliente é a mensagem que dói — precisa ficar acima
                  do gradiente, que só esmaece a área dos alertas. */}
              <BalaoWhats texto="Oi, ficou de me retornar semana passada..." hora="ontem" />
            </div>

            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-lp-ink via-lp-ink/85 to-transparent"
            />
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
              <Alerta>Sem histórico</Alerta>
              <Alerta>Ninguém mais enxerga</Alerta>
              <Alerta>Sai com o vendedor</Alerta>
            </div>
          </div>
        </div>

        {/* DEPOIS */}
        <div className="overflow-hidden rounded-xl border border-primary/30 bg-lp-ink shadow-brand">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
              DEPOIS
            </span>
            <span className="font-display text-sm font-semibold text-foreground">
              A mesma conversa, dentro do negócio
            </span>
          </div>

          <div className="flex h-[19rem] flex-col gap-2 bg-lp-ink-elevado p-4">
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold text-card-foreground">
                    Bloco estrutural 14 — Obra Alecrim
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    Construtora Meridiano
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-kanban-budget/15 px-2 py-0.5 text-[10px] font-semibold text-kanban-budget">
                  Orçamento
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-border pt-2.5">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  Marcos
                </span>
                <span className="text-[11px] text-muted-foreground">Retornar até sexta</span>
                <span className="ml-auto font-mono text-xs font-semibold tabular-nums text-primary">
                  R$ 84.500
                </span>
              </div>
            </div>

            <LinhaContexto icone={MessageCircle} texto="3 mensagens do WhatsApp anexadas" />
            <LinhaContexto icone={Paperclip} texto="Proposta enviada por e-mail · 12/03" />
            <LinhaContexto icone={Building2} texto="Obra com endereço, contatos e mapa" />

            <div className="mt-auto flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.08] px-3 py-2.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
                <Check className="h-2.5 w-2.5 text-lp-ink" strokeWidth={3.5} />
              </span>
              <span className="text-xs font-semibold text-primary">
                Todo o time enxerga. Nada depende de memória.
              </span>
            </div>
          </div>
        </div>
      </div>
    </LPSection>
  );
}

function BalaoWhats({ texto, hora, meu }: { texto: string; hora: string; meu?: boolean }) {
  return (
    <div className={meu ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 ${
          meu ? 'rounded-br-sm bg-secondary' : 'rounded-bl-sm bg-card'
        }`}
      >
        <p className="text-xs leading-relaxed text-card-foreground">{texto}</p>
        <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{hora}</p>
      </div>
    </div>
  );
}

function LinhaContexto({
  icone: Icone,
  texto,
}: {
  icone: React.ComponentType<{ className?: string }>;
  texto: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
      <Icone className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate text-xs text-card-foreground">{texto}</span>
    </div>
  );
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg border border-destructive/25 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
      {children}
    </span>
  );
}
