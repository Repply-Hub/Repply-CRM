import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { useNegocioNoEndereco } from './use-negocio-no-endereco';

/**
 * O lado React do hook: o que ele faz com o ENDEREÇO de verdade, dentro de um roteador.
 *
 * O teste vizinho (`use-negocio-no-endereco.test.ts`) prende só a parte pura, `comNegocio`. Ela
 * pode estar certíssima e a tela ainda quebrar — o que decide o comportamento é o que o hook
 * MANDA para o React Router, e é isso que estas asserções olham.
 *
 * 🔴 O QUE ESTE ARQUIVO PRENDE, e é uma mudança de comportamento deliberada de 09/09/2026. Antes,
 * a tela de Negócios guardava o negócio aberto em estado próprio e só escrevia `?negocio=` no
 * FECHAMENTO: clicar num card abria o painel sem mexer na URL, e recarregar a página perdia o que
 * estava aberto. Agora abrir também escreve — recarregar mantém, e o link serve para mandar a
 * alguém. Quem "simplificar" `abrirNegocio` para voltar a mexer só em estado faz o sintoma
 * reaparecer sem nenhum outro teste reclamar: a tela continua funcionando para quem só clica.
 *
 * O caso "recarregar" é montar o hook de novo com o endereço que ficou — que é exatamente o que o
 * navegador faz ao recarregar, já que o parâmetro está na URL e não na memória da aba.
 */

/**
 * Monta o hook num endereço, e deixa espiar o endereço resultante.
 *
 * Também expõe três coisas só para os testes do histórico (achados A1/A5 da revisão da Tarefa 2,
 * 09/09/2026): `acaoDeNavegacao` ('PUSH' | 'REPLACE' | 'POP', do React Router) e `chaveDaEntrada`
 * (a chave única de cada entrada do histórico) — porque o ENDEREÇO final é igual nos dois casos
 * de fechamento, e quem denuncia qual dos dois aconteceu é a ação, não o texto da URL. E
 * `navigate`, para os testes simularem um voltar do navegador que NÃO passa por `fecharNegocio`
 * — é assim que o botão voltar de verdade chega ao React Router.
 */
function montar(endereçoInicial: string) {
  const envolver = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[endereçoInicial]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({
      ...useNegocioNoEndereco(),
      busca: useLocation().search,
      acaoDeNavegacao: useNavigationType(),
      chaveDaEntrada: useLocation().key,
      navigate: useNavigate(),
    }),
    { wrapper: envolver },
  );
}

/**
 * Monta o hook DUAS vezes na mesma árvore, como a tela "Hoje" faria se o `RadarDeRisco` chamasse
 * o seu próprio `useNegocioNoEndereco()`: uma instância abre (a da tabela) e OUTRA fecha (a da
 * página, que é quem monta o painel).
 *
 * `comEspelhoDeFiltros` acrescenta o padrão de `Negocios.tsx:1306` — um efeito que copia filtros
 * para o endereço com `replace`, e que dispara sozinho a cada mudança de busca. Ele existe aqui
 * para provar que esse `replace` não apaga a marca da entrada.
 */
function EspelhoDeFiltros() {
  const [, setBusca] = useSearchParams();
  const location = useLocation();
  useEffect(() => {
    setBusca(
      (prev) => {
        const proxima = new URLSearchParams(prev);
        proxima.set('data_de', '');
        return proxima;
      },
      // 🔴 O `state` é o que este teste vigia. Sem ele, `replace` grava `undefined` por cima.
      { replace: true, state: location.state },
    );
    // A dependência é a mesma da tela de verdade: `setBusca` troca de identidade quando a busca
    // muda, e é isso que faz o efeito re-disparar depois de abrir o painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBusca]);
  return null;
}

function montarDuasInstancias(
  endereçoInicial: string,
  { comEspelhoDeFiltros = false }: { comEspelhoDeFiltros?: boolean } = {},
) {
  const envolver = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[endereçoInicial]}>
      {comEspelhoDeFiltros && <EspelhoDeFiltros />}
      {children}
    </MemoryRouter>
  );
  // Toda ação de navegação por que a árvore passou, na ordem. Existe porque com o espelho de
  // filtros ligado a ÚLTIMA ação não serve de prova: o `replace` do espelho dispara logo depois
  // do `navigate(-1)` do fechamento (a busca mudou, o `setSearchParams` trocou de identidade) e
  // sobrescreve o que o `useNavigationType()` mostra. Quem denuncia o fechamento certo é o
  // 'POP' ter ACONTECIDO, não ser o último.
  const acoes: string[] = [];
  const montado = renderHook(
    () => {
      const daTabela = useNegocioNoEndereco(); // o `RadarDeRisco`: só abre
      const daPagina = useNegocioNoEndereco(); // a página: monta o painel, e é quem fecha
      const acaoDeNavegacao = useNavigationType();
      acoes.push(acaoDeNavegacao);
      return {
        abrirPelaTabela: daTabela.abrirNegocio,
        fecharPelaPagina: daPagina.fecharNegocio,
        negocioAbertoNaPagina: daPagina.negocioAberto,
        acaoDeNavegacao,
        chaveDaEntrada: useLocation().key,
        busca: useLocation().search,
      };
    },
    { wrapper: envolver },
  );
  return { ...montado, acoes };
}

