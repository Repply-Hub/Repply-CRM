import {
  formatarDigitacaoMoeda,
  formatarMoedaBRL,
  normalizarSeparadoresMoeda,
  numeroParaCampoMoeda,
  parseMoedaBRL,
} from './moeda';

/**
 * O contrato do dinheiro em pt-BR, contra os casos que já custaram caro.
 *
 * O caso que motivou tudo: um negócio real foi gravado como 106.387.320,00 no
 * lugar de 106.387,32 — exatamente mil vezes maior. Enquanto esteve assim,
 * inflou o total do funil, o faturamento do mês e o painel do vendedor, e nada
 * na tela indicava que havia algo errado. Outros dois negócios do mesmo dia
 * tinham o mesmo estrago (150.000.000,00 e 210.000.000,00).
 *
 * A causa é `parseFloat`, que lê no padrão americano e para no primeiro
 * caractere que não entende. Estes testes fixam o contrato do substituto: se um
 * dia alguém "simplificar" `parseMoedaBRL` de volta para `parseFloat`, o teste
 * do milhar cai antes de o erro chegar ao cliente.
 */

// O Intl separa "R$" do número com espaço não-separável (U+00A0), e o caractere
// muda conforme a versão do ICU. Comparar com espaço comum deixaria o teste
// quebrando por motivo errado.
const semNbsp = (s: string) => s.replace(/\u00A0/g, ' ');

describe('parseMoedaBRL', () => {
  it('O CASO REAL: 106.387,32 nunca pode virar 106387320', () => {
    expect(parseMoedaBRL('106.387,32')).toBe(106387.32);
    expect(parseMoedaBRL('106.387,32')).not.toBe(106387320);

    // Só para deixar registrado no teste o porquê da função existir: é isto que
    // o código antigo fazia com o mesmo texto.
    expect(parseFloat('106.387,32')).toBe(106.387);
  });

  it('valor com milhar', () => {
    expect(parseMoedaBRL('1.234')).toBe(1234);
    expect(parseMoedaBRL('99.888')).toBe(99888);
    expect(parseMoedaBRL('1.234.567')).toBe(1234567);
  });

  it('valor com centavos', () => {
    expect(parseMoedaBRL('1.234,56')).toBe(1234.56);
    expect(parseMoedaBRL('1234,56')).toBe(1234.56);
    expect(parseMoedaBRL('99.888,47')).toBe(99888.47);
    expect(parseMoedaBRL(',50')).toBe(0.5);
  });

  it('vazio devolve null, não zero — vazio é ausência de escolha', () => {
    expect(parseMoedaBRL('')).toBeNull();
    expect(parseMoedaBRL('   ')).toBeNull();
    expect(parseMoedaBRL('R$')).toBeNull();
    expect(parseMoedaBRL(',')).toBeNull();
  });

  it('zero é zero de verdade, não null', () => {
    expect(parseMoedaBRL('0')).toBe(0);
    expect(parseMoedaBRL('0,00')).toBe(0);
    // vírgula recém-digitada, ainda sem os centavos
    expect(parseMoedaBRL('0,')).toBe(0);
  });

  it('texto colado de fora: com R$, no padrão BR e no padrão EUA', () => {
    expect(parseMoedaBRL('R$ 1.234,56')).toBe(1234.56);
    expect(parseMoedaBRL('R$106.387,32')).toBe(106387.32);
    // planilha em inglês
    expect(parseMoedaBRL('1,234.56')).toBe(1234.56);
    expect(parseMoedaBRL('1234.56')).toBe(1234.56);
    expect(parseMoedaBRL('1,234,567.89')).toBe(1234567.89);
  });

  it('número grande: o teto de numeric(12,2) passa inteiro', () => {
    expect(parseMoedaBRL('9.999.999.999,99')).toBe(9999999999.99);
  });

  it('o sinal de menos é descartado — nenhum campo de dinheiro aceita negativo', () => {
    expect(parseMoedaBRL('-50')).toBe(50);
    expect(parseMoedaBRL('-1.234,56')).toBe(1234.56);
    // só quem pedir explicitamente recebe negativo
    expect(parseMoedaBRL('-50', 2, true)).toBe(-50);
  });

  it('corta o que passa das casas decimais permitidas', () => {
    expect(parseMoedaBRL('1,999')).toBe(1.99);
    // quantidade (itens_pedido.quantidade é numeric(10,3)): 1,5 m² é legítimo
    expect(parseMoedaBRL('1,5', 3)).toBe(1.5);
    expect(parseMoedaBRL('1,5678', 3)).toBe(1.567);
  });
});

