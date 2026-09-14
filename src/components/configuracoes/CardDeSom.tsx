import { useState } from 'react';
import { ChevronDown, Play, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useSomLigado } from '@/hooks/use-som-ligado';
import { useSomEscolhido } from '@/hooks/use-som-escolhido';
import { CATALOGO_DE_SONS, type SomDeNotificacao } from '@/lib/catalogo-de-sons';
import { ouvirAmostra } from '@/lib/som';

/**
 * Liga, desliga e escolhe o som dos avisos.
 *
 * Fica no Perfil, e não em Empresa, porque é preferência de PESSOA: numa sala com
 * cinco atendentes, quem senta ao lado do telefone quer o som e quem está em reunião
 * não. Vive no navegador dela (use-som-ligado, use-som-escolhido).
 *
 * A lista começa FECHADA — pedido do dono do produto: "essa interface de trocar o som
 * não deve estar toda aparente".
 */
export function CardDeSom() {
  const { ligado, definir } = useSomLigado();
  const { id, escolher } = useSomEscolhido();
  const [trocando, setTrocando] = useState(false);

  const principais = CATALOGO_DE_SONS.filter((s) => s.grupo !== 'repply');
  const daRepply = CATALOGO_DE_SONS.filter((s) => s.grupo === 'repply');

  const linha = (s: SomDeNotificacao) => (
    <div
      key={s.id}
      className={cn(
        'flex items-center justify-between gap-2 rounded-md px-2 py-1',
        id === s.id && 'bg-primary/10',
      )}
    >
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
        <input
          type="radio"
          name="som-de-notificacao"
          value={s.id}
          checked={id === s.id}
          onChange={() => {
            escolher(s.id);
            ouvirAmostra(s.id);
          }}
          className="h-3.5 w-3.5 accent-primary"
        />
        {s.rotulo}
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={`Ouvir ${s.rotulo}`}
        onClick={() => ouvirAmostra(s.id)}
      >
        <Play className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary" /> Aviso sonoro
        </CardTitle>
        <CardDescription>Vale só para você, neste computador</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Tocar som nas notificações</p>
            <p className="text-xs text-muted-foreground">
              Avisa quando chega mensagem de WhatsApp, e-mail ou chat interno
              enquanto você está em outra tela. Não toca na conversa que você já
              está lendo.
            </p>
          </div>
          <Switch checked={ligado} onCheckedChange={definir} aria-label="Tocar som nas notificações" />
        </div>

        <button
          type="button"
          onClick={() => setTrocando((v) => !v)}
          aria-expanded={trocando}
          className="mt-4 flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', trocando && 'rotate-180')} />
          Quero mudar o som das minhas notificações
        </button>

        {trocando && (
          <div role="radiogroup" aria-label="Som das notificações" className="mt-2 space-y-0.5">
            {principais.map(linha)}
            <p className="px-2 pt-2 text-[11px] text-muted-foreground">Criados pela Repply</p>
            {daRepply.map(linha)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
