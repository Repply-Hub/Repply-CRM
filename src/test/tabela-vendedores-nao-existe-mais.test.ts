import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guarda contra consultar a tabela `vendedores`, que NÃO EXISTE MAIS.
 *
 * 🔴 O QUE ISTO IMPEDE DE VOLTAR. `vendedores` virou `usuarios` em abril/2026. Uma consulta
 * ficou para trás pedindo `vendedor:vendedores(nome)` em `historico_contatos`, e o PostgREST
 * recusa a consulta INTEIRA quando o vínculo não existe (`PGRST200`) — não é um campo que vem
 * vazio, é a resposta toda que não vem.
 *
 * Passou meses sem ninguém notar porque o único lugar que a usava estava, ele próprio, morto:
 * dependia de um `selectedOrder` que nunca era preenchido. Dois defeitos escondidos um atrás do
 * outro, e o de fora impedia o de dentro de dar sintoma. Só apareceu quando fomos ligar a tela.
 *
 * ⚠️ A COLUNA `historico_contatos.usuario_id` continua com a chave estrangeira chamada
 * `historico_contatos_vendedor_id_fkey` — o nome da chave é resto da renomeação e NÃO é problema.
 * Este teste olha o nome da TABELA na consulta, não o da chave.
 *
 * Funções antigas do banco (`get_my_vendedor_id`, `is_gestor`, `vendedor_in_my_empresa`) também
 * continuam válidas e não são alcançadas por este teste — CLAUDE.md §4.2 pede para não removê-las.
 */

const RAIZ = join(process.cwd(), 'src');

function arquivosDeCodigo(dir: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      achados.push(...arquivosDeCodigo(caminho));
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** Linhas de comentário não são consulta — e este arquivo e os vizinhos explicam o defeito. */
function ehComentario(linha: string): boolean {
  const limpa = linha.trim();
  return limpa.startsWith('//') || limpa.startsWith('*') || limpa.startsWith('/*');
}

describe('a tabela `vendedores` não existe mais', () => {
  it('🔴 nenhuma consulta do app pede `vendedores` — o PostgREST recusaria a consulta inteira', () => {
    const ofensores: string[] = [];

    for (const arquivo of arquivosDeCodigo(RAIZ)) {
      const linhas = readFileSync(arquivo, 'utf-8').split('\n');
      linhas.forEach((linha, i) => {
        if (ehComentario(linha)) return;
        // As duas formas que aparecem numa consulta do Supabase: o embed (`x:vendedores(...)`)
        // e a tabela de origem (`.from('vendedores')`).
        const temEmbed = /:\s*vendedores\s*\(/.test(linha);
        const temFrom = /from\(\s*['"`]vendedores['"`]\s*\)/.test(linha);
        if (temEmbed || temFrom) {
          ofensores.push(`${arquivo.replace(RAIZ, 'src')}:${i + 1} → ${linha.trim()}`);
        }
      });
    }

    expect(
      ofensores,
      'Use `usuarios`. A tabela `vendedores` foi renomeada em abril/2026 e o PostgREST recusa a ' +
        'consulta inteira (PGRST200) quando o vínculo não existe:\n' +
        ofensores.join('\n'),
    ).toEqual([]);
  });
});
