/**
 * Quem pode VINCULAR alguém a um número de WhatsApp da empresa.
 *
 * ---------------------------------------------------------------------------------
 * 🔴 POR QUE ISTO EXISTE (item 74 da dívida técnica, passo 3)
 * ---------------------------------------------------------------------------------
 * Até 23/09/2026, qualquer pessoa logada apertava "Ativar WhatsApp" e a função
 * `whatsapp-provision` a vinculava ao número que a empresa já tinha — sem conferir cargo nenhum
 * no caminho sem `target_usuario_id` (linhas 113-170 de lá).
 *
 * Entrar no número não é detalhe de configuração: quem entra passa a ver as conversas dele. Só
 * na MD são 772 conversas sem responsável. E, enquanto a chave da operadora chegava ao
 * navegador, entrar também dava a credencial — que vale FORA do produto.
 *
 * Medido em 23/09/2026: a MD tem 2 números e **13 pessoas vinculadas em cada um**. O modelo real
 * é número COMPARTILHADO pelo time, não um número por pessoa como o nome da instância sugere.
 * Por isso o vínculo é a porta de entrada do WhatsApp da empresa — e a decisão do dono do
 * produto, no mesmo dia, foi: **só o gestor vincula.**
 *
 * ---------------------------------------------------------------------------------
 * 🔴 ESTA LISTA VIVE DUPLICADA, E TEM DE CONTINUAR IGUAL
 * ---------------------------------------------------------------------------------
 * A cópia de verdade — a que protege — está em `supabase/functions/whatsapp-provision/index.ts`,
 * porque autorização no navegador não protege nada (CLAUDE.md §6.1). Esta cópia serve só para a
 * tela não oferecer um botão que o servidor vai recusar.
 *
 * Se divergirem: a tela liberando quem o servidor recusa dá erro seco na cara da pessoa; o
 * servidor liberando quem a tela esconde deixa a trava sem valor. É a mesma convivência do
 * `normalizeWhatsappPhone` (CLAUDE.md §7.1), e o mesmo raciocínio de `podeGerenciarFigurinhas`.
 */

/** Os mesmos três papéis que `whatsapp-provision` aceita. Exportado para o teste comparar. */
export const PAPEIS_QUE_VINCULAM_WHATSAPP = ['admin', 'empresa', 'gestor'] as const;

/**
 * Enquanto o papel não se sabe (perfil carregando, ou pessoa sem linha), a resposta é NÃO —
 * o padrão do projeto para permissão, e o lado seguro aqui.
 */
export function podeVincularWhatsapp(papel: string | null | undefined): boolean {
  return (PAPEIS_QUE_VINCULAM_WHATSAPP as readonly string[]).includes(papel ?? '');
}
