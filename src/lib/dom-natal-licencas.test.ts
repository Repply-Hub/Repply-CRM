import { describe, it, expect } from 'vitest';
import {
  segmentarBlocos,
  classificarTipoLicenca,
  pareceContextoNormativo,
  temSinalDePublicacaoReal,
  extrairPublicacoesDeLicenca,
} from './dom-natal-licencas';

// ── Falso positivo real ──────────────────────────────────────────────────────────
// Trecho literal da edição dom_20260831 (Fase 1). É uma PORTARIA que regulamenta laudos
// técnicos; a expressão "Licença de Operação" aparece como item de lista do art. 6º. NÃO é
// publicação de licença ambiental e não pode ser capturada.
const PORTARIA_NORMATIVA = `PORTARIA Nº 31/2026 – GS/SEMURB, DE 31 DE AGOSTO DE 2026.
Regulamenta a apresentação de laudos técnicos e dos registros fotográficos da vistoria em
substituição à realização de vistoria pela Secretaria Municipal de Meio Ambiente e Urbanismo
– SEMURB, nos casos previstos na Lei Complementar nº 258, de 28 de novembro de 2024
– Código de Obras e Edificações do Município do Natal, e dá outras providências.
O SECRETÁRIO MUNICIPAL DE MEIO AMBIENTE E URBANISMO, no uso das atribuições que
lhe confere a legislação municipal,
CONSIDERANDO o disposto na Lei Complementar nº 258, de 28 de novembro de 2024;
Art. 6º Os laudos técnicos poderão ser utilizados, entre outras hipóteses previstas na
legislação municipal, para instruir processos destinados à:
I – emissão de Certidão de Conclusão de Obras;
II – emissão de Licença de Operação;
III – emissão conjunta de Certidão de Conclusão de Obras e Licença de Operação;`;

const DISPENSA_LICITACAO = `AVISO DE DISPENSA DE LICITAÇÃO ELETRÔNICA Nº 12
A Secretaria Municipal do Trabalho e Assistência Social (SEMTAS), em cumprimento ao que
determina a Lei Federal n° 14.133/2021, art. 75, inciso II, torna público que pretende
realizar a coleta de propostas e lances para Dispensa Eletrônica a seguir especificada.`;

// ── Verdadeiros positivos sintéticos ─────────────────────────────────────────────
// Modelados na forma como aviso de licença ambiental é publicado no Brasil.
const AVISO_LP = `CONSTRUTORA HORIZONTE LTDA, CNPJ 12.345.678/0001-90, torna público que
REQUEREU à Secretaria Municipal de Meio Ambiente e Urbanismo – SEMURB a Licença Prévia (LP)
para a construção de um empreendimento residencial multifamiliar situado na Av. Litorânea,
s/n, Ponta Negra, Natal/RN. Processo nº SEMURB-20260812345.`;

const AVISO_LI = `RECEBEU da SEMURB a Licença de Instalação nº 045/2026 a empresa
INCORPORADORA DUNAS S.A., CNPJ 98.765.432/0001-10, para a implantação do loteamento
"Reserva das Dunas", com validade de 24 meses.`;

const AVISO_LO = `A empresa CERÂMICA POTIGUAR EIRELI, CNPJ 11.222.333/0001-44, torna público
que lhe foi concedida a Licença de Operação nº 128/2026 pela SEMURB para a atividade de
fabricação de artefatos cerâmicos, obra localizada no Distrito Industrial de Natal.`;

describe('classificarTipoLicenca', () => {
  it('reconhece cada tipo', () => {
    expect(classificarTipoLicenca(AVISO_LP)).toBe('Licença Prévia');
    expect(classificarTipoLicenca(AVISO_LI)).toBe('Licença de Instalação');
    expect(classificarTipoLicenca(AVISO_LO)).toBe('Licença de Operação');
  });

  it('não casa "LP" solto nem texto sem licença', () => {
    expect(classificarTipoLicenca('Servidor lotado no setor LP da secretaria.')).toBeNull();
    expect(classificarTipoLicenca(DISPENSA_LICITACAO)).toBeNull();
  });
});

describe('pareceContextoNormativo', () => {
  it('acusa a portaria regulamentar (falso positivo conhecido)', () => {
    expect(pareceContextoNormativo(PORTARIA_NORMATIVA)).toBe(true);
  });

  it('não acusa um aviso de requerimento de licença', () => {
    expect(pareceContextoNormativo(AVISO_LP)).toBe(false);
    expect(pareceContextoNormativo(AVISO_LI)).toBe(false);
    expect(pareceContextoNormativo(AVISO_LO)).toBe(false);
  });
});

describe('temSinalDePublicacaoReal', () => {
  it('aceita avisos com requerimento / concessão / número / CNPJ+obra', () => {
    expect(temSinalDePublicacaoReal(AVISO_LP)).toBe(true);
    expect(temSinalDePublicacaoReal(AVISO_LI)).toBe(true);
    expect(temSinalDePublicacaoReal(AVISO_LO)).toBe(true);
  });

  it('recusa a lista de hipóteses da portaria', () => {
    expect(temSinalDePublicacaoReal(PORTARIA_NORMATIVA)).toBe(false);
  });
});

describe('extrairPublicacoesDeLicenca', () => {
  it('rejeita a portaria normativa e não devolve nada', () => {
    expect(extrairPublicacoesDeLicenca(PORTARIA_NORMATIVA)).toEqual([]);
  });

  it('captura os três avisos verdadeiros quando estão no mesmo diário', () => {
    const edicao = [DISPENSA_LICITACAO, PORTARIA_NORMATIVA, AVISO_LP, AVISO_LI, AVISO_LO].join('\n\n');
    const achados = extrairPublicacoesDeLicenca(edicao);
    expect(achados.map((a) => a.tipo).sort()).toEqual([
      'Licença Prévia',
      'Licença de Instalação',
      'Licença de Operação',
    ].sort());
  });

  it('apara o texto em 2000 caracteres', () => {
    const grande = AVISO_LP + '\n' + 'x'.repeat(5000);
    const [achado] = extrairPublicacoesDeLicenca(grande);
    expect(achado.texto.length).toBeLessThanOrEqual(2000);
  });
});

describe('segmentarBlocos', () => {
  it('separa por parágrafo e por cabeçalho de ato em caixa alta', () => {
    const blocos = segmentarBlocos(`PORTARIA Nº 1/2026, DE 1 DE JANEIRO.\nNomeia fulano.\nAVISO DE LICITAÇÃO\nA secretaria comunica.`);
    expect(blocos.length).toBe(2);
    expect(blocos[0]).toContain('PORTARIA');
    expect(blocos[1]).toContain('AVISO DE LICITAÇÃO');
  });

  it('string vazia devolve lista vazia', () => {
    expect(segmentarBlocos('')).toEqual([]);
  });
});
