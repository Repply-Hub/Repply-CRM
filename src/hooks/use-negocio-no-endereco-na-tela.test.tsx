import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
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

  it('navegar para longe com o painel aberto e voltar não faz o fechamento empurrar a pessoa para fora', () => {
    // ⚠️ O caminho de risco que a revisão pediu para cobrir: abrir empurra uma entrada (a marca
    // do useRef vira "fui eu"). A pessoa sai para OUTRA rota sem fechar o painel — no app de
    // verdade isso desmonta o componente que chama o hook — e depois volta para a entrada que já
    // tinha `?negocio=`. Se a marca sobrevivesse e ainda dissesse "fui eu", fechar chamaria
    // `navigate(-1)` e desfaria uma entrada que ESTA instância nunca empurrou.
    //
    // Desmontar e montar de novo no endereço que ficou é o equivalente de teste para "saiu da
    // rota e voltou": o `useRef` nasce `false` de novo, exatamente como aconteceria de verdade.
    const { result, unmount } = montar('/app?stages=x');

    act(() => result.current.abrirNegocio('n-1'));
    const enderecoComPainelAberto = result.current.busca;
    unmount();

    const remontado = montar(`/app${enderecoComPainelAberto}`);
    expect(remontado.result.current.negocioAberto).toBe('n-1');

    act(() => remontado.result.current.fecharNegocio());

    // A marca desta instância nunca virou `true` — fechar tem que apagar o parâmetro com
    // replace, nunca tentar desfazer uma entrada que não é dela.
    expect(remontado.result.current.acaoDeNavegacao).toBe('REPLACE');
    expect(remontado.result.current.negocioAberto).toBeNull();
  });
});
