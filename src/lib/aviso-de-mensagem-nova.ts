import { createElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import { tocarNotificacao } from '@/lib/som';
import { somLigado } from '@/hooks/use-som-ligado';
import { somEscolhido } from '@/hooks/use-som-escolhido';
import { IconeWhatsApp } from '@/components/icones/IconeWhatsApp';

/**
 * O aviso que salta na tela quando chega mensagem — de WhatsApp ou do chat
 * interno.
 *
 * 🔴 POR QUE É UMA FUNÇÃO SÓ: os dois avisos eram escritos à mão em arquivos
 * diferentes, e divergiram. O do WhatsApp tinha botão para abrir a conversa; o
 * do chat interno, não — então uma mensagem do time avisava e deixava a pessoa
 * sem para onde ir. O dono do produto pediu que o chat tivesse "notificação na
 * tela assim como são as mensagens de whatsapp", e a forma de garantir isso
 * para sempre não é copiar o código: é ter um lugar só.
 *
 * O som sai daqui junto de propósito. Aviso na tela e som são a MESMA
 * notificação vista por dois sentidos; separá-los foi o que permitiu o chat
 * ficar com um e não com o outro.
 *
 * Os dois avisos compartilham TUDO — texto, som, botão, tamanho — EXCETO a
 * cor de fundo e o selo de origem ao lado do título. Isso é pedido do dono do
 * produto em 14/09/2026: os dois toasts eram idênticos e ninguém conseguia
 * dizer, só de olhar, se a mensagem tinha vindo do WhatsApp ou do time. A
 * diferença mora só em `ORIGENS` abaixo — continue com um lugar só.
 */

/** Quantos caracteres da mensagem cabem na prévia do aviso. */
const PREVIA_MAX_CHARS = 100;

export function previaDaMensagem(
  conteudo: string | null | undefined,
  seVazio: string,
): string {
  const texto = (conteudo ?? '').trim();
  if (!texto) return seVazio;
  return texto.length > PREVIA_MAX_CHARS
    ? `${texto.slice(0, PREVIA_MAX_CHARS)}...`
    : texto;
}

export type OrigemDoAviso = 'whatsapp' | 'chat';

/** O que muda de uma origem para outra: cor do toast, botão e selo do título. */
const ORIGENS: Record<
  OrigemDoAviso,
  {
    rotulo: string;
    estilo: { background: string; color: string; border: string };
    botao: { background: string; color: string };
  }
> = {
  whatsapp: {
    rotulo: 'WhatsApp',
    // O laranja da marca, como sempre foi — o dono do produto pediu para
    // manter este exatamente como está (14/09/2026).
    estilo: { background: '#f97316', color: '#fff', border: 'none' },
    botao: { background: 'rgba(255,255,255,0.2)', color: '#fff' },
  },
  chat: {
    rotulo: 'Chat interno',
    // Cinza bem próximo do preto da marca, e não laranja escuro: um laranja
    // escuro ficaria parecido demais com o do WhatsApp à primeira vista, que
    // é exatamente o problema que este aviso resolve. A borda fina laranja
    // mantém o toast reconhecível como "aviso de mensagem" nos dois casos.
    estilo: { background: '#1c1c1c', color: '#fff', border: '1px solid rgba(249,115,22,0.55)' },
    botao: { background: 'rgba(255,255,255,0.12)', color: '#fff' },
  },
};

/** O selo com o símbolo da origem e o nome dela, ao lado do título. */
function seloDaOrigem(origem: OrigemDoAviso): ReactNode {
  const icone =
    origem === 'whatsapp'
      ? createElement(IconeWhatsApp, { size: 14 })
      : createElement(MessageSquare, { size: 14, 'aria-hidden': true });

  return createElement(
    'span',
    {
      // `flex-wrap` no pai (título) é quem garante que isto desce de linha
      // com um nome comprido, em vez de estourar a largura do toast.
      className: 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none',
      style: { background: 'rgba(255,255,255,0.18)' },
    },
    icone,
    ORIGENS[origem].rotulo,
  );
}

function tituloDoAviso(de: string, origem: OrigemDoAviso): ReactNode {
  return createElement(
    'span',
    { className: 'inline-flex flex-wrap items-center gap-x-1.5 gap-y-1' },
    createElement('span', null, createElement('b', null, de), ' enviou uma mensagem'),
    seloDaOrigem(origem),
  );
}

export interface AvisoDeMensagemNova {
  /**
   * De onde veio a mensagem. Obrigatório de propósito: sem isto, um chamador
   * novo esqueceria de escolher e o aviso saía sem cor nem selo definidos.
   */
  origem: OrigemDoAviso;
  /** Quem mandou — vai em negrito. */
  de: string;
  /** A prévia, ou o ícone+rótulo quando não é texto. */
  previa: React.ReactNode;
  /** Para onde levar ao clicar. Sem isto o aviso não ganha botão. */
  aoAbrir?: () => void;
  /**
   * Conversa que gerou o aviso, quando houver. O som usa isto para calar
   * quando a pessoa já está com aquela conversa aberta na frente dela.
   */
  conversaId?: string | null;
}

export function avisarMensagemNova({
  origem,
  de,
  previa,
  aoAbrir,
  conversaId,
}: AvisoDeMensagemNova): void {
  tocarNotificacao({ ligado: somLigado(), conversaId, somId: somEscolhido() });

  const { estilo, botao } = ORIGENS[origem];

  toast(() => tituloDoAviso(de, origem), {
    description: previa,
    // Fundo cheio nos dois — é o que faz o aviso ser visto por cima de
    // qualquer tela, e é o único toast do sistema assim.
    style: estilo,
    descriptionClassName: '!text-white/90',
    ...(aoAbrir
      ? {
          action: { label: 'Abrir conversa', onClick: aoAbrir },
          actionButtonStyle: botao,
        }
      : {}),
  });
}