afterEach(cleanup);

describe('useNegocioNoEndereco na tela', () => {
  it('lê o negócio que já veio no endereço', () => {
    const { result } = montar('/pedidos?negocio=n-1');
    expect(result.current.negocioAberto).toBe('n-1');
  });

  it('sem o parâmetro, nenhum negócio está aberto', () => {
    const { result } = montar('/pedidos?stages=negociacao');
    expect(result.current.negocioAberto).toBeNull();
  });

  it('abrir ESCREVE no endereço, preservando os filtros da tela', () => {
    // É esta linha que faz recarregar manter o painel aberto. Sem ela, abrir seria só estado.
    const { result } = montar('/pedidos?stages=negociacao&data_de=2026-09-01');

    act(() => result.current.abrirNegocio('n-7'));

    expect(result.current.negocioAberto).toBe('n-7');
    const depois = new URLSearchParams(result.current.busca);
    expect(depois.get('negocio')).toBe('n-7');
    expect(depois.get('stages')).toBe('negociacao');
    expect(depois.get('data_de')).toBe('2026-09-01');
  });

  it('fechar APAGA o parâmetro do endereço, e recarregar não reabre', () => {
    const { result, unmount } = montar('/pedidos?negocio=n-7&stages=negociacao');

    act(() => result.current.fecharNegocio());

    expect(result.current.negocioAberto).toBeNull();
    const depois = result.current.busca;
    expect(new URLSearchParams(depois).has('negocio')).toBe(false);
    expect(new URLSearchParams(depois).get('stages')).toBe('negociacao');

    // "Recarregar" é montar de novo no endereço que ficou. Se o fechamento tivesse deixado o
    // parâmetro para trás, o painel reabriria sozinho o que a pessoa acabou de fechar — o defeito
    // que a saída única existe para impedir.
    unmount();
    const recarregada = montar(`/pedidos${depois}`);
    expect(recarregada.result.current.negocioAberto).toBeNull();
  });

  it('trocar de negócio sem fechar antes não duplica o parâmetro', () => {
    // `set`, não `append`: dois `negocio=` na URL fariam `get` devolver o primeiro, e o painel
    // ficaria preso no negócio anterior.
    const { result } = montar('/pedidos?negocio=n-1');

    act(() => result.current.abrirNegocio('n-2'));

    expect(result.current.negocioAberto).toBe('n-2');
    expect(new URLSearchParams(result.current.busca).getAll('negocio')).toEqual(['n-2']);
  });
});

/**
 * 🔴 O par `replace: false` (abrir) / `navigate(-1)` OU `replace: true` (fechar, conforme quem
 * abriu) é o achado A1 da revisão da Tarefa 2 (09/09/2026), e este bloco é o achado A5: nada
 * prendia esse par antes, e ele é "o mais fácil de alguém simplificar depois" — por exemplo,
 * voltando o fechamento para um `replace: true` fixo, que ERA o código e parecia funcionar (a
 * URL final fica idêntica).
 *
 * Por isso nenhum teste aqui confia em ler o ENDEREÇO resultante — os dois casos de fechamento
 * terminam na mesma URL sem `?negocio=`. Quem denuncia qual dos dois aconteceu é a AÇÃO que o
 * React Router registrou (`useNavigationType`) e a CHAVE da entrada (`useLocation().key`, única
 * por entrada — `replace` gera uma chave nova na mesma posição, `navigate(-1)` restaura a chave
 * de uma entrada que já existia).
 */
