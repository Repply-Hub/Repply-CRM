import { describe, it, expect } from 'vitest';
import {
  antecedencia,
  assuntoDoEmail,
  htmlDoEmail,
  linkDaAgenda,
  mensagemDoSininho,
  textoDoChat,
  tituloDoSininho,
  type AvisoDeEvento,
  type DadosDoEvento,
  type TipoDeAviso,
} from '../../supabase/functions/_shared/aviso-de-evento';

// 16/09/2026 é quarta-feira; 17h UTC = 14h em São Paulo.
const BASE: DadosDoEvento = {
  titulo: 'Reunião com a Construtora Alfa',
  descricao: null,
  inicio: '2026-09-16T17:00:00.000Z',
  fim: '2026-09-16T18:00:00.000Z',
  dia_inteiro: false,
  inicio_antes: null,
  fim_antes: null,
  obra: null,
  organizador: 'Carlos Lima',
  participantes: ['Carlos Lima', 'Ana Souza'],
};
const aviso = (over: { tipo?: TipoDeAviso; minutos?: number | null; dados?: Partial<DadosDoEvento> } = {}): AvisoDeEvento => ({
  tipo: over.tipo ?? 'convite',
  minutos: over.minutos ?? null,
  dados: { ...BASE, ...(over.dados ?? {}) },
});

describe('textoDoChat', () => {
  it('convite traz o dia, a faixa de horário e a obra quando há', () => {
    expect(textoDoChat(aviso({ dados: { obra: 'Residencial Mar Azul' } }))).toBe(
      '📅 Convite automático: Reunião com a Construtora Alfa — quarta, 16/09, das 14:00 às 15:00. Obra: Residencial Mar Azul.',
    );
  });

  it('convite sem obra não fala de obra', () => {
    expect(textoDoChat(aviso())).toBe(
      '📅 Convite automático: Reunião com a Construtora Alfa — quarta, 16/09, das 14:00 às 15:00.',
    );
  });

  // Decisão do dono do produto (13/09/2026): "Avisa, mostrando início e fim" — mudar só o
  // horário de término (ou só o início, ou os dois) mostra a FAIXA inteira dos dois lados,
  // nunca só o ponto de início. O teste antigo ("mudança mostra o antes e o agora") cobria
  // só a mudança de início, mostrando um único horário de cada lado — foi substituído pelos
  // quatro casos abaixo, que é o que a revisão final pediu.
  it('alteração: só o fim mudou', () => {
    expect(
      textoDoChat(aviso({
        tipo: 'alteracao',
        dados: {
          fim: '2026-09-16T19:00:00.000Z',
          inicio_antes: '2026-09-16T17:00:00.000Z',
          fim_antes: '2026-09-16T18:00:00.000Z',
        },
      })),
    ).toBe('📅 Evento alterado: Reunião com a Construtora Alfa — era quarta, 16/09, das 14:00 às 15:00; agora é quarta, 16/09, das 14:00 às 16:00.');
  });

  it('alteração: só o início mudou', () => {
    expect(
      textoDoChat(aviso({
        tipo: 'alteracao',
        dados: {
          inicio: '2026-09-16T16:00:00.000Z',
          inicio_antes: '2026-09-16T17:00:00.000Z',
          fim_antes: '2026-09-16T18:00:00.000Z',
        },
      })),
    ).toBe('📅 Evento alterado: Reunião com a Construtora Alfa — era quarta, 16/09, das 14:00 às 15:00; agora é quarta, 16/09, das 13:00 às 15:00.');
  });

  it('alteração: início e fim mudaram', () => {
    expect(
      textoDoChat(aviso({
        tipo: 'alteracao',
        dados: {
          inicio: '2026-09-16T18:00:00.000Z',
          fim: '2026-09-16T19:30:00.000Z',
          inicio_antes: '2026-09-16T17:00:00.000Z',
          fim_antes: '2026-09-16T18:00:00.000Z',
        },
      })),
    ).toBe('📅 Evento alterado: Reunião com a Construtora Alfa — era quarta, 16/09, das 14:00 às 15:00; agora é quarta, 16/09, das 15:00 às 16:30.');
  });

  it('alteração: o fim passou para o dia seguinte — mostra o fim por extenso', () => {
    expect(
      textoDoChat(aviso({
        tipo: 'alteracao',
        dados: {
          fim: '2026-09-17T13:00:00.000Z',
          inicio_antes: '2026-09-16T17:00:00.000Z',
          fim_antes: '2026-09-16T18:00:00.000Z',
        },
      })),
    ).toBe('📅 Evento alterado: Reunião com a Construtora Alfa — era quarta, 16/09, das 14:00 às 15:00; agora é quarta, 16/09, às 14:00 até quinta, 17/09, às 10:00.');
  });

  it('cancelamento e retirada', () => {
    expect(textoDoChat(aviso({ tipo: 'cancelamento' }))).toBe(
      '📅 Evento cancelado: Reunião com a Construtora Alfa — quarta, 16/09, às 14:00.',
    );
    expect(textoDoChat(aviso({ tipo: 'retirado' }))).toBe(
      '📅 Evento cancelado para você: Reunião com a Construtora Alfa — quarta, 16/09, às 14:00.',
    );
  });

  it('lembrete diz quanto falta', () => {
    expect(textoDoChat(aviso({ tipo: 'lembrete', minutos: 60 }))).toBe(
      '🔔 Lembrete automático: Reunião com a Construtora Alfa começa em 1 hora (quarta, 16/09, às 14:00).',
    );
  });

  it('evento de dia inteiro diz "o dia todo"', () => {
    expect(textoDoChat(aviso({ dados: { dia_inteiro: true, inicio: '2026-09-16T03:00:00.000Z' } }))).toBe(
      '📅 Convite automático: Reunião com a Construtora Alfa — quarta, 16/09, o dia todo.',
    );
  });
});

