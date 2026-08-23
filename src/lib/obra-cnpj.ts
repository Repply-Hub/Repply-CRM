import { isValidCnpj } from '@/utils/cnpj';

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
 * @param valor       o que está no campo, COM máscara (é assim que a tela guarda)
 * @param obrigatorio se a empresa marcou o campo como obrigatório em Configurações → Campos
 * @returns a mensagem de erro, ou `null` quando está tudo certo
 */
export function validarCnpjDaObra(valor: string, obrigatorio: boolean): string | null {
  const preenchido = valor.trim();

  // Campo opcional e vazio: nada a validar. É o caso normal — a obra pode não ser uma SPE.
  if (!preenchido) {
    return obrigatorio ? 'CNPJ obrigatório' : null;
  }

  // 18 é o tamanho COM máscara: 00.000.000/0000-00. Quem carrega o valor cru do banco
  // (14 dígitos) precisa passar por `formatCnpj` ANTES de chegar aqui.
  if (preenchido.length < 18) {
    return 'CNPJ incompleto';
  }

  return isValidCnpj(preenchido) ? null : 'CNPJ inválido';
}
