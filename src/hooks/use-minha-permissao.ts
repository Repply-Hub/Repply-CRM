import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissoes } from '@/hooks/use-permissoes';

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
