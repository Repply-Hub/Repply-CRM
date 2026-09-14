import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Todo campo de telefone de CADASTRO usa o <CampoTelefones>.
 *
 * 🔴 148 cadastros têm dois números no mesmo campo (medido em 11/09/2026). Um `<Input>` de
 * telefone com máscara de um número só — o que a ficha do contato tinha, com `formatarTelefone` —
 * apaga o segundo número na primeira edição, sem aviso. Esta varredura prende os arquivos
 * LISTADOS abaixo: impede que um deles volte a usar `<Input>` ou `formatarTelefone`. Ela não
 * pega um campo de telefone de cadastro NOVO nascendo em outro arquivo — quem criar um precisa
 * entrar na tabela `CAMPOS_DE_TELEFONE`.
 *
 * Fica de fora a lista de conversas do WhatsApp: lá o número é identificador da conversa, não
 * cadastro (desenho de 11/09/2026, §5).
 */

const RAIZ = join(process.cwd(), 'src');
const ler = (relativo: string) => readFileSync(join(RAIZ, relativo), 'utf8');

/** Quantos campos de telefone de cadastro cada arquivo tem. */
const CAMPOS_DE_TELEFONE: Record<string, number> = {
  'pages/Clientes.tsx': 3,
  'pages/ClienteDetalhe.tsx': 2,
  'pages/ContatoDetalhe.tsx': 1,
  'pages/Fabricantes.tsx': 1,
  'components/fabricantes/ContatosDaFabrica.tsx': 1,
  'components/shared/EmpresaSelector.tsx': 1,
  'components/obras/SeletorContatosObra.tsx': 1,
  'components/whatsapp/CriarContatoDaConversaDialog.tsx': 1,
  'components/whatsapp/SalvarContatoRecebidoDialog.tsx': 1,
  'components/whatsapp/VincularEAtualizarContato.tsx': 1,
};

/** Um `<Input ... />` cujo `value` é um telefone — o que não pode sobrar. */
const INPUT_DE_TELEFONE = /<Input\b(?:(?!\/>)[\s\S])*?value=\{[^}]*elefone[^}]*\}/;

describe('telefone de cadastro usa o CampoTelefones', () => {
  it.each(Object.entries(CAMPOS_DE_TELEFONE))('%s', (arquivo, quantos) => {
    const codigo = ler(arquivo);
    // `\s` e não `\b`: comentário que cita "o <CampoTelefones>" não é uso.
    expect(codigo.match(/<CampoTelefones\s/g) ?? []).toHaveLength(quantos);
    expect(codigo).not.toMatch(INPUT_DE_TELEFONE);
    // 🔴 `formatarTelefone` (src/lib/telefone.ts) é a máscara de um número só que apagava o
    // segundo em campo com mais de um telefone (CLAUDE.md, ver o comentário do topo). Nenhum
    // destes arquivos pode voltar a chamá-la.
    expect(codigo).not.toMatch(/\bformatarTelefone\(/);
  });
});
