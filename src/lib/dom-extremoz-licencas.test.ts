import { describe, it, expect, vi } from 'vitest';
import {
  parseDataEdicao,
  classificarTipoLicenca,
  pareceContextoNormativo,
  extrairFaseObra,
  extrairObraDescricao,
  ehPublicacaoRelevante,
  blocosCandidatos,
  extrairPublicacoesDeLicenca,
} from './dom-extremoz-licencas';

// ── Falsos positivos ────────────────────────────────────────────────────────────
const PORTARIA_NORMATIVA = `PORTARIA Nº 45/2026 – SEMURB, DE 12 DE AGOSTO DE 2026.
Regulamenta o procedimento de emissão de Licença de Operação para empreendimentos de
baixo impacto e dá outras providências.
CONSIDERANDO o disposto na legislação municipal;
Art. 3º Para instruir processos destinados à emissão de Licença de Operação, o interessado
deverá apresentar laudo técnico.`;

const AVISO_LICITACAO = `AVISO DE LICITAÇÃO — PREGÃO ELETRÔNICO Nº 021/2026
A Prefeitura Municipal de Extremoz torna público que realizará licitação para aquisição de
material de expediente. Edital disponível no portal da transparência.`;

// ── Verdadeiros positivos (modelados na forma de aviso de licença ambiental) ─────
const AVISO_LP = `CONSTRUTORA POTIGUAR LTDA, CNPJ 12.345.678/0001-90, torna público que
REQUEREU à Secretaria Municipal de Meio Ambiente de Extremoz a Licença Prévia (LP) para a
CONSTRUÇÃO de um empreendimento residencial multifamiliar, localizado na Av. Litorânea, s/n,
Praia de Genipabu, Extremoz/RN. Contato: engenharia@construtorapotiguar.com.br`;

const AVISO_LI = `A empresa INCORPORADORA DUNAS S.A., CNPJ 98.765.432/0001-10, torna público
que RECEBEU da Prefeitura de Extremoz a Licença de Instalação nº 045/2026 para a implantação
do loteamento "Reserva das Dunas", fase de instalação da infraestrutura.`;

const AVISO_LO = `CERÂMICA EXTREMOZ EIRELI, CNPJ 11.222.333/0001-44, torna público que lhe foi
concedida a Licença de Operação nº 128/2026 para a atividade de fabricação de telhas, obra
localizada na Rodovia RN-160, km 4, Extremoz/RN.`;

// ── Trechos LITERAIS de diários de Extremoz (amostra out/2025–ago/2026) ─────────
// O caso do enunciado — Barreto Junior (grafia sem acento no PDF: "REGULARIZACAO").
const LRO_BARRETO = `PEDIDO DE LICENÇA REGULARIZACAO DE OPERAÇÃO. A empresa BARRETO JUNIOR
CONSTRUÇÕES LTDA inscrita no CNPJ sob o nº 20.966.042/0001-99, torna público que está
requerendo a Secretaria Municipal de Meio Ambiente e Urbanismo – SEMUR de Extremoz a LICENÇA
REGULARIZACAO DE OPERAÇÃO para o escritório sede da empresa implantado na Avenida Alcides de
Araújo, 1001 – Moinho dos Ventos – Extremoz/RN. Mercílio Aparecido Martins de Lima Sócio`;

// 13/07/2026 — Henrique Vital Filho ("LICENÇA DE REGULARIZAÇÃO DE OPERAÇÃO – LRO").
const LRO_HENRIQUE = `PEDIDO DE LICENÇA DE REGULARIZAÇÃO DE OPERAÇÃO - LRO
HENRIQUE VITAL FILHO – CNPJ/CPF nº. 074.836.514-15, torna público que RECEBEU da Secretaria
Municipal de Meio Ambiente e Urbanismo – SEMUR a LICENÇA DE REGULARIZAÇÃO DE OPERAÇÃO – LRO
para a construção de empreendimento ESTACIONAMENTO COM ATÉ TOTAL DE 1.879,50M², COM 40 VAGAS,
a ser implantado na RUA Projetada, Extremoz/RN.`;

