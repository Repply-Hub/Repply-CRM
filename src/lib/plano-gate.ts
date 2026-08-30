/**
 * Regras do gate de plano — funções puras sobre o `profile` do AuthContext
 * (linha de `usuarios` com `empresas(*)` aninhado). Sem React e sem I/O, para
 * poder ser testado sem mock nenhum.
 *
 * O nome é `plano-gate` e não `plano` porque já existe `src/lib/planos.ts`
 * (catálogo de preços da landing) no mesmo diretório — dois arquivos separados
 * por uma letra seriam um convite ao auto-import errado.
 */

import { situacaoDaEmpresa, type SituacaoCS } from './situacao-empresa';

export type StatusPlano = 'liberado' | 'bloqueado' | 'desconhecido';

/**
 * Formatos mínimos com que estas funções trabalham. O `profile` do AuthContext é
 * `any`, então qualquer objeto entra sem atrito — mas tipar aqui deixa claro
 * quais campos realmente importam e evita `any` espalhado num módulo que decide
 * acesso.
 */
interface AssinaturaDaEmpresa {
  plan_status?: unknown;
  [campo: string]: unknown;
}

interface EmpresaComPlano {
  owner_id?: unknown;
  /** O estado da assinatura mora em tabela própria, embutida no perfil. */
  empresa_assinaturas?: AssinaturaDaEmpresa | AssinaturaDaEmpresa[] | null;
  /** Tolerado por compatibilidade — ver planStatusBruto. */
  plan_status?: unknown;
  [campo: string]: unknown;
}

interface ProfileComPlano {
  role?: unknown;
  deleted_at?: unknown;
  empresas?: EmpresaComPlano | EmpresaComPlano[] | null;
  [campo: string]: unknown;
}

interface SessaoComUsuario {
  user?: { id?: unknown } | null;
}

/**
 * Lista FECHADA de valores de `plan_status` que bloqueiam o app. Qualquer outro
 * valor libera: `undefined`, `null`, string vazia, `empresas` ausente e até
 * status que ainda não existem.
 *
 * Por que denylist e não allowlist (`=== 'active'`): o deploy do front (Vercel)
 * é independente do `supabase db push`, e hoje a coluna `plan_status` nem
 * existe. Com allowlist, o front subindo antes da migration trancaria 100% da
 * base pagante no paywall, sem rollback rápido — o bundle já está no CDN. Com
 * denylist, o pior caso é o paywall ficar inerte até a migration subir.
 *
 * Ausentes de propósito:
 * - `past_due`: o cartão falhou mas o Stripe ainda está fazendo retry. Cortar o
 *   acesso na primeira falha de cobrança gera churn; o certo é um aviso na UI.
 * - `trialing` e `incomplete`: fluxo em andamento.
 * Se o produto quiser cortar nesses casos, basta acrescentar aqui — é para isso
 * que a política está num lugar só.
 */
export const STATUS_BLOQUEADOS: readonly string[] = [
  'inactive',
  'canceled',
  'cancelled', // o Stripe emite 'canceled'; aceitamos as duas grafias
  'unpaid',
  'incomplete_expired',
  'suspended',
];

function normalizar(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const s = valor.trim().toLowerCase();
  return s === '' ? null : s;
}

function mesmoId(a: unknown, b: unknown): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  return x !== null && x === y;
}

/**
 * O embed `empresas(*)` vem como objeto (FK many-to-one). O ramo de array é
 * defensivo: se um dia existir uma segunda FK de `usuarios` para `empresas`, o
 * PostgREST passa a devolver array e todo `?.plan_status` viraria `undefined`
 * silenciosamente — ou seja, o gate destrancaria sem ninguém perceber.
 */
export function extrairEmpresa(profile: ProfileComPlano | null | undefined): EmpresaComPlano | null {
  const empresa = profile?.empresas;
  if (!empresa) return null;
  if (Array.isArray(empresa)) return empresa[0] ?? null;
  if (typeof empresa !== 'object') return null;
  return empresa;
}

/**
 * A assinatura da empresa, quando o perfil trouxe o embed. Mesmo tratamento de
 * array do `extrairEmpresa`, pelo mesmo motivo.
 */
export function extrairAssinatura(
  profile: ProfileComPlano | null | undefined,
): AssinaturaDaEmpresa | null {
  const assinatura = extrairEmpresa(profile)?.empresa_assinaturas;
  if (!assinatura) return null;
  if (Array.isArray(assinatura)) return assinatura[0] ?? null;
  if (typeof assinatura !== 'object') return null;
  return assinatura;
}

/**
 * Status cru já normalizado, para banners e telemetria. `null` = desconhecido.
 *
 * Procura primeiro na tabela de assinatura, que é onde o dado realmente vive, e
 * cai para uma coluna homônima na empresa. Esse segundo caminho existe porque a
 * consulta do perfil tem um plano B sem o embed (usado quando a tabela ainda não
 * foi criada ou o cache de esquema está frio) — e assim o gate continua
 * funcionando se um dia o campo for desnormalizado para lá.
 */
