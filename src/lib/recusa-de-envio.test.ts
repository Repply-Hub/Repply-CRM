import { describe, it, expect } from 'vitest';
import { mensagemDeRecusa, MOTIVOS_DE_RECUSA } from './recusa-de-envio';

/** 18:12 UTC = 15h12 em Brasília. O fuso é fixado na função — ver o comentário lá. */
const AS_15H12 = new Date('2026-08-26T18:12:00Z');

describe('mensagemDeRecusa — repetição', () => {
  it('começa pela boa notícia, não pelo bloqueio', () => {
    // Quem clica de novo quase sempre só não sabe se foi. A resposta que resolve o problema
    // dela é "já foi" — não "espere".
    const m = mensagemDeRecusa('repeticao', AS_15H12, 'João');
    expect(m.titulo).toBe('Já enviado');
  });

  it('diz para quem foi e a que horas libera', () => {
    const m = mensagemDeRecusa('repeticao', AS_15H12, 'João');
    expect(m.texto).toContain('João');
    expect(m.texto).toContain('15h12');
  });

  it('joga a espera no WhatsApp sem acusar quem clicou', () => {
    const m = mensagemDeRecusa('repeticao', AS_15H12, 'João');
    expect(m.texto).toContain('spam');
    expect(m.texto).not.toMatch(/você (já )?enviou/i);
  });

  it('é o único caso que oferece "ver na conversa"', () => {
    expect(mensagemDeRecusa('repeticao', AS_15H12, 'João').verNaConversa).toBe(true);
    expect(mensagemDeRecusa('teto_pessoa_hora', AS_15H12, 'João').verNaConversa).toBe(false);
  });

  it('não é erro vermelho', () => {
    // Vermelho faz a pessoa achar que quebrou — e quem acha que quebrou tenta de novo, que é
    // exatamente o comportamento que a trava existe para evitar.
    expect(mensagemDeRecusa('repeticao', AS_15H12, 'João').tom).toBe('neutro');
    expect(mensagemDeRecusa('teto_numero_hora', AS_15H12, 'João').tom).toBe('alerta');
  });
});

describe('mensagemDeRecusa — os tetos', () => {
  it('teto do número diz que é da EMPRESA, não da pessoa', () => {
    // Quem mandou dois e leva um "você atingiu seu limite" acha que é defeito e insiste.
    const m = mensagemDeRecusa('teto_numero_hora', AS_15H12, 'João');
    expect(m.texto).toContain('empresa');
    expect(m.texto).toContain('15h12');
    expect(m.texto).not.toMatch(/^Você/);
  });

  it('teto da pessoa diz que é dela', () => {
    expect(mensagemDeRecusa('teto_pessoa_hora', AS_15H12, 'João').texto).toContain('Você');
  });

  it('teto do dia não promete horário que não existe', () => {
    for (const mo of ['teto_pessoa_dia', 'teto_numero_dia'] as const) {
      const t = mensagemDeRecusa(mo, null, 'João').texto;
      expect(t).toContain('amanhã');
      expect(t).not.toContain('null');
      expect(t).not.toContain('Invalid');
      expect(t).not.toContain('NaN');
    }
  });
});

describe('mensagemDeRecusa — o que nenhuma mensagem pode fazer', () => {
  it('🔴 nenhuma afirma um número como sendo "o limite do WhatsApp"', () => {
    // A causa é do WhatsApp e é dita como tal; os números 10/40/150 são NOSSOS, de proteção.
    // Escrever "o limite do WhatsApp é 40 por hora" seria falso, e o primeiro representante
    // que pesquisasse passaria a desconfiar de todos os outros avisos do sistema.
    for (const mo of MOTIVOS_DE_RECUSA) {
      const t = mensagemDeRecusa(mo, AS_15H12, 'João').texto;
      expect(t).not.toMatch(/limite do WhatsApp/i);
      expect(t).not.toMatch(/WhatsApp (permite|deixa|libera) \d/i);
    }
  });

  it('toda recusa temporária diz QUANDO libera', () => {
    // Aviso sem horário é o que faz a pessoa continuar clicando.
    for (const mo of ['repeticao', 'teto_pessoa_hora', 'teto_numero_hora'] as const) {
      expect(mensagemDeRecusa(mo, AS_15H12, 'João').texto).toMatch(/\d{1,2}h\d{2}/);
    }
  });

  it('nenhuma volta vazia, nem para motivo desconhecido', () => {
    for (const mo of MOTIVOS_DE_RECUSA) {
      const m = mensagemDeRecusa(mo, AS_15H12, 'João');
      expect(m.titulo.length).toBeGreaterThan(3);
      expect(m.texto.length).toBeGreaterThan(20);
    }
    const desconhecido = mensagemDeRecusa('algo_que_nao_existe' as never, null, 'João');
    expect(desconhecido.texto.length).toBeGreaterThan(20);
  });
});

describe('mensagemDeRecusa — sem WhatsApp vinculado', () => {
  it('explica o que fazer, em vez de só recusar', () => {
    const m = mensagemDeRecusa('sem_instancia', null, 'João');
    expect(m.texto).toContain('gestor');
  });
});