describe('o histórico do navegador — achados A1 e A5 da revisão da Tarefa 2', () => {
  it('abrir empurra uma entrada NOVA no histórico (PUSH)', () => {
    const { result } = montar('/app?stages=x');
    const chaveAntes = result.current.chaveDaEntrada;

    act(() => result.current.abrirNegocio('n-1'));

    expect(result.current.acaoDeNavegacao).toBe('PUSH');
    expect(result.current.chaveDaEntrada).not.toBe(chaveAntes);
  });

  it('fechar o que ESTE hook abriu desfaz a entrada (POP via navigate(-1)), não substitui', () => {
    const { result } = montar('/app?stages=x');
    const chaveAntesDeAbrir = result.current.chaveDaEntrada;

    act(() => result.current.abrirNegocio('n-1'));
    act(() => result.current.fecharNegocio());

    // Se isto virasse 'REPLACE', a linha de A1 que troca `replace`/`navigate(-1)` de lugar
    // regrediu: o histórico ficaria com uma entrada morta idêntica à anterior, e o primeiro
    // voltar do navegador não faria nada visível (o sintoma que a revisão mediu).
    expect(result.current.acaoDeNavegacao).toBe('POP');
    // A chave voltou a ser a de ANTES de abrir — é a mesma entrada, não uma réplica no lugar
    // dela. `replace` teria produzido uma chave NOVA na mesma posição, e este `toBe` pegaria.
    expect(result.current.chaveDaEntrada).toBe(chaveAntesDeAbrir);
  });

  it('abrir e fechar três negócios seguidos não deixa NENHUMA entrada extra no histórico', () => {
    // A medição exata da revisão, invertida: lá, 3 aberturas seguidas de 3 fechamentos deixavam
    // 3 entradas soltas (mesmo endereço, histórico maior). Aqui, depois de CADA ciclo completo,
    // a entrada tem que ser a mesma com que o ciclo começou — nenhuma sobra.
    const { result } = montar('/app?stages=x');
    const chaveInicial = result.current.chaveDaEntrada;

    for (const id of ['n-1', 'n-2', 'n-3']) {
      act(() => result.current.abrirNegocio(id));
      expect(result.current.acaoDeNavegacao).toBe('PUSH');

      act(() => result.current.fecharNegocio());
      expect(result.current.acaoDeNavegacao).toBe('POP');
      expect(result.current.chaveDaEntrada).toBe(chaveInicial);
    }
  });

  it('negócio que já chegou pronto no endereço fecha com REPLACE, nunca com navigate(-1)', () => {
    // Simula link direto ou F5: o hook nasce com `?negocio=` já na URL, sem ter empurrado nada
    // nesta sessão. Não existe entrada NOSSA para desfazer — `navigate(-1)` aqui sairia do
    // painel para além de onde deveria (ou para fora do app, se não houver entrada anterior).
    const { result } = montar('/app?negocio=n-9&stages=x');

    act(() => result.current.fecharNegocio());

    expect(result.current.acaoDeNavegacao).toBe('REPLACE');
    expect(result.current.negocioAberto).toBeNull();
  });

  it('o botão voltar do navegador continua fechando o painel aberto — não pode regredir', () => {
    // `navigate(-1)` chamado por FORA do hook, como o navegador chama de verdade ao apertar
    // voltar — não é `fecharNegocio` quem está fechando aqui. Isto é o comportamento que o brief
    // pediu (ver PainelDoNegocio/Negocios.tsx) e o conserto do A1 não pode quebrar: com o painel
    // aberto, um voltar tem que fechá-lo.
    const { result } = montar('/app?stages=x');

    act(() => result.current.abrirNegocio('n-1'));
    expect(result.current.negocioAberto).toBe('n-1');

    act(() => result.current.navigate(-1));

    expect(result.current.negocioAberto).toBeNull();
  });

  it('DUAS instâncias na mesma árvore: uma abre, a OUTRA fecha, e ainda é um voltar (POP)', () => {
    // 🔴 O caso que motivou tirar a marca do `useRef` (achados A1/A2 da revisão da Tarefa 3,
    // 09/09/2026). É a tela "Hoje" ao pé da letra: o `RadarDeRisco` chamaria o hook para ABRIR e
    // a página chamaria o dela para montar o painel, que é quem FECHA. Com a marca guardada num
    // `useRef` — um por instância — quem empurrou a entrada não é quem lê a marca ao fechar: a
    // instância da página nunca viu nada, cai no ramo `replace` e deixa entrada morta no
    // histórico. O sintoma na tela é mudo: o primeiro clique no botão VOLTAR não faz nada.
    //
    // Guardar a marca no `state` da PRÓPRIA ENTRADA do histórico é o que faz as duas instâncias
    // enxergarem a mesma coisa. Este teste é o que prova isso — ele FALHA (recebe 'REPLACE') na
    // versão de `useRef`, conferido antes do conserto.
    const { result } = montarDuasInstancias('/hoje');
    const chaveAntes = result.current.chaveDaEntrada;

    act(() => result.current.abrirPelaTabela('n-1'));
    expect(result.current.acaoDeNavegacao).toBe('PUSH');
    expect(result.current.negocioAbertoNaPagina).toBe('n-1');

    act(() => result.current.fecharPelaPagina());

    expect(result.current.acaoDeNavegacao).toBe('POP');
    expect(result.current.chaveDaEntrada).toBe(chaveAntes);
    expect(result.current.negocioAbertoNaPagina).toBeNull();
  });

  it('um efeito que espelha filtros no endereço com `replace` não pode apagar a marca', () => {
    // 🔴 A armadilha que o `state` traz junto, e que o `useRef` não tinha. `Negocios.tsx:1306`
    // tem um efeito que copia os filtros para o endereço com `setSearchParams(…, { replace:
    // true })`. Ele dispara SOZINHO logo depois de abrir o painel — a lista de dependências
    // inclui `setSearchParams`, que o React Router memoiza sobre a busca atual
    // (`react-router-dom/dist/index.js:1038-1042`), então mudar o `?negocio=` já troca a
    // identidade dele e re-dispara o efeito.
    //
    // Um `replace` sem `state` nas opções grava `state: undefined` na entrada: apaga a marca em
    // silêncio, e o "Fechar" volta a errar exatamente na tela mais usada do sistema. Por isso os
    // dois espelhos de filtro (aqui e `Hoje.tsx:152`) repassam `state: location.state`. Este
    // teste reproduz o padrão e prende o contrato.
    //
    // Medido em 09/09/2026, com o espelho SEM o repasse: logo depois de `abrirNegocio`, o
    // `location.state` da entrada volta de `{negocioAbertoPorNos:true}` para `null` — e o
    // fechamento não tem mais nenhum 'POP', só 'REPLACE'.
    const { result, acoes } = montarDuasInstancias('/app?stages=x', { comEspelhoDeFiltros: true });

    act(() => result.current.abrirPelaTabela('n-1'));
    // O espelho já rodou aqui dentro: a entrada foi empurrada e depois substituída no lugar.
    expect(result.current.negocioAbertoNaPagina).toBe('n-1');

    const acoesAtePrimeiroFechamento = acoes.length;
    act(() => result.current.fecharPelaPagina());

    // O fechamento tem que ter DESFEITO a entrada. O `replace` que o espelho dispara logo em
    // seguida é ruído — o que não pode faltar é o 'POP'.
    expect(acoes.slice(acoesAtePrimeiroFechamento)).toContain('POP');
    expect(result.current.negocioAbertoNaPagina).toBeNull();
    // E o endereço de trás é o que estava antes de abrir, com os filtros intactos.
    expect(new URLSearchParams(result.current.busca).get('stages')).toBe('x');
  });

  it('entrada sem a marca — link direto, F5, histórico de outra sessão — fecha com REPLACE', () => {
    // ⚠️ Escrito para o caminho "abriu, navegou para longe e voltou" da revisão da Tarefa 2,
    // quando a marca morava num `useRef`. O que ele prende hoje é mais simples e mais geral: uma
    // entrada que TEM `?negocio=` e NÃO tem a marca no `state` nunca pode ser desfeita com
    // `navigate(-1)` — não existe entrada nossa para desfazer, e o voltar sairia do painel para
    // além de onde deveria (ou para fora do app). É o caso do link direto, do F5 e de qualquer
    // entrada que não passou por `abrirNegocio`.
    //
    // 🔴 O que MUDOU com a marca no `state`, e é melhor assim: no navegador de verdade, sair para
    // outra rota e voltar pelo botão voltar devolve a entrada COM a marca — e aí fechar desfaz
    // mesmo, que é o certo, porque aquela entrada foi empurrada por nós. Com o `useRef` isso
    // virava `replace` e deixava entrada morta. Aqui o `MemoryRouter` é montado do zero a partir
    // de uma string, então a entrada nasce sem `state` — o que faz deste teste o caso "sem
    // marca", não mais o caso "navegou e voltou".
    const { result, unmount } = montar('/app?stages=x');

    act(() => result.current.abrirNegocio('n-1'));
    const enderecoComPainelAberto = result.current.busca;
    unmount();

    const remontado = montar(`/app${enderecoComPainelAberto}`);
    expect(remontado.result.current.negocioAberto).toBe('n-1');

    act(() => remontado.result.current.fecharNegocio());

    // A entrada não tem a marca no `state` — fechar tem que apagar o parâmetro com replace,
    // nunca tentar desfazer uma entrada que não foi empurrada por `abrirNegocio`.
    expect(remontado.result.current.acaoDeNavegacao).toBe('REPLACE');
    expect(remontado.result.current.negocioAberto).toBeNull();
  });
});
