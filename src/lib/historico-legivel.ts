/**
 * Traduz uma linha do histórico de alterações para português.
 *
 * 🔴 POR QUE ISTO É PRÉ-REQUISITO DO MULTI-RESPONSÁVEL, e não enfeite.
 *
 * A decisão 4 do dono do produto (23/08/2026) libera qualquer pessoa com permissão de editar
 * a reatribuir um negócio — inclusive para si mesma. A garantia que compra essa liberdade é o
 * histórico: "se alguém puxar um negócio para si, fica registrado".
 *
 * Registrado está. Legível não: o gatilho grava a linha inteira em JSON, e a tela mostrava
 *
 *     Campos alterados: usuario_id
 *
 * com dois blocos de JSON cru e dois UUIDs. Quem fosse conferir precisaria traduzir
 * identificador para nome de pessoa na mão. Um registro que ninguém consegue ler não é
 * auditoria; é arquivo morto — e soltar a reatribuição antes de arrumar isso seria ficar sem
 * trava E sem auditoria.
 *
 * Medido em 31/08/2026: 22.536 edições de negócio, e o responsável mudou em ZERO delas. O
 * mecanismo existe e nunca rodou de verdade.
 */

/** Campos cujo valor é o identificador de uma PESSOA, e por isso vira nome na tela. */
const CAMPOS_DE_PESSOA = new Set([
  'usuario_id',
  'vendedor_id',
  'responsavel',
  'responsavel_id',
  'created_by',
  'updated_by',
  'bloqueada_por',
  'excluida_por',
]);

/** Ruído de gravação: muda em toda edição e não diz nada a quem lê. */
const CAMPOS_IGNORADOS = new Set(['updated_at', 'created_at', 'id']);

/**
 * O nome em português de cada campo. O que não estiver aqui aparece como está — melhor um
 * nome técnico do que esconder que algo mudou.
 */
export const ROTULO_DE_CAMPO: Record<string, string> = {
  usuario_id: 'Responsável',
  vendedor_id: 'Responsável',
  principal: 'Responsável principal',
  cliente_id: 'Cliente',
  obra_id: 'Obra',
  fabricante_id: 'Fabricante',
  funil_id: 'Funil',
  marcador_id: 'Marcador',
  status: 'Etapa',
  valor_total: 'Valor',
  data_pedido: 'Data de criação',
  prazo_resposta: 'Data de fechamento',
  fechado_em: 'Fechado em',
  observacoes: 'Observações',
  origem_lead: 'Origem',
  endereco_entrega: 'Endereço de entrega',
  nome: 'Nome',
  nome_fantasia: 'Nome fantasia',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  role: 'Perfil',
  deleted_at: 'Excluído em',
  logo_url: 'Logo',
};

/** Acima disto o valor não cabe numa linha de resumo, e só o nome do campo é mostrado. */
const MAXIMO_DE_TEXTO = 40;

function ehVazio(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Como um valor aparece na frase.
 *
 * `nomeDe` traduz identificador de pessoa em nome. Quando não encontra — pessoa excluída,
 * lista ainda carregando — devolve `null`, e aqui vira um trecho do identificador em vez do
 * UUID inteiro: dá para reconhecer sem ocupar a linha toda.
 */
function valorLegivel(campo: string, valor: unknown, nomeDe: (id: string) => string | null): string {
  if (ehVazio(valor)) return '(vazio)';

  if (CAMPOS_DE_PESSOA.has(campo) && typeof valor === 'string') {
    return nomeDe(valor) ?? `${valor.slice(0, 8)}…`;
  }

  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';

  if (typeof valor === 'number') return valor.toLocaleString('pt-BR');

  if (typeof valor === 'string') {
    // Data em ISO vira data brasileira. Só a parte do dia: hora em resumo é ruído.
    const data = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (data) return `${data[3]}/${data[2]}/${data[1]}`;
    return valor.length > MAXIMO_DE_TEXTO ? `${valor.slice(0, MAXIMO_DE_TEXTO)}…` : valor;
  }

  return '(alterado)';
}

export interface AlteracaoLegivel {
  campo: string;
  rotulo: string;
  de: string;
  para: string;
}

/**
 * O que mudou entre dois retratos da linha, em português.
 *
 * Devolve lista vazia quando nada de interessante mudou — o chamador decide o que dizer
 * nesse caso.
 */
export function descreverAlteracao(
  antes: Record<string, unknown> | null | undefined,
  depois: Record<string, unknown> | null | undefined,
  nomeDe: (id: string) => string | null = () => null,
): AlteracaoLegivel[] {
  if (!antes || !depois) return [];

  // As chaves dos DOIS lados: um campo que sumiu do retrato novo também é alteração.
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);

  return [...chaves]
    .filter((c) => !CAMPOS_IGNORADOS.has(c))
    .filter((c) => JSON.stringify(antes[c] ?? null) !== JSON.stringify(depois[c] ?? null))
    .map((campo) => ({
      campo,
      rotulo: ROTULO_DE_CAMPO[campo] ?? campo,
      de: valorLegivel(campo, antes[campo], nomeDe),
      para: valorLegivel(campo, depois[campo], nomeDe),
    }))
    // 🔴 O RESPONSÁVEL PRIMEIRO. É a alteração que a decisão 4 existe para vigiar; enterrada
    // no meio de dez campos, ninguém a vê.
    .sort((a, b) => Number(CAMPOS_DE_PESSOA.has(b.campo)) - Number(CAMPOS_DE_PESSOA.has(a.campo)));
}

/** A frase de uma linha do histórico. `null` quando não há o que dizer. */
export function resumirAlteracao(
  antes: Record<string, unknown> | null | undefined,
  depois: Record<string, unknown> | null | undefined,
  nomeDe: (id: string) => string | null = () => null,
  maximoDeCampos = 3,
): string | null {
  const mudancas = descreverAlteracao(antes, depois, nomeDe);
  if (mudancas.length === 0) return null;

  const mostradas = mudancas
    .slice(0, maximoDeCampos)
    .map((m) => `${m.rotulo}: ${m.de} → ${m.para}`);

  const sobraram = mudancas.length - mostradas.length;
  return sobraram > 0
    ? `${mostradas.join(' · ')} · e mais ${sobraram}`
    : mostradas.join(' · ');
}
