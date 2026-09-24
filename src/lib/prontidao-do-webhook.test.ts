import { describe, it, expect } from 'vitest';
import {
  prontidaoDaInstancia,
  podeLigarARecusa,
  type LinhaDeConferencia,
} from './prontidao-do-webhook';

/**
 * O QUE ESTE ARQUIVO PRENDE: a regra que autoriza — ou não — passar a RECUSAR quem chama o
 * webhook do WhatsApp sem segredo (item 16 da dívida técnica, etapa 3d do plano de blindagem).
 *
 * 🔴 POR QUE ISTO É CÓDIGO, E NÃO CRITÉRIO NA CABEÇA DE ALGUÉM. Ligar a recusa cedo demais faz
 * 100% das mensagens pararem de chegar EM SILÊNCIO, com a instância ainda aparecendo
 * "conectada" na tela. Já aconteceu neste sistema (`0715119`) e ninguém percebeu por dias.
 *
 * A armadilha mais fina está no caso "protegida e sem movimento": uma instância que tem segredo
 * configurado mas não recebeu NENHUM evento nas últimas 24h parece 100% em qualquer conta de
 * porcentagem — 0 de 0 é vacuamente perfeito. **Ausência de informação não é informação.**
 * Ela não autoriza nada, e é o caso que este arquivo existe para não deixar passar.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

function linha(extra: Partial<LinhaDeConferencia> = {}): LinhaDeConferencia {
  return {
    instancia_id: 'inst-1',
    instance_name: 'empresa01_abc123',
    empresa: 'Empresa Exemplo',
    status: 'connected',
    tem_segredo: true,
    eventos_24h: 100,
    com_segredo_24h: 100,
    conferem_24h: 100,
    ultimo_evento_em: '2026-09-23T12:00:00Z',
    ...extra,
  };
}

describe('prontidaoDaInstancia', () => {
  it('🔴 sem segredo configurado: aceita qualquer um — é o estado do item 16', () => {
    const p = prontidaoDaInstancia(linha({ tem_segredo: false, com_segredo_24h: 0, conferem_24h: 0 }));
    expect(p.estado).toBe('sem-segredo');
    expect(p.autorizaRecusa).toBe(false);
  });

  it('🔴 protegida e SEM MOVIMENTO não autoriza nada — 0 de 0 não é 100%', () => {
    const p = prontidaoDaInstancia(linha({ eventos_24h: 0, com_segredo_24h: 0, conferem_24h: 0 }));
    expect(p.estado).toBe('sem-movimento');
    expect(p.autorizaRecusa).toBe(false);
  });

  it('acabou de ser protegida, a operadora ainda não mandou nenhum com segredo', () => {
    const p = prontidaoDaInstancia(linha({ com_segredo_24h: 0, conferem_24h: 0 }));
    expect(p.estado).toBe('esperando');
    expect(p.autorizaRecusa).toBe(false);
  });

  it('🔴 parcial NÃO autoriza: um único evento sem segredo seria recusado de verdade', () => {
    const p = prontidaoDaInstancia(linha({ com_segredo_24h: 99, conferem_24h: 99 }));
    expect(p.estado).toBe('parcial');
    expect(p.autorizaRecusa).toBe(false);
    expect(p.porcentagem).toBe(99);
    expect(p.foraDaConta).toBe(1);
  });

  it('🔴 veio com segredo mas o segredo está ERRADO conta como parcial, não como pronto', () => {
    // `veio_com_segredo` mede presença; `confere` mede se bate. Olhar só a presença deixaria
    // passar o caso em que a operadora ficou com um segredo velho depois de uma rotação.
    const p = prontidaoDaInstancia(linha({ com_segredo_24h: 100, conferem_24h: 40 }));
    expect(p.estado).toBe('parcial');
    expect(p.autorizaRecusa).toBe(false);
    expect(p.porcentagem).toBe(40);
  });

  it('100% dos eventos conferem, com movimento de verdade: pronta', () => {
    const p = prontidaoDaInstancia(linha());
    expect(p.estado).toBe('pronta');
    expect(p.autorizaRecusa).toBe(true);
    expect(p.porcentagem).toBe(100);
  });

  it('🔴 sem senha E parada continua sendo "sem senha" — a falta de proteção vem antes da falta de medição', () => {
    // É a forma de 3 das 5 instâncias reais. Chamá-la de "sem movimento" esconderia o buraco
    // atrás de um estado que soa neutro.
    const p = prontidaoDaInstancia(
      linha({ tem_segredo: false, eventos_24h: 0, com_segredo_24h: 0, conferem_24h: 0 }),
    );
    expect(p.estado).toBe('sem-segredo');
    expect(p.autorizaRecusa).toBe(false);
  });

  it('🔴 um único evento fora da conta em milhares NÃO vira 100% — é o número que autoriza a chave', () => {
    // Com 5 mil eventos por dia, Math.round(4999/5000) daria 100% e liberaria a recusa com um
    // evento legítimo (ou um intruso) ainda fora da conta.
    const p = prontidaoDaInstancia(linha({ eventos_24h: 5000, com_segredo_24h: 4999, conferem_24h: 4999 }));
    expect(p.estado).toBe('parcial');
    expect(p.porcentagem).toBe(99);
    expect(p.foraDaConta).toBe(1);
    expect(p.autorizaRecusa).toBe(false);
    expect(p.texto).toContain('1 de 5000');
  });

  it('instância desconectada e parada não vira alarme — só não autoriza', () => {
    const p = prontidaoDaInstancia(
      linha({ status: 'disconnected', tem_segredo: true, eventos_24h: 0, com_segredo_24h: 0, conferem_24h: 0 }),
    );
    expect(p.estado).toBe('sem-movimento');
    expect(p.autorizaRecusa).toBe(false);
  });
});

describe('podeLigarARecusa', () => {
  it('🔴 só quando TODAS as instâncias autorizam — a recusa é do sistema, não de uma', () => {
    expect(podeLigarARecusa([linha(), linha({ instancia_id: 'inst-2' })]).pode).toBe(true);
  });

  it('🔴 uma instância sem senha derruba o conjunto, mesmo com as outras perfeitas', () => {
    const r = podeLigarARecusa([
      linha(),
      linha({ instancia_id: 'inst-2', instance_name: 'empresa02_xyz', tem_segredo: false, com_segredo_24h: 0, conferem_24h: 0 }),
    ]);
    expect(r.pode).toBe(false);
    expect(r.pendentes).toEqual(['empresa02_xyz']);
  });

  it('🔴 protegida mas parada NÃO trava o conjunto — senão o veredito nunca fica verde', () => {
    // Há instâncias desconectadas que não recebem evento há semanas. Se elas contassem como
    // pendência, a etapa final do plano seria inalcançável e a trava deixaria de proteger para
    // só emperrar. Elas saem da conta — mas aparecem nomeadas.
    const r = podeLigarARecusa([
      linha(),
      linha({ instancia_id: 'inst-2', instance_name: 'empresa02_xyz', eventos_24h: 0, com_segredo_24h: 0, conferem_24h: 0 }),
    ]);
    expect(r.pode).toBe(true);
    expect(r.pendentes).toEqual([]);
    expect(r.naoMedidas).toEqual(['empresa02_xyz']);
  });

  it('🔴 TODAS paradas não autoriza — é falta de medição, não confirmação', () => {
    const parada = { eventos_24h: 0, com_segredo_24h: 0, conferem_24h: 0 };
    const r = podeLigarARecusa([
      linha({ ...parada }),
      linha({ instancia_id: 'inst-2', instance_name: 'empresa02_xyz', ...parada }),
    ]);
    expect(r.pode).toBe(false);
    expect(r.naoMedidas).toHaveLength(2);
  });

  it('🔴 lista vazia NÃO autoriza — nenhuma instância medida não é nenhuma pendência', () => {
    expect(podeLigarARecusa([]).pode).toBe(false);
  });
});
