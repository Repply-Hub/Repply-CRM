import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useRegistrarMotivoDeCancelamento } from '@/hooks/use-assinatura-motivos';

/**
 * Pergunta POR QUE antes de mandar a pessoa cancelar no Stripe. Pedido do Lucas em
 * 29/08/2026.
 *
 * 🔴 O MOTIVO SÓ SE COLETA NESTE INSTANTE. Depois que a pessoa cancela, ela não volta para
 * responder pesquisa nenhuma — e "por que os clientes saem" é a informação mais cara de se
 * conseguir depois e a mais barata de se conseguir agora.
 *
 * 🔴 E ELE NUNCA IMPEDE O CANCELAMENTO. Se a gravação do motivo falhar, o cancelamento segue
 * assim mesmo. Prender alguém que quer sair porque a NOSSA telemetria falhou é o tipo de
 * atrito que vira reclamação — e, em alguns lugares, problema jurídico. O motivo é nosso
 * interesse, não uma condição.
 */

const MOTIVOS = [
  { valor: 'caro', rotulo: 'Ficou caro para o momento da empresa' },
  { valor: 'nao_usamos', rotulo: 'A equipe não adotou no dia a dia' },
  { valor: 'falta_recurso', rotulo: 'Falta alguma coisa que precisamos' },
  { valor: 'outro_sistema', rotulo: 'Vamos usar outro sistema' },
  { valor: 'pausa', rotulo: 'É só uma pausa, pretendemos voltar' },
  { valor: 'outro', rotulo: 'Outro motivo' },
] as const;

interface Props {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** O que fazer depois de registrar: abrir o portal do Stripe, onde o cancelamento acontece. */
  aoConfirmar: () => void | Promise<void>;
}

export function CancelarAssinaturaDialog({ aberto, onOpenChange, aoConfirmar }: Props) {
  const [motivo, setMotivo] = useState<string>('');
  const [detalhe, setDetalhe] = useState('');
  const [enviando, setEnviando] = useState(false);
  const registrar = useRegistrarMotivoDeCancelamento();

  const seguir = async () => {
    setEnviando(true);
    try {
      // 🔴 `await` com o erro engolido de propósito — ver o cabeçalho. O `catch` vazio aqui
      // não é descuido: é a decisão de que a telemetria nunca segura quem quer sair.
      await registrar.mutateAsync({ motivo, detalhe: detalhe.trim() || null }).catch(() => {});
      await aoConfirmar();
      onOpenChange(false);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <ConteudoDialogo className="sm:max-w-lg">
        <CabecalhoDialogo>
          <DialogTitle>Antes de cancelar</DialogTitle>
          <DialogDescription>
            Seu acesso continua até o fim do período já pago. Se puder, conte o que motivou —
            ajuda a melhorar o sistema.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          <RadioGroup value={motivo} onValueChange={setMotivo} className="gap-2">
            {MOTIVOS.map((opcao) => (
              <div key={opcao.valor} className="flex items-center gap-2.5">
                <RadioGroupItem value={opcao.valor} id={`motivo-${opcao.valor}`} />
                <Label htmlFor={`motivo-${opcao.valor}`} className="cursor-pointer font-normal">
                  {opcao.rotulo}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="detalhe-cancelamento" className="text-xs text-muted-foreground">
              Quer detalhar? (opcional)
            </Label>
            <Textarea
              id="detalhe-cancelamento"
              rows={3}
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              placeholder="O que faltou, ou o que atrapalhou."
            />
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          {/* 🔴 O botão NÃO exige motivo escolhido. Tornar obrigatório transformaria a
              pesquisa em pedágio, e quem quer sair responderia qualquer coisa para passar —
              dado ruim é pior que dado ausente. */}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enviando}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={seguir} disabled={enviando}>
            {enviando ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="mr-1.5 h-4 w-4" />
            )}
            Continuar para o cancelamento
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
