import { describe, it, expect, afterEach } from 'vitest';
import {
  recusaDeAcesso,
  registrarEstadoDeCobranca,
  esquecerEstadoDeCobranca,
} from './recusa-do-banco';
import { mensagemDeErro } from './mensagem-de-erro';

/**
 * 🔴 O QUE ESTE ARQUIVO PROTEGE. O mesmo erro do banco (42501) tem DUAS causas opostas:
 *
 *   · a empresa está bloqueada        -> resolve pagando
 *   · o usuário não tem permissão ali -> resolve pedindo a um gestor
 *
 * Mandar a pessoa para o lado errado é pior que não explicar nada: quem não deve nada vai
 * procurar uma fatura que não existe, e quem está bloqueado vai cobrar do gestor uma
 * permissão que não é o problema.
 */

const RLS = { code: '42501', message: 'new row violates row-level security policy for table "clientes"' };

afterEach(esquecerEstadoDeCobranca);

describe('recusaDeAcesso', () => {
  it('erro que não é de acesso não é traduzido — a frase original é a parte útil', () => {
    expect(recusaDeAcesso({ code: '23503', message: 'violates foreign key constraint' })).toBeNull();
    expect(recusaDeAcesso(new Error('deu ruim'))).toBeNull();
    expect(recusaDeAcesso(null)).toBeNull();
    expect(recusaDeAcesso('texto solto')).toBeNull();
  });

  it('reconhece pelo código e também só pelo texto', () => {
    // Nem todo caminho preserva o código: erro que passou por função de servidor às vezes
    // chega só com a frase.
    expect(recusaDeAcesso(RLS)).toBeTruthy();
    expect(recusaDeAcesso({ message: 'new row violates row-level security policy' })).toBeTruthy();
    expect(recusaDeAcesso({ message: 'permission denied for table pedidos' })).toBeTruthy();
  });

  it('🔴 empresa bloqueada: aponta o bloqueio, não a permissão', () => {
    registrarEstadoDeCobranca({ bloqueado: true, encerrada: false });
    const frase = recusaDeAcesso(RLS)!;

    expect(frase).toMatch(/bloqueado/i);
    expect(frase).not.toMatch(/gestor/i);
  });

  it('🔴 empresa em dia: aponta a permissão, e não acusa de calote quem não deve nada', () => {
    registrarEstadoDeCobranca({ bloqueado: false, encerrada: false });
    const frase = recusaDeAcesso(RLS)!;

    expect(frase).toMatch(/gestor/i);
    expect(frase).not.toMatch(/bloquead|pagament|regulariz/i);
  });

  it('🔴 conta encerrada tem texto próprio — não manda para uma tela de pagamento sem saída', () => {
    registrarEstadoDeCobranca({ bloqueado: true, encerrada: true });
    const frase = recusaDeAcesso(RLS)!;

    expect(frase).toMatch(/encerrada/i);
    expect(frase).toMatch(/suporte/i);
  });

  it('sem saber o estado, diz as duas possibilidades em vez de chutar uma', () => {
    const frase = recusaDeAcesso(RLS)!;
    expect(frase).toMatch(/bloquead/i);
    expect(frase).toMatch(/permissão/i);
  });

  it('🔴 nenhuma das frases devolve jargão de banco em inglês', () => {
    for (const estado of [null, { bloqueado: true, encerrada: false }, { bloqueado: false, encerrada: false }]) {
      registrarEstadoDeCobranca(estado);
      expect(recusaDeAcesso(RLS)).not.toMatch(/row-level|policy|violates/i);
    }
  });
});

describe('mensagemDeErro com recusa de acesso', () => {
  it('🔴 a tradução chega em quem chama — é onde o usuário vê', () => {
    registrarEstadoDeCobranca({ bloqueado: true, encerrada: false });
    expect(mensagemDeErro(RLS, 'Não foi possível salvar')).toMatch(/bloqueado/i);
  });

  it('e não atrapalha os outros erros, que continuam vindo do banco', () => {
    const erro = { message: 'null value in column "nome"', details: 'Failing row contains (…)' };
    expect(mensagemDeErro(erro)).toBe('null value in column "nome" — Failing row contains (…)');
  });
});
