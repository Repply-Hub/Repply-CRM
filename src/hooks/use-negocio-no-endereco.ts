import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

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
 * A marca que `abrirNegocio` deixa na entrada do histórico que ele empurra.
 *
 * Vai no `state` da entrada — o mesmo lugar onde o React Router guarda o `state` de qualquer
 * `navigate` —, e é o que `fecharNegocio` lê para decidir entre desfazer a entrada e apagar o
 * parâmetro por cima.
 */
type EstadoDaEntrada = { negocioAbertoPorNos?: boolean } | null;

/**
 * O negócio aberto vive no ENDEREÇO, não em estado da tela.
 *
 * Assim recarregar a página mantém o painel aberto, o botão de voltar do navegador o fecha, e o
 * link serve para mandar a alguém. É o mesmo parâmetro que a tela de Negócios já usava — o que
 * muda é que agora ele vale em qualquer tela.
 *
 * 🔴 PODE SER MONTADO MAIS DE UMA VEZ NA MESMA TELA. Foi o defeito que este hook já teve: a marca
 * de "fui eu que empurrei esta entrada" morava num `useRef`, que é UM POR INSTÂNCIA. Numa tela
 * com duas instâncias — uma num componente que só abre, outra na página que monta o painel e é
 * quem fecha — quem empurrava não era quem lia a marca, e o fechamento caía no `replace` sem
 * ninguém perceber. Não dava erro de tipo, não quebrava teste, e na tela o sintoma era só "o
 * primeiro clique no botão voltar não fez nada".
 *
 * Hoje a marca mora no `state` da PRÓPRIA ENTRADA do histórico, então ela vale entre instâncias,
 * sobrevive a remontagem e some sozinha quando a pessoa navega para outro lugar. Montar o hook
 * quantas vezes for preciso é seguro.
 *
 * 🔴 O QUE ISSO COBRA DE QUEM MONTA A TELA: quem mexer no endereço com `replace` tem que
 * REPASSAR `state: location.state`. Um `replace` sem `state` nas opções não "deixa o state como
 * estava" — ele grava `undefined`. As duas telas que usam este hook espelham filtros na URL com
 * `replace` (`Negocios.tsx` num efeito que dispara sozinho a cada mudança de busca, `Hoje.tsx` a
 * cada filtro mexido), então esquecer o repasse apaga a marca em silêncio e devolve o defeito do
 * achado A1 da revisão da Tarefa 2. Não é regra deste hook, é do React Router: qualquer `state`
 * de qualquer funcionalidade morre do mesmo jeito. O teste
 * `use-negocio-no-endereco-na-tela.test.tsx` reproduz o espelho de filtros e prende isto.
 */
export function useNegocioNoEndereco() {
  const [busca, setBusca] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const negocioAberto = busca.get('negocio');

  // Foi `abrirNegocio` que empurrou (`push`) a entrada ATUAL do histórico? — conserto do achado
  // 🟠 A1 da revisão da Tarefa 2 (09/09/2026), refeito na raiz em 09/09/2026 pelos achados A1/A2
  // da revisão da Tarefa 3.
  //
  // A resposta vem do `state` da entrada, não de memória do componente. Um negócio que já chega
  // pronto no endereço (link direto, F5, ou uma entrada que outra pessoa mandou) não tem a marca,
  // porque a marca é gravada por quem empurra — e é exatamente essa a distinção que interessa.
  const abrimosNos = (location.state as EstadoDaEntrada)?.negocioAbertoPorNos === true;

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
      const marca: EstadoDaEntrada = { negocioAbertoPorNos: true };
      setBusca((prev) => comNegocio(prev, id), { replace: false, state: marca });
    },
    [setBusca],
  );

  // Fechar desfaz a ENTRADA (`navigate(-1)`), não só o parâmetro, quando foi `abrirNegocio` que a
  // criou: assim o histórico não cresce a cada abrir-e-fechar, e o botão voltar não fica preso
  // numa entrada idêntica à anterior. São os dois sintomas medidos do achado A1 — com
  // `createMemoryHistory`, abrir e fechar 3 negócios deixava 3 entradas soltas no histórico, e o
  // primeiro voltar depois de "Fechar" não fazia nada visível (a busca da entrada de trás é igual
  // à de agora, então nem o `useSearchParams` muda de valor).
  //
  // Quando não fomos nós — negócio que já chegou pronto no endereço —, não existe entrada nossa
  // para desfazer: `navigate(-1)` sairia do painel para além de onde ele deveria (ou para fora do
  // app, se a pessoa chegou por um link direto). Nesse caso o fechamento continua sendo o
  // `replace: true` de sempre, que só apaga o parâmetro sem mexer na pilha do histórico. O
  // `state: null` aqui é deliberado: a entrada que fica não foi empurrada por nós.
  const fecharNegocio = useCallback(
    () => {
      if (abrimosNos) {
        navigate(-1);
      } else {
        setBusca((prev) => comNegocio(prev, null), { replace: true, state: null });
      }
    },
    [abrimosNos, navigate, setBusca],
  );

  return { negocioAberto, abrirNegocio, fecharNegocio };
}
