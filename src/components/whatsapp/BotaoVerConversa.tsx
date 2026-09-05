import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useConversaDoContato } from '@/hooks/use-conversa-do-contato';
import { useSecaoLigada } from '@/hooks/use-secoes';

interface BotaoVerConversaProps {
  /** Telefone da pessoa, do jeito que está no cadastro. É por ele que a conversa é achada. */
  telefone?: string | null;
  /** Id do contato, quando existir: o vínculo gravado vale mais que o casamento por telefone. */
  contatoId?: string | null;
  /** Nome de quem se vai conversar, para a dica do botão dizer com quem. */
  nome?: string | null;
  /** Só o ícone — para caber numa linha de tabela sem empurrar as colunas. */
  compacto?: boolean;
  className?: string;
}

/**
 * O atalho que leva da ficha para a conversa de WhatsApp daquela pessoa.
 *
 * 🔴 EXISTE PARA ACABAR COM AS TRÊS CÓPIAS. Até 04/09/2026 o mesmo gesto estava escrito à mão em
 * três arquivos (`ContatoDetalhe`, o aviso de mensagem nova e o diálogo de enviar catálogo), cada
 * um montando o endereço por conta própria. O contrato é um só e vive aqui:
 * `/whatsapp?conversaId=<id da linha em whatsapp_conversas>`.
 *
 * 🔴 ACESO OU APAGADO, NUNCA ESCONDIDO. Quando não há conversa com aquela pessoa, o botão
 * continua na tela, apagado e sem clique, dizendo que não há conversa. Sumir seria pior: quem
 * olha a lista não saberia se não existe conversa ou se o sistema não a encontrou — e "ausência
 * de informação não é informação".
 *
 * 🔴 RESPEITA A SEÇÃO. WhatsApp é módulo que a empresa assinante pode não ter contratado
 * (`src/lib/secoes.ts`). Sem ele, o botão não é desenhado — mesma trava que as outras telas usam.
 */
export function BotaoVerConversa({
  telefone,
  contatoId,
  nome,
  compacto = false,
  className,
}: BotaoVerConversaProps) {
  const navigate = useNavigate();
  const { ligada: temWhatsapp } = useSecaoLigada('whatsapp');
  const { conversaId, carregando } = useConversaDoContato(
    telefone,
    contatoId,
    temWhatsapp !== false && (!!telefone || !!contatoId),
  );

  // `=== false` é deliberado: enquanto a resposta não chega, o botão fica fora. Controle que
  // aparece e some no meio da leitura é pior que controle que demora — mesmo critério do campo
  // de obra em NovoNegocioDialog.
  if (temWhatsapp === false) return null;

  const temConversa = !!conversaId;
  const dica = temConversa
    ? `Ver conversa${nome ? ` com ${nome}` : ''} no WhatsApp`
    : `Sem conversa de WhatsApp${nome ? ` com ${nome}` : ''}`;

  const botao = (
    <Button
      variant={compacto ? 'ghost' : 'outline'}
      size="sm"
      className={cn(
        compacto ? 'h-7 w-7 p-0' : 'h-7 gap-1.5 text-xs',
        !temConversa && 'opacity-40',
        className,
      )}
      disabled={!temConversa || carregando}
      aria-label={dica}
      onClick={() => navigate(`/whatsapp?conversaId=${encodeURIComponent(conversaId!)}`)}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
      {!compacto && (temConversa ? 'Ver conversa' : 'Sem conversa')}
    </Button>
  );

  // O `<span>` existe porque botão desabilitado não dispara os eventos do mouse, e sem ele a
  // dica — que é justamente o que explica por que o botão está apagado — nunca apareceria.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{botao}</span>
      </TooltipTrigger>
      <TooltipContent>{dica}</TooltipContent>
    </Tooltip>
  );
}
