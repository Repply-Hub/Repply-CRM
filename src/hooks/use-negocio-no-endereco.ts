import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Devolve uma CÓPIA da busca com `?negocio=<id>` posto ou tirado.
 *
 * Cópia, não o original: `URLSearchParams` é mutável e o React Router recebe o objeto por
 * referência — mutar o que veio faz a tela trocar de filtro sozinha. Mesmo motivo de
 * `escreverFiltrosNoEndereco` em `src/lib/filtros-do-painel.ts`.
 */
export function comNegocio(busca: URLSearchParams, id: string | null): URLSearchParams {
  const copia = new URLSearchParams(busca);
  if (id) copia.set('negocio', id);
  else copia.delete('negocio');
  return copia;
}

/**
 * O negócio aberto vive no ENDEREÇO, não em estado da tela.
 *
 * Assim recarregar a página mantém o painel aberto, o botão de voltar do navegador o fecha, e o
 * link serve para mandar a alguém. É o mesmo parâmetro que a tela de Negócios já usava — o que
 * muda é que agora ele vale em qualquer tela.
 */
export function useNegocioNoEndereco() {
  const [busca, setBusca] = useSearchParams();
  const negocioAberto = busca.get('negocio');

  const abrirNegocio = useCallback(
    (id: string) => setBusca(comNegocio(busca, id), { replace: false }),
    [busca, setBusca],
  );
  // `replace: true` ao fechar: abrir e fechar o painel não deve encher o histórico do navegador
  // de passos que a pessoa não deu.
  const fecharNegocio = useCallback(
    () => setBusca(comNegocio(busca, null), { replace: true }),
    [busca, setBusca],
  );

  return { negocioAberto, abrirNegocio, fecharNegocio };
}
