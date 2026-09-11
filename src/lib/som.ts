/**
 * O som das notificações e do envio — o único lugar do sistema que conhece `Audio`.
 *
 * Três armadilhas moram aqui, e é por elas que isto é um módulo e não duas linhas
 * soltas na tela:
 *
 * 1. 🔴 O NAVEGADOR RECUSA TOCAR antes do primeiro gesto da pessoa na página, e a
 *    recusa vem como Promise rejeitada — não como exceção. Sem `catch`, cada
 *    notificação antes do primeiro clique vira "Unhandled promise rejection" no
 *    console e esconde erro de verdade. `destravarSom` resolve isso de uma vez.
 * 2. Uma instância de `Audio` POR SOM. Criar uma a cada mensagem deixa dezenas de
 *    objetos pendurados numa rajada de chegadas.
 * 3. Rajada não pode virar sobreposição. Vinte mensagens juntas tocam uma vez.
 *
 * A decisão de tocar (`devoTocarNotificacao`) é pura de propósito: é a parte que
 * tem regra de produto e merece teste; tocar de fato não tem o que testar.
 */

import { somDoCatalogo } from './catalogo-de-sons';

/** Dois toques de notificação nunca saem a menos disto um do outro. */
const INTERVALO_MINIMO_MS = 2_000;

export interface EstadoDoSom {
  /** A preferência da pessoa. */
  ligado: boolean;
  /** A aba do navegador está à vista? */
  abaVisivel: boolean;
  /** Conversa aberta na tela agora, se houver. */
  conversaEmFoco: string | null;
  /** Conversa que gerou a notificação — nulo quando não é de conversa. */
  conversaDaMensagem: string | null;
  /** Quando o último som de notificação saiu (ms). */
  ultimoToqueEm: number;
  /** Agora (ms). */
  agora: number;
}

/**
 * O som avisa do que a pessoa NÃO está vendo. Se ela já está com a conversa
 * aberta na frente, a mensagem chega na tela dela — tocar seria barulho.
 */
export function devoTocarNotificacao(e: EstadoDoSom): boolean {
  if (!e.ligado) return false;
  if (e.agora - e.ultimoToqueEm < INTERVALO_MINIMO_MS) return false;
  if (!e.abaVisivel) return true;
  // Aba à vista: só cala quando a notificação é exatamente da conversa aberta.
  if (e.conversaDaMensagem && e.conversaDaMensagem === e.conversaEmFoco) return false;
  return true;
}

let destravado = false;
let conversaEmFoco: string | null = null;
let ultimoToqueEm = 0;
const cache = new Map<string, HTMLAudioElement>();

function audio(arquivo: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  let a = cache.get(arquivo);
  if (!a) {
    a = new Audio(arquivo);
    a.preload = 'auto';
    cache.set(arquivo, a);
  }
  return a;
}

function tocar(arquivo: string) {
  const a = audio(arquivo);
  if (!a) return;
  try {
    a.currentTime = 0;
    // A recusa por política de reprodução automática cai aqui, em silêncio.
    void a.play()?.catch(() => {});
  } catch {
    /* navegador sem suporte — o sistema funciona sem som */
  }
}

/**
 * Registra o primeiro gesto da pessoa para liberar o áudio.
 * Chamado uma vez, no arranque do app. Remove-se sozinho.
 */
export function destravarSom(): void {
  if (destravado || typeof window === 'undefined') return;
  const liberar = () => {
    destravado = true;
    window.removeEventListener('pointerdown', liberar);
    window.removeEventListener('keydown', liberar);
  };
  window.addEventListener('pointerdown', liberar, { once: true });
  window.addEventListener('keydown', liberar, { once: true });
}

/** A tela do WhatsApp avisa qual conversa está aberta; nulo ao sair dela. */
export function definirConversaEmFoco(id: string | null): void {
  conversaEmFoco = id;
}

export interface ContextoDaNotificacao {
  ligado: boolean;
  /** Conversa que gerou a notificação, quando houver. */
  conversaId?: string | null;
  /** O som escolhido pela pessoa. Ausente ou desconhecido = padrão. */
  somId?: string | null;
}

export function tocarNotificacao(ctx: ContextoDaNotificacao): void {
  const agora = Date.now();
  const deve = devoTocarNotificacao({
    ligado: ctx.ligado,
    abaVisivel: typeof document !== 'undefined' && document.visibilityState === 'visible',
    conversaEmFoco,
    conversaDaMensagem: ctx.conversaId ?? null,
    ultimoToqueEm,
    agora,
  });
  if (!deve) return;
  ultimoToqueEm = agora;
  tocar(somDoCatalogo(ctx.somId).arquivo);
}

/**
 * O ▶ da tela de Configurações. Toca mesmo com o som desligado e ignora o intervalo
 * mínimo: é um gesto explícito da pessoa, não um aviso — e não conta como toque de
 * notificação (não mexe em `ultimoToqueEm`).
 */
export function ouvirAmostra(id: string): void {
  tocar(somDoCatalogo(id).arquivo);
}

/**
 * O som de envio é exceção deliberada: toca sempre que a pessoa manda, porque é
 * resposta ao clique dela — não um aviso sobre algo que ela não viu.
 */
export function tocarEnvio(ligado: boolean): void {
  if (!ligado) return;
  tocar('/sons/envio.mp3');
}
