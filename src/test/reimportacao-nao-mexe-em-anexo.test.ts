import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴 A PIOR FALHA POSSÍVEL DESTE PACOTE seria esta: alguém reimporta uma planilha antiga e os
 * anexos que a equipe acrescentou pela tela somem — sem erro, sem aviso, e sem ninguém perceber
 * até precisar do orçamento.
 *
 * A decisão do dono do produto (12/09/2026) é clara: a coluna Anexo vale só para negócio NOVO.
 * Para negócio que já existe (reencontrado pelo Código/ID), a coluna é ignorada. Hoje isso é
 * verdade porque `calcularAlteracoes` (alteracoes-por-codigo.ts) só monta `nome`, `observacoes` e
 * `marcador_id`, e `atualizarNegociosPorCodigo` (use-bulk-import.ts) grava só esse patch — nunca
 * toca `pedido_anexos`. Este teste existe para continuar verdade.
 */
const RAIZ = join(process.cwd(), 'src');
const ler = (relativo: string) => readFileSync(join(RAIZ, relativo), 'utf8');

describe('reimportação não mexe em anexo', () => {
  it('🔴 o cálculo de alterações por código não carrega anexo nenhum', () => {
    const codigo = ler('lib/import/alteracoes-por-codigo.ts');
    expect(codigo).not.toMatch(/patch\.(pdf_url|anexos?)\b/);
    expect(codigo).not.toMatch(/pedido_anexos/);
  });

  it('🔴 a gravação das alterações por código não cria nem apaga anexo', () => {
    const codigo = ler('hooks/use-bulk-import.ts');
    const inicio = codigo.indexOf('async function atualizarNegociosPorCodigo');
    expect(inicio, 'não achei atualizarNegociosPorCodigo').toBeGreaterThan(-1);
    const trecho = codigo.slice(inicio);
    expect(trecho).not.toMatch(/pedido_anexos/);
  });
});
