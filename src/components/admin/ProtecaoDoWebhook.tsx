import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConferenciaDoWebhook } from '@/hooks/use-conferencia-do-webhook';
import { useAdminReconfigurarWebhook } from '@/hooks/use-admin-whatsapp';
import {
  podeLigarARecusa,
  prontidaoDaInstancia,
  type EstadoDaInstancia,
  type LinhaDeConferencia,
} from '@/lib/prontidao-do-webhook';

/**
 * Quem está mandando evento para o nosso webhook do WhatsApp — item 16 da dívida técnica.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 O QUE ESTE PAINEL RESOLVE
 * ---------------------------------------------------------------------------------
 * O endereço que a operadora chama quando chega mensagem é público por natureza, e hoje não
 * confere NADA: quem souber o nome da instância consegue inventar conversa na caixa de entrada
 * da empresa, ou derrubar o envio forjando um evento de desconexão.
 *
 * O conserto não pode ser ligado de uma vez. Ligar a conferência antes de a operadora começar
 * a mandar o segredo recusaria 100% do tráfego real, e a caixa pararia **em silêncio**, com a
 * instância ainda aparecendo "conectada". Já aconteceu neste sistema.
 *
 * Por isso a sequência é: proteger o endereço de cada instância (o botão), observar por alguns
 * dias até 100% dos eventos chegarem com o segredo certo (os números), e só então passar a
 * recusar. Este painel é o instrumento dessa espera — sem ele, a decisão sairia de um palpite.
 */

const APARENCIA: Record<EstadoDaInstancia, { rotulo: string; classe: string; Icone: typeof ShieldAlert }> = {
  'sem-segredo':   { rotulo: 'Sem senha',          classe: 'bg-destructive/10 text-destructive border-destructive/30', Icone: ShieldAlert },
  'sem-movimento': { rotulo: 'Sem movimento',      classe: 'bg-muted text-muted-foreground border-border',             Icone: ShieldQuestion },
  'esperando':     { rotulo: 'Esperando',          classe: 'bg-amber-500/10 text-amber-600 border-amber-500/30',       Icone: ShieldQuestion },
  'parcial':       { rotulo: 'Parcial',            classe: 'bg-amber-500/10 text-amber-600 border-amber-500/30',       Icone: ShieldQuestion },
  'pronta':        { rotulo: 'Protegida',          classe: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', Icone: ShieldCheck },
};

function LinhaDaInstancia({ linha }: { linha: LinhaDeConferencia }) {
  const reconfigurar = useAdminReconfigurarWebhook();
  const prontidao = prontidaoDaInstancia(linha);
  const { rotulo, classe, Icone } = APARENCIA[prontidao.estado];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', prontidao.estado === 'sem-segredo' ? 'text-destructive' : 'text-muted-foreground')} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{linha.empresa ?? 'Empresa sem nome'}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{linha.instance_name}</span>
          <Badge variant="outline" className={cn('text-[10px]', classe)}>{rotulo}</Badge>
          {linha.status !== 'connected' && (
            <span className="text-[11px] text-muted-foreground/70">desconectada</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{prontidao.texto}</p>
      </div>

      <Button
        size="sm"
        variant={prontidao.estado === 'sem-segredo' ? 'default' : 'outline'}
        className="shrink-0"
        disabled={reconfigurar.isPending}
        onClick={() => reconfigurar.mutate(linha.instancia_id)}
        title={
          prontidao.estado === 'sem-segredo'
            ? 'Cria uma senha e registra o novo endereço na operadora. Não muda o que já está configurado lá — só o endereço.'
            : 'Cria uma senha NOVA e substitui a atual. Use se desconfiar que a anterior vazou.'
        }
      >
        {reconfigurar.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
        {prontidao.estado === 'sem-segredo' ? 'Proteger endereço' : 'Trocar a senha'}
      </Button>
    </div>
  );
}

export function ProtecaoDoWebhook() {
  const { data, isLoading, error } = useConferenciaDoWebhook();
  const linhas = data ?? [];
  const veredito = podeLigarARecusa(linhas);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quem pode mandar evento para o WhatsApp</CardTitle>
        <p className="text-xs text-muted-foreground">
          O endereço que a operadora chama quando chega mensagem é aberto: hoje qualquer um que
          descubra o nome da instância consegue inventar conversa na caixa de entrada. Proteger o
          endereço põe uma senha nele — e o sistema só passa a recusar quem não a apresenta
          depois que todos os eventos reais estiverem chegando com ela.
        </p>
      </CardHeader>

      <CardContent className="space-y-2">
        {isLoading && (
          <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Conferindo…
          </div>
        )}

        {error && (
          <p className="p-3 text-sm text-destructive">
            Não foi possível ler a conferência. {(error as Error)?.message}
          </p>
        )}

        {!isLoading && !error && linhas.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">Nenhuma instância de WhatsApp cadastrada.</p>
        )}

        {linhas.map((linha) => (
          <LinhaDaInstancia key={linha.instancia_id} linha={linha} />
        ))}

        {!isLoading && !error && linhas.length > 0 && (
          <div className={cn('mt-3 rounded-md p-3 text-xs', veredito.pode
            ? 'bg-emerald-500/10 text-emerald-700'
            : 'bg-muted/40 text-muted-foreground')}>
            <p>
              {veredito.pode
                ? 'Os números que dava para conferir estão todos confirmados. Já dá para o sistema passar a recusar quem chega sem a senha — é uma mudança de código, avise quem cuida disso.'
                : `Ainda não dá para o sistema passar a recusar: ${veredito.pendentes.join(', ')} não confirmou nas últimas 24h.`}
            </p>
            {veredito.naoMedidas.length > 0 && (
              // Não impedem, e por isso mesmo precisam aparecer: "não impede" não é "foi
              // confirmada", e quem lê o verde tem que saber quem ficou de fora da conta.
              <p className="mt-1.5 opacity-80">
                Fora da conta por não terem recebido nada nas últimas 24h:{' '}
                {veredito.naoMedidas.join(', ')}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
