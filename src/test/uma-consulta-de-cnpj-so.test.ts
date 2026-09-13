import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Uma consulta de CNPJ só — e a regra de cada tela presa no lugar.
 *
 * 🔴 Até 11/09/2026 havia TRÊS consultas à Receita independentes (Clientes, Fabricantes e o
 * `<CampoCnpj>`), cada uma com a sua frase fixa de "não encontrado". Serviço fora do ar e empresa
 * inexistente apareciam iguais, e consertar uma não consertava as outras — o mesmo desenho do
 * conserto de datas que voltou por estar num arquivo que tela nenhuma chamava (CLAUDE.md §7.14).
 *
 * Teste de comportamento não pega isso: cada cópia passa nos próprios testes. Só a varredura do
 * código percebe a quarta nascendo, ou uma tela de fábrica perdendo a regra de bloquear.
 */

const RAIZ = join(process.cwd(), 'src');
const ler = (relativo: string) => readFileSync(join(RAIZ, relativo), 'utf8');
/**
 * Cada `<CampoCnpj ... />` do arquivo, com as propriedades. O `\s` depois do nome é de propósito:
 * comentário que cita "o <CampoCnpj>" não é uso, e com `\b` ele casaria até o próximo `/>`.
 */
const usosDoCampoCnpj = (codigo: string) => codigo.match(/<CampoCnpj\s[\s\S]*?\/>/g) ?? [];

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.(ts|tsx)$/.test(item) && !/\.test\.(ts|tsx)$/.test(item)) achados.push(caminho);
  }
  return achados;
}
// `sep`, e não uma barra escrita à mão: no Windows o caminho vem com contrabarra.
const relativo = (caminho: string) => relative(RAIZ, caminho).split(sep).join('/');

describe('uma consulta de CNPJ só', () => {
  it('🔴 as duas portas de criar fábrica bloqueiam CNPJ que a Receita diz não existir', () => {
    for (const arquivo of ['pages/Fabricantes.tsx', 'components/pedidos/FabricanteSelector.tsx']) {
      const codigo = ler(arquivo);
      const usos = usosDoCampoCnpj(codigo);
      expect(usos, arquivo).toHaveLength(1);
      expect(usos[0], arquivo).toContain('seNaoExistir="bloquear"');
      // Sem a ref, o Salvar não espera a consulta: quem digita e clica direto escapa da regra.
      expect(usos[0], arquivo).toMatch(/\bref=\{/);
      expect(codigo, arquivo).toContain('.conferir()');
      expect(codigo, arquivo).not.toMatch(/fetchCnpjData\s*\(/);
    }
  });

  it('as três portas de cadastrar cliente aceitam CPF e nunca bloqueiam pela Receita', () => {
    for (const arquivo of ['pages/Clientes.tsx', 'pages/ClienteDetalhe.tsx', 'components/shared/EmpresaSelector.tsx']) {
      const codigo = ler(arquivo);
      // `ClienteDetalhe` tem um segundo <CampoCnpj>, o da SPE da obra nova — esse é só CNPJ.
      const usosComCpf = usosDoCampoCnpj(codigo).filter((u) => /\baceitaCpf\b/.test(u));
      expect(usosComCpf, arquivo).toHaveLength(1);
      expect(usosComCpf[0], arquivo).not.toContain('bloquear');
      expect(codigo, arquivo).not.toMatch(/fetchCnpjData\s*\(/);
    }
  });

  // 60 s: a primeira varredura do arquivo lê o projeto inteiro do disco e levou 23,7 s com
  // a suíte disputando a máquina, estourando os 20 s de antes. Uma trava por lentidão vira
  // falso alarme do qual a equipe aprende a ignorá-la — é assim que o teste dura 60 s.
  it('🔴 só src/lib/cnpj.ts fala com o BrasilAPI de CNPJ', { timeout: 60_000 }, () => {
    const infratores = arquivosDeCodigo(RAIZ)
      .filter((c) => /brasilapi\.com\.br\/api\/cnpj/.test(readFileSync(c, 'utf8')))
      .map(relativo)
      .filter((r) => r !== 'lib/cnpj.ts');
    expect(infratores).toEqual([]);
  });

  it('🔴 só o <CampoCnpj> chama consultarCnpj — tela nenhuma monta a sua consulta', { timeout: 60_000 }, () => {
    const podem = new Set(['lib/cnpj.ts', 'components/shared/CampoCnpj.tsx']);
    const infratores = arquivosDeCodigo(RAIZ)
      .filter((c) => /\bconsultarCnpj\s*\(/.test(readFileSync(c, 'utf8')))
      .map(relativo)
      .filter((r) => !podem.has(r));
    expect(infratores).toEqual([]);
  });

  it('a porta antiga, fetchCnpjData, não existe mais', async () => {
    const modulo = await import('@/lib/cnpj');
    expect('fetchCnpjData' in modulo).toBe(false);
  });
});
