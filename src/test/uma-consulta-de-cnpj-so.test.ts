import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
});