describe('antecedencia', () => {
  it.each([
    [15, '15 minutos'], [1, '1 minuto'], [60, '1 hora'], [120, '2 horas'],
    [1440, '1 dia'], [2880, '2 dias'], [90, '90 minutos'],
  ])('%i → %s', (min, texto) => expect(antecedencia(min)).toBe(texto));
});

describe('sininho e assunto', () => {
  it('títulos do sininho', () => {
    expect(tituloDoSininho(aviso())).toBe('📅 Convite: Reunião com a Construtora Alfa');
    expect(tituloDoSininho(aviso({ tipo: 'lembrete', minutos: 60 }))).toBe('🔔 Lembrete: Reunião com a Construtora Alfa');
  });

  it('mensagem do sininho do lembrete', () => {
    expect(mensagemDoSininho(aviso({ tipo: 'lembrete', minutos: 1440 }))).toBe('Começa quarta, 16/09, às 14:00 (em 1 dia).');
  });

  it('mensagem do sininho de alteração mostra a faixa dos dois lados', () => {
    expect(
      mensagemDoSininho(aviso({
        tipo: 'alteracao',
        dados: {
          fim: '2026-09-16T19:00:00.000Z',
          inicio_antes: '2026-09-16T17:00:00.000Z',
          fim_antes: '2026-09-16T18:00:00.000Z',
        },
      })),
    ).toBe('Era quarta, 16/09, das 14:00 às 15:00; agora é quarta, 16/09, das 14:00 às 16:00.');
  });

  it('assunto do e-mail usa o dia curto', () => {
    expect(assuntoDoEmail(aviso())).toBe('Convite: Reunião com a Construtora Alfa — qua 16/09, 14:00');
    expect(assuntoDoEmail(aviso({ tipo: 'lembrete', minutos: 60 }))).toBe('Lembrete: Reunião com a Construtora Alfa — em 1 hora');
  });
});

describe('htmlDoEmail', () => {
  it('🔴 escapa o que vem de fora — título com "<" não quebra nem injeta HTML', () => {
    const html = htmlDoEmail(aviso({ dados: { titulo: 'A <b>&</b> B' } }), 'https://x/calendario?data=2026-09-16');
    expect(html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; B');
    expect(html).not.toContain('<b>&</b>');
  });

  it('traz o botão para a agenda e os participantes', () => {
    const html = htmlDoEmail(aviso(), 'https://crm.repplyhub.com.br/calendario?data=2026-09-16');
    expect(html).toContain('href="https://crm.repplyhub.com.br/calendario?data=2026-09-16"');
    expect(html).toContain('Abrir na agenda');
    expect(html).toContain('Ana Souza');
  });

  it('não diz "Bom dia" — o e-mail sai a qualquer hora', () => {
    expect(htmlDoEmail(aviso(), 'https://x')).not.toMatch(/bom dia/i);
  });

  it('alteração mostra a faixa dos dois lados (era riscado, agora normal)', () => {
    const html = htmlDoEmail(aviso({
      tipo: 'alteracao',
      dados: {
        fim: '2026-09-16T19:00:00.000Z',
        inicio_antes: '2026-09-16T17:00:00.000Z',
        fim_antes: '2026-09-16T18:00:00.000Z',
      },
    }), 'https://x');
    expect(html).toContain('quarta, 16/09, das 14:00 às 15:00'); // era
    expect(html).toContain('quarta, 16/09, das 14:00 às 16:00'); // agora
  });
});

describe('linkDaAgenda', () => {
  it('usa o dia em São Paulo, não em UTC', () => {
    // 01h UTC do dia 17 ainda é dia 16 em São Paulo.
    expect(linkDaAgenda('https://crm.repplyhub.com.br', '2026-09-17T01:00:00.000Z')).toBe(
      'https://crm.repplyhub.com.br/calendario?data=2026-09-16',
    );
  });
});
