import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contatoApareceNoCalendario } from '@/lib/contato-no-calendario';

/**
 * O "Retomar depois" da tela Hoje gravava um `historico_contatos` com `proximo_contato_em`, e o
 * calendário desenhava isso como um "Contato" na agenda da pessoa. Decisão do dono do produto
 * (16/09/2026): esse marcador no calendário não ajudava — a sincronização com Tarefas (que o
 * mesmo gesto já faz) basta. Então o calendário deixa de mostrar o "Retomar depois".
 *
 * 🔴 O QUE **NÃO** MUDA: a coluna `proximo_contato_em` continua gravada. É ela que faz o negócio
 * SUMIR da pauta do dia até a data e VOLTAR nela (CTE `retorno_marcado` de `pauta_do_dia_de`),
 * e é isso que "Retomar depois" promete. Mexer no banco quebraria esse retorno; por isso o
 * conserto é só no que o CALENDÁRIO decide desenhar. Medido na MD em 16/09/2026: dos contatos
 * com data, os 8 são `tipo='retorno'` — nenhum de outro tipo.
 *
 * Os outros tipos de próximo contato (ex.: `automatico`, do campo que já saiu do cadastro de
 * negócio) seguem aparecendo — o filtro é só para o `retorno`.
 */
describe('o calendário não mostra o "Retomar depois"', () => {
  it('🔴 esconde o contato de retorno (o "Retomar depois")', () => {
    expect(contatoApareceNoCalendario('retorno')).toBe(false);
  });

  it('mantém os outros tipos de próximo contato', () => {
    expect(contatoApareceNoCalendario('automatico')).toBe(true);
    expect(contatoApareceNoCalendario('manual')).toBe(true);
    expect(contatoApareceNoCalendario(null)).toBe(true);
    expect(contatoApareceNoCalendario(undefined)).toBe(true);
  });
});

/**
 * A fiação no hook do calendário, que o jsdom não alcança (a página dispara sessão e consultas).
 * Lê o arquivo sem comentários e confere que a lista de próximos contatos passa pelo filtro.
 */
const USE_EVENTOS = readFileSync(join(process.cwd(), 'src', 'hooks', 'use-eventos.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

describe('o hook do calendário aplica o filtro do "Retomar depois"', () => {
  it('🔴 use-eventos usa contatoApareceNoCalendario nos próximos contatos', () => {
    expect(USE_EVENTOS).toContain('contatoApareceNoCalendario');
  });
});
