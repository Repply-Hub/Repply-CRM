import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissoes } from '@/hooks/use-permissoes';
import { vePautaDeTodos } from '@/lib/pauta-de-todos';

export type AcaoPermissao = 'ver' | 'criar' | 'editar' | 'excluir';

/**
 * "EU posso fazer isto?" — o espelho, no frontend, da função `has_permission` do banco.
 *
 * Já existia `usePermissoes(id)`, que devolve a lista crua de permissões de UMA pessoa; ela é
 * usada nas telas que ADMINISTRAM permissão de terceiros (Configurações → Usuários) e no menu
 * lateral. O que não existia era a pergunta do ponto de vista de quem está usando o sistema —
 * e cada tela que precisasse dela ia reimplementar a regra, com chance de errar o padrão de
 * um dos casos.
 *
 * 🔴 ISTO NÃO PROTEGE NADA. Quem protege é a política de RLS do Postgres (`CLAUDE.md` §6.1).
 * Serve para a pessoa receber uma frase em português em vez de um erro cru de banco no meio
 * de uma ação destrutiva. Se este arquivo e a política do banco divergirem, quem manda é o
 * banco — e a divergência aparece como botão que existe e não funciona.
 *
 * A regra copiada, de `public.has_permission`:
 *
 *   role = 'gestor'  →  true para tudo
 *   'ver'            →  COALESCE(pode_ver,     true)   ← o único cujo padrão é LIBERADO
 *   'criar'          →  COALESCE(pode_criar,   false)
 *   'editar'         →  COALESCE(pode_editar,  false)
 *   'excluir'        →  COALESCE(pode_excluir, false)
 *
 * ⚠️ Uma diferença que parece bug e não é: `has_permission` libera direto só quando o papel é
 * exatamente `'gestor'` — `admin` e `empresa` NÃO passam por ali. Nas políticas de `pedidos`
 * eles entram pelo outro lado da condição, o `is_gestor()`, que aceita os três. Por isso aqui
 * o atalho usa os três papéis: o que se está espelhando é a política inteira
 * (`is_gestor() OR has_permission(...)`), não a função sozinha.
 */
export function useMinhaPermissao(modulo: string, acao: AcaoPermissao): {
  permitido: boolean;
  carregando: boolean;
} {
  const { profile, loading } = useAuth();

  const ehGestor =
    profile?.role === 'gestor' || profile?.role === 'admin' || profile?.role === 'empresa';

  // Gestor não precisa da consulta: `enabled` fica falso e a lista nunca é buscada.
  const { data: permissoes, isLoading: carregandoPermissoes } = usePermissoes(
    !ehGestor ? profile?.id : undefined,
  );

  return useMemo(() => {
    if (ehGestor) return { permitido: true, carregando: false };

    // Enquanto não se sabe, a resposta é "não pode" — e `carregando` diz que é provisório.
    // O contrário (liberar por padrão enquanto carrega) faria o botão de apagar piscar
    // habilitado por um instante, que é exatamente o instante em que alguém clica.
    const carregando = loading || carregandoPermissoes || !permissoes;
    if (carregando) return { permitido: false, carregando: true };

    const doModulo = permissoes.find(p => p.modulo === modulo);

    // Sem linha para o módulo: 'ver' é liberado, o resto é negado — igual ao COALESCE do banco.
    if (!doModulo) return { permitido: acao === 'ver', carregando: false };

    const valor =
      acao === 'ver' ? doModulo.pode_ver
      : acao === 'criar' ? doModulo.pode_criar
      : acao === 'editar' ? doModulo.pode_editar
      : doModulo.pode_excluir;

    return { permitido: valor === true, carregando: false };
  }, [ehGestor, loading, carregandoPermissoes, permissoes, modulo, acao]);
}

/**
 * "EU vejo os negócios de toda a equipe na tela 'Hoje'?" — o espelho de
 * `public.ve_pauta_de_todos(uuid)` no banco.
 *
 * 🔴 A CHAVE MUDOU DE DONO EM 09/09/2026, E O NOME DELA FICOU PARA TRÁS. Ela NÃO governa mais a
 * FILA da tela "Hoje": desde a migration 20260909120000 a fila é sempre pessoal, para todo mundo
 * — gestor inclusive. O que a chave `pauta_de_todos` libera hoje é o painel "No geral" de baixo:
 * a TABELA DO TIME (`negocios_em_risco`), o gráfico "Risco por Vendedor" e o filtro de
 * Responsável. Quem tem a chave vê a carteira da equipe ali; quem não tem vê a própria.
 *
 * 🔴 ISTO NÃO PROTEGE NADA. Quem decide são `negocios_em_risco` (quais negócios entram na tabela)
 * e `dashboard_negocios_risco` (se a lista nominal por responsável vem preenchida), as duas no
 * servidor, pelo mesmo `eu_vejo_pauta_de_todos()`. Aqui serve para não oferecer um filtro de
 * "Responsável" que voltaria vazio, e para não desenhar uma coluna de dono que repetiria o mesmo
 * nome em todas as linhas.
 *
 * 🔴 POR QUE ELE NÃO USA `usePodeFazer('pedidos', 'ver', 'pauta_de_todos')`, que já existe:
 * aquele hook começa com `if (ehGestor) return true` — **sem olhar a linha de permissão**. É o
 * mesmo atalho de `has_funcionalidade()` no banco, e ele torna IMPOSSÍVEL o caso que mais
 * importa: um gestor com o interruptor "Ver a pauta de toda a equipe" DESLIGADO à mão tem de
 * voltar a ver só os próprios negócios, porque é assim que o servidor já se comporta. Com o
 * atalho, a tela diria "vê tudo" e o servidor devolveria só os próprios — o tipo de desencontro
 * que leva meses até alguém notar.
 *
 * A decisão em si mora em `src/lib/pauta-de-todos.ts`, como função pura, com teste que fixa os
 * quatro casos (chave ligada/desligada × vendedor/gestor).
 *
 * ⚠️ DIFERENÇA DELIBERADA EM RELAÇÃO A `useMinhaPermissao`: aqui a linha de permissão é buscada
 * TAMBÉM para gestor. Lá o gestor é atalho e a consulta nem sai; aqui ela é o ponto — sem ela a
 * chave desligada nunca seria lida. É uma consulta a mais na tela "Hoje", em cache compartilhado
 * com a matriz de permissões (`['permissoes_usuario', id]`).
 */
export function usePossoVerPautaDeTodos(): boolean {
  const { profile, loading } = useAuth();
  const { data: permissoes, isLoading: carregandoPermissoes } = usePermissoes(profile?.id);

  return useMemo(() => {
    // Enquanto não se sabe, a resposta é "não vejo" — mesmo raciocínio de `useMinhaPermissao`.
    // O preço é o filtro de Responsável e a coluna de dono da tabela do time aparecerem uma
    // fração de segundo depois para o gestor; o preço do contrário seria os dois PISCAREM ligados
    // e sumirem justamente para quem teve a chave desligada à mão, que é o caso que este hook
    // existe para acertar.
    if (loading || carregandoPermissoes || !permissoes) return false;
    return vePautaDeTodos(profile?.role, permissoes);
  }, [loading, carregandoPermissoes, permissoes, profile?.role]);
}
