import { createElement } from 'react';
import { toast } from 'sonner';
import { tocarNotificacao } from '@/lib/som';
import { somLigado } from '@/hooks/use-som-ligado';

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

export interface AvisoDeMensagemNova {
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
  de,
  previa,
  aoAbrir,
  conversaId,
}: AvisoDeMensagemNova): void {
  tocarNotificacao({ ligado: somLigado(), conversaId });

  toast(
    () => createElement('span', null, createElement('b', null, de), ' enviou uma mensagem'),
    {
      description: previa,
      // O laranja da marca. Aviso de mensagem é o único toast do sistema com
      // fundo cheio — é o que faz ele ser visto por cima de qualquer tela.
      style: { background: '#f97316', color: '#fff', border: 'none' },
      descriptionClassName: '!text-white/90',
      ...(aoAbrir
        ? {
            action: { label: 'Abrir conversa', onClick: aoAbrir },
            actionButtonStyle: {
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
            },
          }
        : {}),
    },
  );
}