// 27/11/2025 — SINDSAUDE ("LICENÇA DE REGULARIZAÇÃO DE OPERAÇÃO (LRO)").
const LRO_SINDSAUDE = `LICENÇA DE REGULARIZAÇÃO DE OPERAÇÃO (LRO)
SINDICATO DOS TRABALHADORES DA SAÚDE DO RN (SINDSAUDE) – CNPJ: 24.518.060/0001-69, torna
público que recebeu da Secretaria Municipal de Meio Ambiente e Urbanismo – SEMUR a Licença
de Regularização de Operação, para a sede administrativa localizada em Extremoz/RN.`;

// 04/12/2025 — Comercial Paiva Flor ("licença operacional (LO)", sinônimo de "de operação").
const RENOV_OPERACIONAL = `COMERCIAL PAIVA FLOR LTDA. – CNPJ nº. 16.783.593/0001-40, torna
público que estar requerendo da Secretaria Municipal de Meio Ambiente e Urbanismo – SEMUR a
renovação da licença operacional (LO) de um posto de revenda de combustíveis, localizado na
Rua Joaquin de Gois, nº 7, Bairro Central Parque II - Extremoz/RN.`;

// 13/10/2025 — Madeireira Mãe Rainha ("Renovação da Licença de Operação"): formato DIRETO,
// já funcionava. Fica como guarda de regressão.
const RENOV_LO_DIRETA = `A MADEIREIRA MÃE RAINHA EIRELI - ME, CNPJ: 23.321.091/0001-62, torna
público que recebeu da Secretaria Municipal de Meio Ambiente e Urbanismo de EXTREMOZ/RN
Renovação da Licença de Operação, para as Atividades de Comercialização de Madeiras, sem
beneficiamento, localizada na Rua Pedro Vasconcelos (RN 160), nº 194, Centro, Extremoz/RN.`;

// 10/10/2025 — CNV Empreendimentos ("Licença Simplificada"): FORA do escopo LP/LI/LO.
// Continua não classificado — é o achado a levar ao Lucas, não um bug deste fix.
const LS_SIMPLIFICADA = `PEDIDO DE LICENÇA SIMPLIFICADA (LS)
CNV EMPREENDIMENTOS IMOBILIÁRIOS LTDA – CNPJ:11.921.552/0001-59, torna público que estar
requerendo a Secretaria Municipal de Meio Ambiente, Urbanismo e Mudanças Climáticas – SEMUR
do município de Extremoz/RN, a Licença Simplificada para a CONSTRUÇÃO DE UM EMPREENDIMENTO
RESIDENCIAL com 64 unidades habitacionais, localizado na Rua da Mata, Extremoz/RN.`;

describe('parseDataEdicao', () => {
  it('lê o nome de arquivo padrão da listagem de Extremoz', () => {
    expect(
      parseDataEdicao('https://extremoz.rn.gov.br/wp-content/uploads/2026/08/31-de-Agosto-de-2026.pdf'),
    ).toBe('2026-08-31');
    expect(
      parseDataEdicao('https://extremoz.rn.gov.br/wp-content/uploads/2025/12/2-de-Dezembro-de-2025.doc.pdf'),
    ).toBe('2025-12-02');
  });

  it('aceita ISO e DD/MM/AAAA literais', () => {
    expect(parseDataEdicao('edicao 2026-03-15 extra')).toBe('2026-03-15');
    expect(parseDataEdicao('Diário de 15/03/2026')).toBe('2026-03-15');
  });

  it('devolve null quando não há dia reconhecível', () => {
    expect(parseDataEdicao('Edicao-Extraordinaria-Semana-Santa.pdf')).toBeNull();
    expect(parseDataEdicao('')).toBeNull();
  });
});

