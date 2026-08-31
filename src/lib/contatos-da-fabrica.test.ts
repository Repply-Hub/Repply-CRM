import { describe, it, expect } from 'vitest';
import {
  ordenarContatos,
  rotuloDoCartao,
  aoMarcarPrincipal,
  type ContatoDaFabrica,
  type FuncaoDaFabrica,
} from './contatos-da-fabrica';

/**
 * POR QUE ESTE ARQUIVO EXISTE: três regras desta funcionalidade erram em SILÊNCIO se
 * ficarem soltas dentro do `.tsx`.
 *
 * 1. A ordenação — sem critério final explícito, a lista sai na ordem que o banco
 *    devolver, que muda entre consultas. O usuário vê os contatos dançando de posição ao
 *    recarregar, sem nada ter mudado.
 * 2. O rótulo do cartão — com zero contatos ele tem que SUMIR, não virar "undefined  +0".
 * 3. A troca de principal — o banco tem índice único parcial
 *    (`fabricante_contatos_um_principal`) e RECUSA dois principais na mesma fábrica. Se a
 *    tela mandar só "marca este" sem desmarcar o outro, a gravação é recusada — e erro do
 *    Supabase não é um `Error`, então a tela cai numa frase genérica sem explicar nada
 *    (CLAUDE.md §4.6).
 *
 * Este projeto não tem um único teste de componente (48 arquivos, zero `render(`), então
 * regra que fica no `.tsx` não é coberta por nada. Daí elas morarem aqui.
 */

const funcoes: FuncaoDaFabrica[] = [
  { id: 'f1', nome: 'Gerente comercial', ordem: 0 },
  { id: 'f2', nome: 'Logística', ordem: 1 },
];

const contato = (
  over: Partial<ContatoDaFabrica> & { id: string; nome: string },
): ContatoDaFabrica => ({
  telefone: null,
  email: null,
  observacao: null,
  principal: false,
  funcao_id: null,
  ...over,
});

describe('ordenarContatos', () => {
  it('põe o principal em primeiro, mesmo que a função dele venha depois', () => {
    const lista = [
      contato({ id: 'a', nome: 'Ana', funcao_id: 'f1' }),
      contato({ id: 'b', nome: 'Bruno', funcao_id: 'f2', principal: true }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('depois do principal, ordena pela ordem da função', () => {
    const lista = [
      contato({ id: 'a', nome: 'Ana', funcao_id: 'f2' }),
      contato({ id: 'b', nome: 'Bruno', funcao_id: 'f1' }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('quem não tem função vai para o FIM, não para o começo', () => {
    // Sem isto, um contato salvo às pressas sem função apareceria antes do gerente.
    const lista = [
      contato({ id: 'a', nome: 'Ana' }),
      contato({ id: 'b', nome: 'Bruno', funcao_id: 'f2' }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('função apagada cai no mesmo lugar de quem não tem função', () => {
    // `funcao_id` aponta para uma função que já não existe: a chave é ON DELETE SET NULL,
    // mas a tela pode ter a lista antiga em cache no instante seguinte à remoção.
    const lista = [
      contato({ id: 'a', nome: 'Ana', funcao_id: 'sumiu' }),
      contato({ id: 'b', nome: 'Bruno', funcao_id: 'f1' }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('empata pelo nome, para a ordem não mudar entre consultas', () => {
    const lista = [
      contato({ id: 'a', nome: 'Zeca', funcao_id: 'f1' }),
      contato({ id: 'b', nome: 'Ana', funcao_id: 'f1' }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('não altera o array recebido', () => {
    const lista = [contato({ id: 'a', nome: 'Zeca' }), contato({ id: 'b', nome: 'Ana' })];
    const copia = [...lista];
    ordenarContatos(lista, funcoes);
    expect(lista).toEqual(copia);
  });
});

describe('rotuloDoCartao', () => {
  it('mostra o principal com a função e a contagem dos demais', () => {
    const lista = [
      contato({ id: 'a', nome: 'Jorge Menezes', funcao_id: 'f1', principal: true }),
      contato({ id: 'b', nome: 'Ana' }),
      contato({ id: 'c', nome: 'Bruno' }),
    ];
    expect(rotuloDoCartao(lista, funcoes)).toBe('Jorge Menezes · Gerente comercial  +2');
  });

  it('sem outros contatos, não mostra contagem', () => {
    const lista = [
      contato({ id: 'a', nome: 'Jorge Menezes', funcao_id: 'f1', principal: true }),
    ];
    expect(rotuloDoCartao(lista, funcoes)).toBe('Jorge Menezes · Gerente comercial');
  });

  it('sem função, mostra só o nome', () => {
    const lista = [contato({ id: 'a', nome: 'Jorge Menezes', principal: true })];
    expect(rotuloDoCartao(lista, funcoes)).toBe('Jorge Menezes');
  });

  it('🔴 sem contato nenhum devolve null, e o cartão não desenha a linha', () => {
    // Devolver string vazia deixaria um espaço fantasma com o ícone e nada ao lado.
    expect(rotuloDoCartao([], funcoes)).toBeNull();
  });

  it('sem principal marcado, usa o primeiro da ordenação em vez de sumir', () => {
    // Cenário real: os 9 contatos migrados nascem principais, mas alguém pode desmarcar
    // ao editar. O cartão não pode ficar mudo por causa disso.
    const lista = [
      contato({ id: 'a', nome: 'Ana', funcao_id: 'f2' }),
      contato({ id: 'b', nome: 'Bruno', funcao_id: 'f1' }),
    ];
    expect(rotuloDoCartao(lista, funcoes)).toBe('Bruno · Gerente comercial  +1');
  });
});

describe('aoMarcarPrincipal', () => {
  it('🔴 devolve TAMBÉM o desmarque do anterior — o banco recusa dois principais', () => {
    const lista = [
      contato({ id: 'a', nome: 'Ana', principal: true }),
      contato({ id: 'b', nome: 'Bruno' }),
    ];
    expect(aoMarcarPrincipal(lista, 'b')).toEqual([
      { id: 'a', principal: false },
      { id: 'b', principal: true },
    ]);
  });

  it('o desmarque vem ANTES da marcação na lista devolvida', () => {
    // A ordem importa na gravação: marcar antes de desmarcar bate no índice único.
    const lista = [
      contato({ id: 'a', nome: 'Ana', principal: true }),
      contato({ id: 'b', nome: 'Bruno' }),
    ];
    const r = aoMarcarPrincipal(lista, 'b');
    expect(r[0].principal).toBe(false);
    expect(r[1].principal).toBe(true);
  });

  it('marcar quem já é principal não gera gravação nenhuma', () => {
    const lista = [contato({ id: 'a', nome: 'Ana', principal: true })];
    expect(aoMarcarPrincipal(lista, 'a')).toEqual([]);
  });

  it('sem nenhum principal antes, só marca o alvo', () => {
    const lista = [contato({ id: 'a', nome: 'Ana' }), contato({ id: 'b', nome: 'Bruno' })];
    expect(aoMarcarPrincipal(lista, 'b')).toEqual([{ id: 'b', principal: true }]);
  });

  it('id que não existe na lista não gera gravação nenhuma', () => {
    const lista = [contato({ id: 'a', nome: 'Ana', principal: true })];
    expect(aoMarcarPrincipal(lista, 'nao-existe')).toEqual([]);
  });
});
