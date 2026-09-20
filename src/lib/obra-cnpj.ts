import { classificarDocumento, mensagemDoDocumento } from '@/lib/cnpj';

/**
 * A regra do campo SPE/CNPJ da obra, num lugar só.
 *
 * Existia escrita duas vezes, dentro do `onSubmit` de cada formulário da tela de Obras — e as
 * duas cópias eram DIFERENTES. A de criar checava antes se o campo estava preenchido; a de
 * editar validava sempre. Como a validação exige o CNPJ no formato COM máscara, validar
 * sempre significava reprovar campo vazio com "CNPJ obrigatório", e o formulário de editar
 * obra não salvava nunca — nem obra sem CNPJ, nem obra com CNPJ.
 *
 * Uma função só, chamada pelos dois, é o que impede as cópias de divergirem de novo.
 *
 * 🔴 Decisão do dono do produto, 12/09/2026: a FRASE de cada caso também passa a vir de um
 * lugar só — `classificarDocumento` + `mensagemDoDocumento`, de `@/lib/cnpj`. Esta função tinha
 * frase própria ("CNPJ incompleto", "CNPJ inválido"), diferente da que `CampoCnpj` já mostra
 * embaixo do campo enquanto a pessoa digita — a mesma pessoa via um texto ao digitar e outro ao
 * salvar, para o mesmo erro. Agora é uma frase só, em todo o sistema; mudar o texto muda nos
 * dois lugares de uma vez.
 *
 * Efeito colateral bom: a validação antiga (acima) cobrava o valor COM máscara, 18 caracteres —
 * era exatamente essa exigência que quebrava o formulário de editar. `classificarDocumento`
 * conta DÍGITOS, não caracteres, então também aceita o valor CRU do banco (14 dígitos, sem
 * máscara) sem precisar passar por `formatCnpj` antes de chegar aqui.
 *
 * @param valor       o que está no campo — com ou sem máscara, tanto faz
 * @param obrigatorio se a empresa marcou o campo como obrigatório em Configurações → Campos
 * @returns a mensagem de erro, ou `null` quando está tudo certo
 */
export function validarCnpjDaObra(valor: string, obrigatorio: boolean): string | null {
  const preenchido = valor.trim();

  // Campo opcional e vazio: nada a validar. É o caso normal — a obra pode não ser uma SPE.
  if (!preenchido) {
    return obrigatorio ? 'CNPJ obrigatório' : null;
  }

  const classe = classificarDocumento(preenchido);
  if (classe === 'cnpj') return null;

  // `seNaoExistir` não importa aqui: sem consulta à Receita, o resultado nunca é 'nao_existe'.
  return mensagemDoDocumento(classe, { seNaoExistir: 'avisar' })?.texto ?? null;
}
