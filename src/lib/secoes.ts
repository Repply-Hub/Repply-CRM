/**
 * A lista única de seções do sistema.
 *
 * POR QUE ISTO EXISTE: até 21/08/2026 havia DUAS listas canônicas de módulos que não
 * batiam entre si — `DEFAULT_SIDEBAR_ITEMS` (src/hooks/use-sidebar-preferences.ts, 15 ids,
 * incluindo os 3 de admin) e `MODULOS` (src/hooks/use-permissoes.ts, 14 chaves, com
 * `contatos` e `pedidos` que o menu não tem). O controle de acesso por empresa precisava
 * de uma lista; criar a terceira criaria a terceira verdade.
 *
 * Esta passa a ser a verdade. As outras duas continuam existindo por ora, mas cada seção
 * declara aqui a que chaves delas corresponde.
 *
 * NÃO confundir com o eixo de permissão POR USUÁRIO (`permissoes_usuario`,
 * `permissao_presets`, `has_funcionalidade`). Aqui é POR EMPRESA: o que EXISTE para aquele
 * assinante. Lá é quem VÊ, dentro do que existe.
 */

export type SecaoId =
  | 'hoje'
  | 'dashboard'
  | 'pipeline'
  | 'clientes'
  | 'obras'
  | 'fabricantes'
  | 'portal'
  | 'calendario'
  | 'tarefas'
  | 'chat'
  | 'whatsapp'
  | 'emails'
  | 'configuracoes';

export interface Secao {
  id: SecaoId;
  /** Rótulo na tela de admin. O menu tem o próprio rótulo, editável pelo usuário. */
  label: string;
  /** Rota raiz. Rotas filhas (`/clientes/:slug`) pertencem à mesma seção. */
  rota: string;
  /** Rotas adicionais desta seção que não descendem de `rota`. */
  rotasExtras?: string[];
  /**
   * false = o produto quebra sem ela. Não é escolha de projeto: `pedidos.cliente_id` e
   * `pedidos.fabricante_id` são NOT NULL, e `/app` é a home autenticada.
   */
  desligavel: boolean;
  /** Chaves equivalentes em MODULOS (src/hooks/use-permissoes.ts). */
  modulosPermissao: string[];
}

export const SECOES: Secao[] = [
  // A pauta do dia. Nasce DESLIGADA no preset padrão e ligada só no da MD Representações
  // (decisão do dono do produto em 24/08/2026: validar na MD antes de abrir para o resto).
  // Mesmo caminho que o Portal já seguia. Usa a permissão de Negócios porque é a lista de
  // negócios da pessoa, recortada — quem não pode ver negócio não pode ver a pauta deles.
  { id: 'hoje',          label: 'Hoje',          rota: '/hoje',          desligavel: true,  modulosPermissao: ['pipeline', 'pedidos'] },
  { id: 'dashboard',     label: 'Dashboard',     rota: '/dashboard',     desligavel: true,  modulosPermissao: ['dashboard'] },
  { id: 'pipeline',      label: 'Negócios',      rota: '/app',           rotasExtras: ['/pedidos'], desligavel: false, modulosPermissao: ['pipeline', 'pedidos'] },
  { id: 'clientes',      label: 'Clientes',      rota: '/clientes',      rotasExtras: ['/contatos'], desligavel: false, modulosPermissao: ['clientes', 'contatos'] },
  { id: 'obras',         label: 'Obras',         rota: '/obras',         desligavel: true,  modulosPermissao: ['obras'] },
  { id: 'fabricantes',   label: 'Fabricantes',   rota: '/fabricantes',   desligavel: false, modulosPermissao: ['fabricantes'] },
  { id: 'portal',        label: 'Portal',        rota: '/portal',        desligavel: true,  modulosPermissao: ['portal'] },
  { id: 'calendario',    label: 'Calendário',    rota: '/calendario',    desligavel: true,  modulosPermissao: ['calendario'] },
  { id: 'tarefas',       label: 'Tarefas',       rota: '/tarefas',       desligavel: true,  modulosPermissao: ['tarefas'] },
  { id: 'chat',          label: 'Chat interno',  rota: '/chat',          desligavel: true,  modulosPermissao: ['chat'] },
  { id: 'whatsapp',      label: 'WhatsApp',      rota: '/whatsapp',      desligavel: true,  modulosPermissao: ['whatsapp'] },
  { id: 'emails',        label: 'E-mail',        rota: '/emails',        desligavel: true,  modulosPermissao: ['emails'] },
  { id: 'configuracoes', label: 'Configurações', rota: '/configuracoes', desligavel: false, modulosPermissao: ['configuracoes'] },
];

export const SECOES_DESLIGAVEIS = SECOES.filter((s) => s.desligavel);

const POR_ID = new Map<SecaoId, Secao>(SECOES.map((s) => [s.id, s]));

export const secaoPorId = (id: SecaoId): Secao | undefined => POR_ID.get(id);

/**
 * A que seção pertence uma rota.
 *
 * Casa a rota exata OU rota filha (`/clientes/acme-1` → clientes). A barra ao comparar o
 * prefixo não é detalhe: sem ela, `/portalzinho` casaria com `/portal` e herdaria a trava
 * da seção errada.
 *
 * Devolve null para rota que não pertence a seção nenhuma (`/login`, `/assinar`,
 * `/admin/...`) — quem chama trata null como "não há seção a checar". É isso que impede a
 * própria tela de admin de seções de se auto-bloquear.
 */
export function secaoDaRota(pathname: string): Secao | null {
  for (const s of SECOES) {
    for (const base of [s.rota, ...(s.rotasExtras ?? [])]) {
      if (pathname === base || pathname.startsWith(base + '/')) return s;
    }
  }
  return null;
}