export function planStatusBruto(profile: ProfileComPlano | null | undefined): string | null {
  const daAssinatura = normalizar(extrairAssinatura(profile)?.plan_status);
  if (daAssinatura !== null) return daAssinatura;
  return normalizar(extrairEmpresa(profile)?.plan_status);
}

/**
 * Nome da empresa pronto para exibir. Existe para a UI não precisar lidar com o
 * `unknown` dos campos da empresa nem repetir o fallback em cada tela.
 */
export function nomeDaEmpresa(
  profile: ProfileComPlano | null | undefined,
  padrao = 'sua empresa',
): string {
  const nome = extrairEmpresa(profile)?.nome;
  return typeof nome === 'string' && nome.trim() !== '' ? nome : padrao;
}

/**
 * Fim do ciclo pago, quando o perfil trouxe a assinatura embutida.
 *
 * Só é consultado para `trialing`: nos demais status quem decide é o
 * `plan_status`, e olhar a data mudaria o comportamento de quem paga em dia
 * durante a janela entre o vencimento e a confirmação do Stripe.
 */
function fimDoPeriodo(profile: ProfileComPlano | null | undefined): Date | null {
  const bruto = extrairAssinatura(profile)?.current_period_end;
  if (typeof bruto !== 'string' || !bruto.trim()) return null;
  const d = new Date(bruto);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function statusPlano(profile: ProfileComPlano | null | undefined): StatusPlano {
  // Sem profile não dá para afirmar nada sobre a assinatura.
  if (!profile) return 'desconhecido';

  // Super-admin global nunca cai no paywall. A checagem mora aqui (e não só em
  // quem chama) para nenhum consumidor futuro esquecer dela. Normalizado como os
  // demais campos: `role` é texto livre no banco, sem enum que garanta a caixa.
  if (normalizar(profile.role) === 'admin') return 'liberado';

  const status = planStatusBruto(profile);
  if (status === null) return 'desconhecido';

  // Teste liberado pelo painel de CS: vale só até a data marcada. Sem esta
  // checagem, `trialing` — que não está na denylist — seria acesso vitalício,
  // e o botão de "liberar 7 dias" na prática liberaria para sempre.
  //
  // Data ausente continua liberando: o webhook do Stripe já gravou trial sem
  // `current_period_end`, e trancar alguém por causa de um campo vazio é mais
  // caro que liberar a mais por alguns dias. Espelha empresa_plano_ativo().
  if (status === 'trialing') {
    const fim = fimDoPeriodo(profile);
    return fim && fim.getTime() <= Date.now() ? 'bloqueado' : 'liberado';
  }

  return STATUS_BLOQUEADOS.includes(status) ? 'bloqueado' : 'liberado';
}

/** Único predicado que o gate consome. Nunca lança, nunca devolve undefined. */
export function planoBloqueado(profile: ProfileComPlano | null | undefined): boolean {
  return statusPlano(profile) === 'bloqueado';
}

/**
 * POR QUE a empresa está bloqueada — não apenas SE está.
 *
 * `statusPlano` colapsa três situações diferentes na mesma palavra "bloqueado", e para a
 * pessoa do outro lado da tela elas não são a mesma coisa nem de longe:
 *
 *   - `teste_venceu`    — usou os 7 dias e o prazo acabou. Nunca deveu nada.
 *   - `nunca_ativou`    — cadastrou e não chegou a assinar. Também nunca deveu nada.
 *   - `pagamento_parou` — foi cliente pagante e a cobrança falhou. Este sim tem pendência.
 *
 * 🔴 A DIFERENÇA ENTRE OS DOIS PRIMEIROS E O TERCEIRO NÃO É COSMÉTICA. Dizer "regularize seu
 * pagamento" para quem nunca pagou um centavo é acusar de calote quem não deve nada — e é
 * exatamente o erro que o painel de admin cometeu até 29/08/2026, quando mostrava "Pagamento
 * parado" para uma empresa que só tinha aberto o checkout e desistido.
 *
 * O sinal que separa é `stripe_subscription_id`: só existe quando houve assinatura de verdade.
 * NÃO use `stripe_customer_id` para isso — ele nasce quando a pessoa ABRE o checkout, antes de
 * qualquer cobrança. Foi essa confusão que produziu o rótulo mentiroso.
 *
 * Devolve `null` quando a empresa NÃO está bloqueada, para quem chama poder usar como guarda.
 */
export type MotivoDoBloqueio = 'teste_venceu' | 'nunca_ativou' | 'pagamento_parou';

export interface Bloqueio {
  motivo: MotivoDoBloqueio;
  /** Quando o teste venceu. Só preenchido em `teste_venceu`; `null` nos demais. */
  venceuEm: Date | null;
}

export function motivoDoBloqueio(
  profile: ProfileComPlano | null | undefined,
): Bloqueio | null {
  if (statusPlano(profile) !== 'bloqueado') return null;

  // Teste vencido é o único caso em que `statusPlano` bloqueia SEM o status estar na denylist
  // — ele bloqueia pela data. Por isso a checagem vem primeiro: perguntar pelo status aqui
  // daria 'trialing', que não diz nada sobre estar vencido.
  if (planStatusBruto(profile) === 'trialing') {
    return { motivo: 'teste_venceu', venceuEm: fimDoPeriodo(profile) };
  }

  const assinatura = extrairAssinatura(profile);
  const jaAssinou =
    typeof assinatura?.stripe_subscription_id === 'string' &&
    assinatura.stripe_subscription_id.trim() !== '';

  return { motivo: jaAssinou ? 'pagamento_parou' : 'nunca_ativou', venceuEm: null };
}

/**
 * A situação comercial da MINHA empresa, no mesmo vocabulário do painel de admin.
 *
 * 🔴 REAPROVEITA `situacaoDaEmpresa`, E ISSO É O PONTO. Ela já traduz status técnico em
 * leitura comercial (pagante / em teste / teste vencido / cortesia / cadastrou-não-pagou /
 * pagamento parado) e tem 25 testes fixando os casos. Escrever uma segunda tradução aqui
 * criaria a divergência clássica: a tela do cliente dizendo uma coisa e a de vocês dizendo
 * outra sobre a mesma empresa — e ninguém descobriria até alguém comparar as duas.
 *
 * O que muda entre as duas é só a FONTE. O painel recebe booleanos já calculados pela função
 * de banco `admin_empresas_cs`; o cliente recebe os identificadores crus dentro do perfil.
 * Este adaptador faz a ponte, e é só isso que ele faz.
 *
 * 🔴 `tem_assinatura_stripe` vem de `stripe_subscription_id`, NUNCA de `stripe_customer_id`:
 * o cadastro nasce quando a pessoa abre o checkout, antes de qualquer cobrança.
 */
export function situacaoDoMeuPlano(
  profile: ProfileComPlano | null | undefined,
): SituacaoCS | null {
  const assinatura = extrairAssinatura(profile);
  if (!assinatura) return null;

  const preenchido = (v: unknown) => typeof v === 'string' && v.trim() !== '';

  return situacaoDaEmpresa({
    plan_status: typeof assinatura.plan_status === 'string' ? assinatura.plan_status : null,
    origem: typeof assinatura.origem === 'string' ? assinatura.origem : null,
    current_period_end:
      typeof assinatura.current_period_end === 'string' ? assinatura.current_period_end : null,
    tem_customer_stripe: preenchido(assinatura.stripe_customer_id),
    tem_assinatura_stripe: preenchido(assinatura.stripe_subscription_id),
  });
}

/** Papéis que respondem pela empresa e podem, portanto, tratar da assinatura. */
const PAPEIS_GESTORES = ['empresa', 'gestor'];

/**
 * Quem pode iniciar o checkout e abrir o portal: o dono registrado da empresa ou
 * qualquer gestor dela.
 *
 * Não basta o dono. `empresas.owner_id` guarda uma única pessoa — a que criou a
 * conta — e há estados normais em que ela não pode agir: um segundo gestor
 * assumiu a operação, ou o dono foi suspenso. Restringir ao dono deixaria a
 * empresa inteira sem ninguém capaz de reativar o acesso.
 *
 * Armadilha ao comparar o dono: `owner_id` guarda o `auth.users.id`, não o
 * `usuarios.id` (ver `handle_new_user`). Comparar com `profile.id` pode passar em
 * base de teste e falhar em produção — a comparação é contra `session.user.id`.
 *
 * Isto decide apenas se o botão aparece. A autorização real de cobrança é da
 * Edge Function, a partir do JWT, e é lá que a regra precisa ser reafirmada.
 */
export function podeGerenciarAssinatura(
  profile: ProfileComPlano | null | undefined,
  session: SessaoComUsuario | null | undefined,
): boolean {
  if (!profile || profile.deleted_at) return false;
  const empresa = extrairEmpresa(profile);
  if (!empresa) return false;
  // Exige sessão mesmo para o caminho por papel: sem ela não há como o servidor
  // autorizar a cobrança depois.
  if (!session?.user?.id) return false;

  if (mesmoId(empresa.owner_id, session.user.id)) return true;
  return PAPEIS_GESTORES.includes(normalizar(profile.role) ?? '');
}

/**
 * Interruptor do paywall. Nasce desligado: enquanto o backend de cobrança não
 * existe (Fase 3), o gate é inerte e esta fase pode ir para produção sem risco
 * de trancar ninguém.
 *
 * Fica fora das funções puras acima de propósito, para que nenhum teste dependa
 * de variável de ambiente.
 *
 * Atenção operacional: `import.meta.env` é substituído em tempo de build. Mudar
 * a variável na Vercel não liga o paywall sozinho — exige redeploy.
 *
 * Aceita variações de escrita de propósito: exigir a string exata 'true' faria
 * um 'TRUE' ou '1' digitado no painel deixar o paywall silenciosamente
 * desligado, e como o valor é fixado no build o diagnóstico custaria outro deploy.
 */
export const PAYWALL_ATIVO = ['true', '1', 'sim'].includes(
  String(import.meta.env.VITE_PAYWALL_ATIVO ?? '')
    .trim()
    .toLowerCase(),
);