describe('formatarDigitacaoMoeda', () => {
  it('põe o ponto de milhar enquanto se digita', () => {
    expect(formatarDigitacaoMoeda('99888')).toBe('99.888');
    expect(formatarDigitacaoMoeda('106387,32')).toBe('106.387,32');
    expect(formatarDigitacaoMoeda('1234567')).toBe('1.234.567');
  });

  it('na DIGITAÇÃO o ponto é sempre milhar, nunca centavo', () => {
    // Este é o ponto delicado: o texto que volta do campo já tem os pontos que
    // nós mesmos colocamos. Apagar o último dígito de "1.234" entrega "1.23" —
    // que é 123 e não "um vírgula vinte e três".
    expect(formatarDigitacaoMoeda('1.234')).toBe('1.234');
    expect(formatarDigitacaoMoeda('1.23')).toBe('123');
    expect(formatarDigitacaoMoeda('1.2')).toBe('12');
  });

  it('segura a vírgula recém-digitada, que ainda não vale nada como número', () => {
    expect(formatarDigitacaoMoeda('1234,')).toBe('1.234,');
    expect(formatarDigitacaoMoeda(',')).toBe('0,');
    expect(formatarDigitacaoMoeda(',5')).toBe('0,5');
  });

  it('vazio continua vazio (o campo não escreve "0" sozinho)', () => {
    expect(formatarDigitacaoMoeda('')).toBe('');
    expect(formatarDigitacaoMoeda('abc')).toBe('');
  });

  it('zero e zeros à esquerda', () => {
    expect(formatarDigitacaoMoeda('0')).toBe('0');
    expect(formatarDigitacaoMoeda('007')).toBe('7');
    expect(formatarDigitacaoMoeda('0,50')).toBe('0,50');
  });

  it('limita as casas decimais: 2 para dinheiro, 3 para quantidade', () => {
    expect(formatarDigitacaoMoeda('12345,678')).toBe('12.345,67');
    expect(formatarDigitacaoMoeda('12345,678', 3)).toBe('12.345,678');
  });

  it('letra, símbolo e sinal de menos não entram', () => {
    expect(formatarDigitacaoMoeda('1234abc')).toBe('1.234');
    expect(formatarDigitacaoMoeda('R$ 1234')).toBe('1.234');
    expect(formatarDigitacaoMoeda('-50')).toBe('50');
    expect(formatarDigitacaoMoeda('-50', 2, true)).toBe('-50');
  });

  it('número grande não perde dígito para arredondamento', () => {
    // O agrupamento é feito em texto justamente por isto: passar por `Number`
    // antes de formatar mostraria um valor que ninguém digitou.
    expect(formatarDigitacaoMoeda('99999999999999999999')).toBe('99.999.999.999.999.999.999');
  });
});

describe('numeroParaCampoMoeda', () => {
  it('número do banco vira o texto do campo', () => {
    expect(numeroParaCampoMoeda(99888.47)).toBe('99.888,47');
    expect(numeroParaCampoMoeda(106387.32)).toBe('106.387,32');
    expect(numeroParaCampoMoeda(1234)).toBe('1.234');
    expect(numeroParaCampoMoeda(1234.5)).toBe('1.234,5');
  });

  it('zero aparece; vazio e nulo não viram zero', () => {
    expect(numeroParaCampoMoeda(0)).toBe('0');
    expect(numeroParaCampoMoeda(null)).toBe('');
    expect(numeroParaCampoMoeda(undefined)).toBe('');
    expect(numeroParaCampoMoeda(NaN)).toBe('');
  });

  it('quantidade com três casas', () => {
    expect(numeroParaCampoMoeda(1234.567, 3)).toBe('1.234,567');
    expect(numeroParaCampoMoeda(1.5, 3)).toBe('1,5');
  });

  it('ida e volta: o número entra e sai igual', () => {
    // Esta é a garantia que impede o campo de brigar com quem está digitando:
    // o componente compara número com número para decidir se reescreve o texto.
    for (const n of [0, 1, 1234, 99888.47, 106387.32, 5640209.02, 9999999999.99]) {
      expect(parseMoedaBRL(numeroParaCampoMoeda(n))).toBe(n);
    }
  });
});

describe('normalizarSeparadoresMoeda', () => {
  it('com os dois separadores, o ÚLTIMO é o decimal', () => {
    expect(normalizarSeparadoresMoeda('1.234,56')).toBe('1234,56');
    expect(normalizarSeparadoresMoeda('1,234.56')).toBe('1234,56');
  });

  it('só com ponto, decide pelo tamanho do último grupo', () => {
    expect(normalizarSeparadoresMoeda('1234.56')).toBe('1234,56');
    expect(normalizarSeparadoresMoeda('1.234')).toBe('1234');
    expect(normalizarSeparadoresMoeda('1.234.567')).toBe('1234567');
  });

  it('joga fora o que não é número nem separador', () => {
    expect(normalizarSeparadoresMoeda('R$ 1.234,56')).toBe('1234,56');
    expect(normalizarSeparadoresMoeda('')).toBe('');
  });
});

describe('formatarMoedaBRL', () => {
  it('exibição com R$', () => {
    expect(semNbsp(formatarMoedaBRL(1234.56))).toBe('R$ 1.234,56');
    expect(semNbsp(formatarMoedaBRL(106387.32))).toBe('R$ 106.387,32');
    expect(semNbsp(formatarMoedaBRL(0))).toBe('R$ 0,00');
  });

  it('nulo vira R$ 0,00 — é o que as 26 cópias espalhadas já faziam', () => {
    expect(semNbsp(formatarMoedaBRL(null))).toBe('R$ 0,00');
    expect(semNbsp(formatarMoedaBRL(undefined))).toBe('R$ 0,00');
  });
});
