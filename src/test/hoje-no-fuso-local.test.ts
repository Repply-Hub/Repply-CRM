import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * "Hoje" se escreve no fuso de quem usa, não em UTC.
 *
 * 🔴 O DEFEITO QUE ISTO IMPEDE. `new Date().toISOString().slice(0, 10)` parece "a data de hoje",
 * mas é a data em UTC: das 21h à meia-noite, no horário de Brasília, já é amanhã. Medido em
 * 11/09/2026, espalhado por dez arquivos:
 *
 *   · o cadastro de cliente e de contato gravava a "Data de criação" de amanhã, para sempre;
 *   · dez exportações (PDF, Dashboard, conversas, Clientes, Portal) saíam com a data de amanhã
 *     no nome do arquivo.
 *
 * E o contato criado a partir de uma conversa gravava o carimbo UTC inteiro na mesma coluna, que a
 * lista de Clientes recorta — o mesmo dia de amanhã, por outro caminho.
 *
 * SE ESTE TESTE FALHOU: use `hojeLocal()` de `src/lib/data-local.ts`. `toISOString()` continua
 * certo para CARIMBO (um instante, que o banco guarda com fuso) — o erro é recortar dele a data.
 */

const RAIZ = join(process.cwd(), 'src');

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) {
      arquivosDeCodigo(caminho, achados);
    } else if (/\.(ts|tsx)$/.test(item) && !/\.test\.(ts|tsx)$/.test(item)) {
      achados.push(caminho);
    }
  }
  return achados;
}

function infratores(padrao: RegExp): string[] {
  return arquivosDeCodigo(RAIZ)
    .filter((caminho) => padrao.test(readFileSync(caminho, 'utf8')))
    .map((caminho) => relative(RAIZ, caminho).split('\\').join('/'))
    .sort();
}

describe('hoje no fuso de quem usa', () => {
  // 20s, e não os 5s padrão: cada caso LÊ O PROJETO INTEIRO do disco, como em
  // `uma-leitura-de-planilha-so.test.ts`, e com outra sessão disputando a máquina estourava.
  it('🔴 ninguém recorta a data de hoje de um carimbo UTC', { timeout: 20_000 }, () => {
    const hojeEmUtc = /new Date\(\)\.toISOString\(\)\.(slice\(0,\s*10\)|substring\(0,\s*10\)|split\(['"]T['"]\)\[0\])/;
    expect(infratores(hojeEmUtc)).toEqual([]);
  });

  it('🔴 a data de criação não é gravada a partir de um carimbo UTC', { timeout: 20_000 }, () => {
    expect(infratores(/data_criacao:\s*new Date\(\)\.toISOString\(\)/)).toEqual([]);
  });
});