describe('classificarTipoLicenca', () => {
  it('reconhece cada tipo pela frase', () => {
    expect(classificarTipoLicenca(AVISO_LP)).toBe('Licença Prévia');
    expect(classificarTipoLicenca(AVISO_LI)).toBe('Licença de Instalação');
    expect(classificarTipoLicenca(AVISO_LO)).toBe('Licença de Operação');
  });

  it('aceita a sigla só com "licença" no bloco', () => {
    expect(classificarTipoLicenca('requereu a Licença ambiental - LP para a obra')).toBe('Licença Prévia');
    expect(classificarTipoLicenca('o servidor lotado no setor LP compareceu')).toBeNull();
  });

  it('não casa texto sem licença', () => {
    expect(classificarTipoLicenca(AVISO_LICITACAO)).toBeNull();
  });

  // ── Regressão: variantes reais de fraseado do diário de Extremoz ──────────────
  it('classifica "licença [de] regularização de operação" (LRO) como Licença de Operação', () => {
    expect(classificarTipoLicenca(LRO_BARRETO)).toBe('Licença de Operação');
    expect(classificarTipoLicenca(LRO_HENRIQUE)).toBe('Licença de Operação');
    expect(classificarTipoLicenca(LRO_SINDSAUDE)).toBe('Licença de Operação');
  });

  it('classifica "licença de regularização de instalação" (LRI) como Licença de Instalação', () => {
    expect(
      classificarTipoLicenca('a empresa X torna público que requereu a Licença de Regularização de Instalação para o galpão'),
    ).toBe('Licença de Instalação');
  });

  it('classifica "licença operacional" como Licença de Operação (sinônimo de "de operação")', () => {
    expect(classificarTipoLicenca(RENOV_OPERACIONAL)).toBe('Licença de Operação');
  });

  it('mantém os formatos diretos que já funcionavam', () => {
    expect(classificarTipoLicenca(RENOV_LO_DIRETA)).toBe('Licença de Operação');
    expect(classificarTipoLicenca('SEMUR a Licença Prévia (LP) para um Posto Revendedor')).toBe('Licença Prévia');
    expect(classificarTipoLicenca('renovação da Licença de Instalação e Operação, n° 3.721/2025')).toBe('Licença de Instalação');
  });

  it('"licença de regularização" sem tipo explícito não classifica, mas loga para revisão', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(classificarTipoLicenca('a empresa requereu uma Licença de Regularização junto à SEMUR')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('NÃO classifica "Licença Simplificada (LS)" — outro tipo, fora do escopo LP/LI/LO', () => {
    expect(classificarTipoLicenca(LS_SIMPLIFICADA)).toBeNull();
  });
});

describe('pareceContextoNormativo', () => {
  it('acusa a portaria que regulamenta a emissão de licença', () => {
    expect(pareceContextoNormativo(PORTARIA_NORMATIVA)).toBe(true);
  });

  it('não acusa um aviso de requerimento', () => {
    expect(pareceContextoNormativo(AVISO_LP)).toBe(false);
    expect(pareceContextoNormativo(AVISO_LI)).toBe(false);
  });
});

describe('extração de campos', () => {
  it('pega a fase da obra e a descrição', () => {
    expect(extrairFaseObra(AVISO_LI)).not.toBe('');
    expect(extrairFaseObra(AVISO_LI).toLowerCase()).toMatch(/implanta|instala/);
    expect(extrairObraDescricao(AVISO_LP).toLowerCase()).toContain('constru');
  });
});

describe('ehPublicacaoRelevante', () => {
  it('exige tipo + ao menos um campo útil', () => {
    expect(
      ehPublicacaoRelevante({
        tipo: 'Licença Prévia', prioridade: '', cnpj: '12.345.678/0001-90', razaoSocial: '',
        nomeFantasia: '', telefone: '', email: '', enderecoEmpresa: '', quadroSocietario: '',
        obraDescricao: '', texto: 'x',
      }),
    ).toBe(true);
    expect(
      ehPublicacaoRelevante({
        tipo: 'Licença Prévia', prioridade: '', cnpj: '', razaoSocial: '', nomeFantasia: '',
        telefone: '', email: '', enderecoEmpresa: '', quadroSocietario: '', obraDescricao: '', texto: 'x',
      }),
    ).toBe(false);
  });
});

describe('blocosCandidatos', () => {
  it('separa avisos por parágrafo', () => {
    const texto = `${AVISO_LP}\n\n${AVISO_LO}`;
    const blocos = blocosCandidatos(texto);
    expect(blocos.length).toBe(2);
  });

  it('PDF grande sem quebras cai para janelas de CNPJ', () => {
    const semQuebras = `${AVISO_LP} ${'palavra '.repeat(400)} ${AVISO_LO}`.replace(/\n/g, ' ');
    const blocos = blocosCandidatos(semQuebras);
    expect(blocos.length).toBe(2);
  });

  it('texto curto sem parágrafo devolve um bloco só', () => {
    const blocos = blocosCandidatos('texto curto sem documento algum');
    expect(blocos).toEqual(['texto curto sem documento algum']);
  });

  it('string vazia devolve lista vazia', () => {
    expect(blocosCandidatos('')).toEqual([]);
  });
});

describe('extrairPublicacoesDeLicenca', () => {
  it('rejeita a portaria normativa e o aviso de licitação', () => {
    const edicao = [AVISO_LICITACAO, PORTARIA_NORMATIVA].join('\n\n');
    expect(extrairPublicacoesDeLicenca(edicao)).toEqual([]);
  });

  it('captura os três avisos verdadeiros na mesma edição', () => {
    const edicao = [AVISO_LICITACAO, PORTARIA_NORMATIVA, AVISO_LP, AVISO_LI, AVISO_LO].join('\n\n');
    const achados = extrairPublicacoesDeLicenca(edicao);
    expect(achados.map((a) => a.tipo).sort()).toEqual(
      ['Licença Prévia', 'Licença de Instalação', 'Licença de Operação'].sort(),
    );
    const lp = achados.find((a) => a.tipo === 'Licença Prévia')!;
    expect(lp.cnpj).toBe('12.345.678/0001-90');
    expect(lp.email).toBe('engenharia@construtorapotiguar.com.br');
    expect(lp.razaoSocial).toContain('CONSTRUTORA POTIGUAR');
  });

  it('apara o texto do bloco em 2000 caracteres', () => {
    const grande = `${AVISO_LP}\n${'x'.repeat(5000)}`;
    const [achado] = extrairPublicacoesDeLicenca(grande);
    expect(achado.texto.length).toBeLessThanOrEqual(2000);
  });

  it('não repete a mesma publicação', () => {
    const edicao = [AVISO_LO, AVISO_LO].join('\n\n');
    expect(extrairPublicacoesDeLicenca(edicao).length).toBe(1);
  });

  it('captura o pedido de regularização de operação do enunciado (Barreto Junior)', () => {
    const achados = extrairPublicacoesDeLicenca(LRO_BARRETO);
    expect(achados).toHaveLength(1);
    expect(achados[0].tipo).toBe('Licença de Operação');
    expect(achados[0].cnpj).toBe('20.966.042/0001-99');
    expect(achados[0].texto).toContain('REGULARIZACAO');
  });

  it('captura LRO junto de outros avisos numa edição real', () => {
    const edicao = [LS_SIMPLIFICADA, LRO_HENRIQUE, RENOV_LO_DIRETA].join('\n\n');
    const tipos = extrairPublicacoesDeLicenca(edicao).map((a) => a.tipo);
    // LRO_HENRIQUE + RENOV_LO_DIRETA = 2x LO; LS fica de fora (fora do escopo).
    expect(tipos).toEqual(['Licença de Operação', 'Licença de Operação']);
  });
});
