import { useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
  const navigate = useNavigate();
  const negocioAberto = busca.get('negocio');

  // Lembra se foi ESTE hook que empurrou (`push`) a entrada ATUAL do histórico — conserto do
  // achado 🟠 A1 da revisão da Tarefa 2 (09/09/2026). Começa em `false` de propósito: um negócio
  // que já chega pronto no endereço (link direto, F5, ou voltando de uma rota bem diferente — o
  // hook remonta do zero) não tem entrada NOSSA para desfazer. Só `abrirNegocio` vira `true`.
  //
  // Reseta sozinha sempre que o negócio fecha (`!negocioAberto`), não só quando é `fecharNegocio`
  // quem fecha: se o botão voltar do navegador fechar o painel por fora (`POP`, sem passar por
  // aqui), a marca não pode continuar dizendo "fui eu" para a entrada seguinte — senão um
  // "Fechar" chamado depois empurraria a pessoa (`navigate(-1)`) para uma entrada que este hook
  // nunca criou. É a cautela que a revisão pediu para o caminho "abriu, navegou para longe e
  // voltou".
  const empurrouAEntradaAtual = useRef(false);
  if (!negocioAberto) empurrouAEntradaAtual.current = false;

  // Forma funcional (`prev => ...`) em vez de `comNegocio(busca, id)`: tira `busca` da lista de
  // dependências do `useCallback` (achado 🟡 A3), então `abrirNegocio`/`fecharNegocio` param de
  // trocar de identidade em QUALQUER mudança de endereço alheia — um filtro mexido com o painel
  // aberto, por exemplo — o que hoje derruba à toa o `memo` de `KanbanColumn`/`KanbanCard`. (O
  // clique que abre ou fecha ainda recria os dois nessa hora — o `setSearchParams` do React
  // Router é memoizado sobre o `searchParams` atual por dentro, então também troca quando o
  // endereço muda por causa DELE; medido, não dá para evitar sem outra técnica. O ganho daqui é
  // não recriar de novo a cada re-render QUE NÃO seja essa mudança.)
  const abrirNegocio = useCallback(
    (id: string) => {
      setBusca((prev) => comNegocio(prev, id), { replace: false });
      empurrouAEntradaAtual.current = true;
    },
    [setBusca],
  );

  // Fechar desfaz a ENTRADA (`navigate(-1)`), não só o parâmetro, quando foi este hook que a
  // criou: assim o histórico não cresce a cada abrir-e-fechar, e o botão voltar não fica preso
  // numa entrada idêntica à anterior. São os dois sintomas medidos do achado A1 — com
  // `createMemoryHistory`, abrir e fechar 3 negócios deixava 3 entradas soltas no histórico, e o
  // primeiro voltar depois de "Fechar" não fazia nada visível (a busca da entrada de trás é igual
  // à de agora, então nem o `useSearchParams` muda de valor).
  //
  // Quando não fomos nós — negócio que já chegou pronto no endereço —, não existe entrada nossa
  // para desfazer: `navigate(-1)` sairia do painel para além de onde ele deveria (ou para fora do
  // app, se a pessoa chegou por um link direto). Nesse caso o fechamento continua sendo o
  // `replace: true` de sempre, que só apaga o parâmetro sem mexer na pilha do histórico.
  const fecharNegocio = useCallback(
    () => {
      if (empurrouAEntradaAtual.current) {
        empurrouAEntradaAtual.current = false;
        navigate(-1);
      } else {
        setBusca((prev) => comNegocio(prev, null), { replace: true });
      }
    },
    [navigate, setBusca],
  );

  return { negocioAberto, abrirNegocio, fecharNegocio };
}
