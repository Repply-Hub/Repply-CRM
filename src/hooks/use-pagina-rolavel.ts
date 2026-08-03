import { useEffect } from 'react';

/**
 * Libera o scroll nativo do documento na página que chamar este hook.
 *
 * O `src/index.css` mantém `html, body, #root { overflow: hidden }` porque o app
 * logado é um shell de altura fixa com painéis que rolam por dentro. A landing é
 * longa e precisa do scroll do documento — inclusive para o colapso da barra de
 * URL no mobile, que um container interno com overflow-y nunca devolve.
 *
 * As telas de entrada e de assinatura NÃO usam este hook: elas resolvem o mesmo
 * problema com um container próprio de altura fixa que rola por dentro, o que
 * mantém o painel de marca fixo enquanto o formulário acompanha.
 *
 * O contador de módulo evita o buraco da transição: ao navegar da landing para
 * /cadastro, o React monta a página nova antes de desmontar a antiga, e um
 * cleanup ingênuo removeria a classe logo depois de a nova tê-la aplicado.
 */
let paginasAtivas = 0;

export function usePaginaRolavel() {
  useEffect(() => {
    paginasAtivas += 1;
    document.documentElement.classList.add('pagina-rolavel');

    return () => {
      paginasAtivas -= 1;
      if (paginasAtivas <= 0) {
        paginasAtivas = 0;
        document.documentElement.classList.remove('pagina-rolavel');
      }
    };
  }, []);
}
