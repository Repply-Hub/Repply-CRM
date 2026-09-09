import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

/** Monta o hook num endereço, e deixa espiar o endereço resultante. */
function montar(endereçoInicial: string) {
  const envolver = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[endereçoInicial]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ ...useNegocioNoEndereco(), busca: useLocation().search }),
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
