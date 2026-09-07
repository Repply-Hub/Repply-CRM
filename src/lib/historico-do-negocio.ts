/**
 * O que o histórico de movimentação do negócio deve MOSTRAR.
 *
 * 🔴 O PROBLEMA, relatado pelo dono do produto em 06/09/2026 e medido no mesmo dia. Ao abrir o
 * negócio "Construtora Licenge Ltda | Quartzolit", o histórico estava assim:
 *
 *     Definiu migracao_obra como "{"data": "2026-09-04", "lote": "licenge-2",
 *       "obra_anterior": null, "cliente_anterior": "b512c9c1-…", …}"
 *     Alterou Cliente de "Sand Hill Empresarial" para "Construtora Licenge Ltda"
 *     Definiu Obra como "Sand Hill Empresarial"
 *     04/09/2026 às 12:13 · Pricila Azevedo
 *
 * Três problemas de uma vez:
 *
 *   1. `migracao_obra` não é um campo do CRM — é uma marca técnica que o mutirão de obras de
 *      04/09 gravou em `campos_extras` para saber o que já tinha migrado. O gatilho do banco
 *      registra QUALQUER campo extra que muda, e como essa chave não tem rótulo configurado,
 *      ele imprime o nome cru da coluna e o JSON inteiro;
 *   2. as trocas de Cliente e Obra ao lado são consequência do mesmo mutirão, e aparecem em
 *      pares que se desfazem e refazem (11:24 desfez, 12:13 refez) — leitura impossível;
 *   3. 🔴 **estão assinadas por "Pricila Azevedo", que não fez nada disso.** O gatilho usa
 *      `COALESCE(get_my_usuario_id(), NEW.usuario_id)`, e como o mutirão rodou por SQL — sem
 *      usuário logado — ele caiu no dono do negócio. O histórico atribui a uma pessoa real um
 *      trabalho de máquina, que é pior do que não mostrar nada.
 *
 * Medido em produção em 06/09/2026: das 3.401 linhas de alteração de campo, **3.375 vieram do
 * mutirão** — 1.125 do marcador e 2.250 das trocas de Cliente/Obra que o acompanham. Sobram 26
 * feitas por gente. E 391 negócios têm o histórico nessa situação.
 *
 * 🔴 ESCONDER, NÃO APAGAR. Decisão do dono do produto em 06/09/2026: nada sai do banco. Se um
 * dia for preciso auditar a migração das obras, o registro continua lá inteiro — some só da
 * tela, que é onde ele atrapalha.
 *
 * ── A RÉGUA, e por que ela é segura ──────────────────────────────────────────────────────────
 *
 * Uma linha é do mutirão quando **compartilha o instante EXATO** de um marcador do mesmo
 * negócio. Funciona porque o `now()` do Postgres é o início da transação: as três gravações do
 * gatilho saem com o mesmo `created_at` até o microssegundo.
 *
 * Conferido contra produção antes de escolher:
 *
 *   linhas de Cliente/Obra que casam no instante exato ....... 2.250  (escondidas)
 *   linhas de Cliente/Obra SEM par ...........................     5  (preservadas)
 *   mudanças de ETAPA que seriam escondidas ..................     0
 *   campos distintos atingidos ............................... apenas Cliente e Obra
 *
 * Uma edição normal também grava vários campos no mesmo instante — mas nenhum deles é o
 * marcador, então nada dela é escondido. E a mesma troca de cliente feita à mão, em outro
 * instante, continua aparecendo: é o quarto teste deste arquivo.
 */

export const MARCADOR_DE_MUTIRAO = 'migracao_obra';

export interface LinhaDeHistorico {
  pedido_id: string;
  tipo: 'status' | 'campo';
  campo: string | null;
  created_at: string;
}

/** Negócio + instante: o par que identifica uma gravação do gatilho. */
function instante(linha: LinhaDeHistorico): string {
  return `${linha.pedido_id}|${linha.created_at}`;
}

export function linhasVisiveisDoHistorico<T extends LinhaDeHistorico>(
  linhas: readonly T[] | null | undefined,
): T[] {
  if (!linhas?.length) return [];

  const doMutirao = new Set<string>();
  for (const linha of linhas) {
    if (linha.campo === MARCADOR_DE_MUTIRAO) doMutirao.add(instante(linha));
  }
  if (doMutirao.size === 0) return [...linhas];

  return linhas.filter((linha) => {
    if (linha.campo === MARCADOR_DE_MUTIRAO) return false;
    // 🔴 Mudança de etapa NUNCA é escondida. O mutirão não mexeu em etapa nenhuma (medido: 0),
    // e a etapa é a espinha do histórico — perder uma por causa de um instante coincidente
    // custaria muito mais do que o ruído que estamos tirando.
    if (linha.tipo === 'status') return true;
    return !doMutirao.has(instante(linha));
  });
}
