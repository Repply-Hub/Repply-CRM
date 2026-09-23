import { describe, it, expect } from 'vitest';
import { podeVincularWhatsapp, PAPEIS_QUE_VINCULAM_WHATSAPP } from './vinculo-de-whatsapp';

/**
 * O QUE ESTE ARQUIVO PRENDE: que entrar num número de WhatsApp da empresa seja ato de gestor
 * (item 74 da dívida técnica, passo 3).
 *
 * 🔴 POR QUE. Até 23/09/2026 qualquer pessoa logada apertava "Ativar WhatsApp" e a função
 * `whatsapp-provision` a vinculava ao número que a empresa já tinha — sem conferir cargo nenhum
 * no caminho sem `target_usuario_id`. Entrar no número não é detalhe: quem entra passa a ver as
 * conversas dele (772 sem responsável só na MD) e, enquanto a chave da operadora chegava ao
 * navegador, também a credencial.
 *
 * Medido em 23/09: a MD tem 2 números e **13 pessoas vinculadas em cada um** — o modelo real é
 * número compartilhado pelo time, não um número por pessoa. Por isso o vínculo é a porta de
 * entrada, e a decisão do dono do produto foi: **só o gestor vincula.**
 *
 * 🔴 ESTA LISTA EXISTE DUPLICADA em `supabase/functions/whatsapp-provision/index.ts`. Tem de
 * ser igual: se a tela liberar quem a função recusa, a pessoa leva um erro seco; se a função
 * liberar quem a tela esconde, a trava não vale nada. É a mesma convivência do
 * `normalizeWhatsappPhone` (CLAUDE.md §7.1).
 */

describe('podeVincularWhatsapp', () => {
  it('gestor, dono da conta e admin vinculam', () => {
    expect(podeVincularWhatsapp('gestor')).toBe(true);
    expect(podeVincularWhatsapp('empresa')).toBe(true);
    expect(podeVincularWhatsapp('admin')).toBe(true);
  });

  it('🔴 vendedor NÃO vincula — é ele que entrava sozinho no número da empresa', () => {
    expect(podeVincularWhatsapp('vendedor')).toBe(false);
  });

  it('papel desconhecido não vincula', () => {
    expect(podeVincularWhatsapp('estagiario')).toBe(false);
    expect(podeVincularWhatsapp('')).toBe(false);
  });

  it('🔴 sem papel (perfil ainda carregando ou ausente) NÃO vincula', () => {
    // O padrão do projeto: enquanto não se sabe, a resposta é "não pode".
    expect(podeVincularWhatsapp(null)).toBe(false);
    expect(podeVincularWhatsapp(undefined)).toBe(false);
  });

  it('a lista é a mesma que a função de servidor usa, e está exportada para não divergir', () => {
    expect([...PAPEIS_QUE_VINCULAM_WHATSAPP].sort()).toEqual(['admin', 'empresa', 'gestor']);
  });
});
