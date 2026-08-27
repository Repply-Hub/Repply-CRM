import { describe, it, expect } from 'vitest';
import {
  obraBateComBusca,
  filtrarObrasPorBusca,
  obraSemEnderecoNoMapa,
  filtrarSemEndereco,
  type ObraParaBusca,
} from './busca-de-obras';

/**
 * Obras no formato em que a MD cadastra: nome com acento, endereço de Natal, CNPJ da SPE
 * com máscara e o marcador que a tela de Obras usa para colorir o pino no mapa.
 */
const obraSaoJose: ObraParaBusca = {
  nome_obra: 'Residencial São José',
  spe_cnpj: '12.345.678/0001-90',
  endereco_entrega: 'Rua 25 de Março, 100 - Natal/RN',
  latitude: -5.79,
  longitude: -35.2,
  geocoded_at: '2026-08-20T13:00:00Z',
  clientes: { empresa: 'Construtora Alfa' },
  marcador: { nome: 'Em execução' },
};

const obraMirante: ObraParaBusca = {
  nome_obra: 'Edifício Mirante',
  spe_cnpj: '25.678.910/0001-45',
  endereco_entrega: 'Avenida Prudente de Morais, 500 - Natal/RN',
  latitude: -5.81,
  longitude: -35.21,
  geocoded_at: '2026-08-20T13:00:00Z',
  clientes: { empresa: 'Beta Engenharia' },
  marcador: { nome: 'Prospecção' },
};

describe('obraBateComBusca — os campos que passaram a entrar na busca', () => {
  it('acha pelo nome da obra', () => {
    expect(obraBateComBusca(obraSaoJose, 'residencial')).toBe(true);
  });

  it('acha por um pedaço no meio do nome, não só pelo começo', () => {
    expect(obraBateComBusca(obraMirante, 'difício')).toBe(true);
  });

  it('acha pelo endereço', () => {
    // O pedido do Lucas começou por aqui: "o endereço, o CNPJ, etc".
    expect(obraBateComBusca(obraMirante, 'prudente de morais')).toBe(true);
  });

  it('acha pelo nome do cliente', () => {
    expect(obraBateComBusca(obraSaoJose, 'construtora alfa')).toBe(true);
  });

  it('acha pelo nome do marcador', () => {
    expect(obraBateComBusca(obraMirante, 'prospecção')).toBe(true);
  });

  it('não acha o que não está em campo nenhum', () => {
    expect(obraBateComBusca(obraSaoJose, 'cimento')).toBe(false);
  });
});

describe('obraBateComBusca — o CNPJ, que é onde a busca quebrava', () => {
  it('acha colando o CNPJ com a pontuação, como está gravado', () => {
    expect(obraBateComBusca(obraSaoJose, '12.345.678/0001-90')).toBe(true);
  });

  it('acha digitando só os números', () => {
    // 🔴 O caso que texto cru errava: nada em '12.345.678/0001-90' contém '12345678000190'.
    expect(obraBateComBusca(obraSaoJose, '12345678000190')).toBe(true);
  });

  it('acha pelo fim do CNPJ, que é como se confere a filial', () => {
    expect(obraBateComBusca(obraSaoJose, '0001-90')).toBe(true);
  });

  it('acha pelo começo do CNPJ, digitado sem pontuação', () => {
    expect(obraBateComBusca(obraSaoJose, '12345')).toBe(true);
  });

  it('acha mesmo quando o banco guardou o CNPJ sem máscara e a pessoa colou com máscara', () => {
    // A limpeza vale para os dois lados, não só para o que a pessoa digita.
    const obraCnpjCru: ObraParaBusca = { ...obraSaoJose, spe_cnpj: '12345678000190' };
    expect(obraBateComBusca(obraCnpjCru, '12.345.678/0001-90')).toBe(true);
  });

  it('acha com espaço sobrando na ponta do que foi colado', () => {
    expect(obraBateComBusca(obraSaoJose, '  12345678000190  ')).toBe(true);
  });

  it('acha por texto no campo de CNPJ, que nem sempre guarda um CNPJ', () => {
    // 🔴 `spe_cnpj` é coluna de texto livre e veio de planilha: obra sem SPE aparece com
    // "Isento", "Obra própria", o nome da matriz. Sem o campo na passada de TEXTO, só a
    // comparação por dígitos sobraria — e ela ignora busca com letra, então esse cadastro
    // ficaria inacessível pelo campo que a pessoa está olhando na tela.
    const obraSemSpe: ObraParaBusca = { ...obraSaoJose, spe_cnpj: 'Isento — obra própria' };
    expect(obraBateComBusca(obraSemSpe, 'isento')).toBe(true);
  });
});

describe('obraBateComBusca — os falsos positivos que a limpeza de dígitos poderia criar', () => {
  it('"25100" não casa com o endereço "Rua 25 de Março, 100"', () => {
    // 🔴 Se limpássemos os dígitos do ENDEREÇO, estes dois números soltos virariam um só e a
    // obra apareceria numa busca que a pessoa nunca fez.
    expect(obraBateComBusca(obraSaoJose, '25100')).toBe(false);
  });

  it('"rua 25" não casa com o CNPJ que por acaso começa em 25', () => {
    // O CNPJ da Mirante é 25.678.910/0001-45. Como a busca tem letra, ela não entra na
    // comparação por dígitos — senão o "25" traria uma obra da avenida Prudente de Morais.
    expect(obraBateComBusca(obraMirante, 'rua 25')).toBe(false);
  });

  // Cadastro sem número nenhum fora do CNPJ: é ele que deixa a regra dos dígitos decidir
  // sozinha, sem o texto cru achar por acaso e mascarar o resultado.
  const obraSemNoveNoTexto: ObraParaBusca = {
    nome_obra: 'Obra Sem Número',
    spe_cnpj: '12.345.678/0001-90',
    endereco_entrega: 'Rua Sem Saída',
  };

  it('busca que sobra um dígito só não vira comparação por dígitos', () => {
    // '9-' não aparece no texto do CNPJ (lá está '-90'), então quem decide é a regra dos
    // dígitos. Sem o mínimo de 2, o '9' solto casaria com quase todo CNPJ cadastrado e a
    // busca devolveria a lista inteira em vez de filtrar.
    expect(obraBateComBusca(obraSemNoveNoTexto, '9-')).toBe(false);
  });

  it('dois dígitos JÁ bastam: o mínimo é 2, não 3', () => {
    // 🔴 O par que prova isto é '80', e só ele: '80' não existe no texto '12.345.678/0001-90'
    // (a barra separa o 8 do 0), só na versão limpa '12345678000190'. Conferir com '90' não
    // provaria regra nenhuma — '90' está literalmente no fim do CNPJ mascarado e acha pelo
    // texto cru. Sem esta asserção, subir o mínimo para 3 passaria despercebido e cortaria
    // em silêncio quem confere filial digitando dois dígitos.
    expect(obraBateComBusca(obraSemNoveNoTexto, '80')).toBe(true);
  });

  it('busca que começa em número e continua em letra não vira comparação por dígitos', () => {
    // 🔴 Quem segura isto é a âncora do FIM na regra dos dígitos. Sem ela, "25 de março" —
    // um endereço digitado como qualquer pessoa digita — leria o "25" da frente e traria o
    // Edifício Mirante, que só tem 25 no CNPJ e fica na avenida Prudente de Morais.
    expect(obraBateComBusca(obraMirante, '25 de março')).toBe(false);
  });

  it('CNPJ colado com espaço no lugar da pontuação ainda acha', () => {
    // O espaço é separador de máscara junto com ponto, barra e hífen — copiar CNPJ de PDF
    // ou de nota fiscal traz espaço no meio, e sem contá-lo a busca não acharia nada.
    expect(obraBateComBusca(obraSaoJose, '0001 90')).toBe(true);
    expect(obraBateComBusca(obraSaoJose, '12 345 678 0001 90')).toBe(true);
  });

  it('sequência de dígitos que não está no CNPJ continua não achando', () => {
    expect(obraBateComBusca(obraSaoJose, '99887766')).toBe(false);
  });
});

describe('obraBateComBusca — acento e caixa', () => {
  it('busca sem acento acha a obra com acento', () => {
    // 🔴 "Sao Jose" tem que achar "São José": ninguém digita acento na barra de busca.
    expect(obraBateComBusca(obraSaoJose, 'sao jose')).toBe(true);
  });

  it('busca com acento acha o cadastro que foi digitado sem acento', () => {
    const obraSemAcento: ObraParaBusca = { ...obraSaoJose, nome_obra: 'Residencial Sao Jose' };
    expect(obraBateComBusca(obraSemAcento, 'São José')).toBe(true);
  });

  it('acento também vale no endereço e no marcador', () => {
    expect(obraBateComBusca(obraSaoJose, 'marco')).toBe(true);
    expect(obraBateComBusca(obraSaoJose, 'em execucao')).toBe(true);
  });

  it('maiúscula não importa, nos dois sentidos', () => {
    expect(obraBateComBusca(obraSaoJose, 'RESIDENCIAL')).toBe(true);
    expect(obraBateComBusca({ nome_obra: 'GALPÃO NORTE' }, 'galpão')).toBe(true);
  });
});

describe('obraBateComBusca — busca vazia e campo faltando', () => {
  it('busca vazia acha tudo', () => {
    expect(obraBateComBusca(obraSaoJose, '')).toBe(true);
  });

  it('busca só com espaços acha tudo', () => {
    // A pessoa apagou o que digitou e sobrou um espaço: a tela volta ao repouso.
    expect(obraBateComBusca(obraSaoJose, '   ')).toBe(true);
  });

  it('obra com todos os campos nulos não explode e simplesmente não bate', () => {
    const obraVazia: ObraParaBusca = {
      nome_obra: null,
      spe_cnpj: null,
      endereco_entrega: null,
      latitude: null,
      longitude: null,
      geocoded_at: null,
      clientes: null,
      marcador: null,
    };
    expect(obraBateComBusca(obraVazia, 'qualquer coisa')).toBe(false);
    expect(obraBateComBusca(obraVazia, '12345')).toBe(false);
    expect(obraBateComBusca(obraVazia, '')).toBe(true);
  });

  it('obra sem nenhuma propriedade não explode', () => {
    expect(obraBateComBusca({}, 'alfa')).toBe(false);
  });

  it('obra nula não explode', () => {
    expect(obraBateComBusca(null as unknown as ObraParaBusca, 'alfa')).toBe(false);
  });

  it('busca vazia acha até a linha que veio quebrada da junção', () => {
    // 🔴 A ordem das duas guardas é o que se fixa aqui: a de busca vazia vem ANTES da de
    // obra nula. Trocadas, um buraco na lista passaria a decidir o resultado da tela em
    // repouso — e "acha tudo" deixaria de valer justamente para a linha defeituosa.
    expect(obraBateComBusca(null as unknown as ObraParaBusca, '')).toBe(true);
  });
});

describe('filtrarObrasPorBusca', () => {
  const lista = [obraSaoJose, obraMirante];

  it('devolve só as obras que batem', () => {
    expect(filtrarObrasPorBusca(lista, 'alfa')).toEqual([obraSaoJose]);
  });

  it('busca vazia devolve a lista inteira, nunca vazia', () => {
    // 🔴 O erro clássico do filtro: tratar termo vazio como "nada bate" e sumir com as 82
    // obras da MD assim que a pessoa limpa a busca.
    expect(filtrarObrasPorBusca(lista, '')).toHaveLength(2);
  });

  it('busca só com espaços devolve a lista inteira', () => {
    expect(filtrarObrasPorBusca(lista, '  ')).toHaveLength(2);
  });

  it('busca vazia devolve o MESMO array, não uma cópia', () => {
    // 🔴 A tela guarda o resultado num `useMemo`. Um array novo a cada render redesenha a
    // lista de obras e o mapa junto, sem nada ter mudado. Os dois testes de cima não veem
    // isso: `toHaveLength` dá o mesmo número para o array original e para uma cópia dele.
    expect(filtrarObrasPorBusca(lista, '')).toBe(lista);
    expect(filtrarObrasPorBusca(lista, '   ')).toBe(lista);
  });

  it('busca ainda não preenchida devolve a lista inteira, sem explodir', () => {
    // O estado da barra de busca nasce vazio e, com o TypeScript frouxo deste projeto,
    // chega aqui como undefined sem ninguém reclamar: um `busca.trim()` direto derrubaria
    // a tela de Obras inteira na primeira renderização.
    expect(filtrarObrasPorBusca(lista, undefined as unknown as string)).toBe(lista);
  });

  it('lista nula devolve lista vazia, sem explodir', () => {
    expect(filtrarObrasPorBusca(null, 'alfa')).toEqual([]);
    expect(filtrarObrasPorBusca(undefined, 'alfa')).toEqual([]);
  });

  it('buraco no meio da lista não derruba o filtro', () => {
    const comBuraco = [obraSaoJose, null as unknown as ObraParaBusca, obraMirante];
    expect(filtrarObrasPorBusca(comBuraco, 'natal')).toHaveLength(2);
  });

  it('preserva os campos extras da obra que veio do banco', () => {
    // O genérico existe para a tela continuar enxergando `id`, `marcador_id` e o resto.
    const comId = [{ ...obraSaoJose, id: 'obra-1' }];
    expect(filtrarObrasPorBusca(comId, 'sao jose')[0].id).toBe('obra-1');
  });
});

describe('obraBateComBusca — os campos personalizados da empresa', () => {
  const comExtras = {
    nome_obra: 'Residencial Marês',
    campos_extras: {
      numero_contrato: 'CT-2026-0042',
      responsavel_tecnico: 'Eng. Sofia Andrade',
      area_m2: 1850,
      // 🔴 O registro de migração que o SISTEMA grava — não é campo criado pela empresa.
      migracao: { cliente_origem_nome: 'Casapop Investimentos LTDA' },
    },
  };
  const CONFIGURADAS = ['numero_contrato', 'responsavel_tecnico', 'area_m2'];

  it('acha pelo campo personalizado que a empresa configurou', () => {
    expect(obraBateComBusca(comExtras, 'CT-2026-0042', CONFIGURADAS)).toBe(true);
    expect(obraBateComBusca(comExtras, 'sofia', CONFIGURADAS)).toBe(true);
  });

  it('valor numérico também acha', () => {
    // O formulário grava número quando o tipo do campo é numérico.
    expect(obraBateComBusca(comExtras, '1850', CONFIGURADAS)).toBe(true);
  });

  it('🔴 NÃO varre o que a empresa não configurou', () => {
    // `campos_extras` guarda também o registro de migração escrito pelo sistema. Medido em
    // 27/08/2026: 80 das 82 obras da MD têm isso, com o nome do cliente de ORIGEM do cadastro
    // lá dentro. Varrer tudo faria "Casapop" devolver obras que NÃO são da Casapop, e ainda
    // exporia anotação interna de migração como se fosse dado da obra.
    expect(obraBateComBusca(comExtras, 'casapop', CONFIGURADAS)).toBe(false);
  });

  it('sem lista de chaves, nenhum campo personalizado entra', () => {
    // É o estado de hoje: as 32 configurações de campo para obras são TODAS padrão, nenhuma
    // empresa criou campo personalizado ainda.
    expect(obraBateComBusca(comExtras, 'CT-2026-0042')).toBe(false);
    expect(obraBateComBusca(comExtras, 'CT-2026-0042', [])).toBe(false);
  });

  it('campo estruturado não é texto para procurar dentro', () => {
    // Objeto vira "[object Object]" e não casa com nada — que é o resultado certo.
    expect(obraBateComBusca(comExtras, 'object', ['migracao'])).toBe(false);
  });

  it('chave configurada que a obra não tem não quebra nada', () => {
    expect(obraBateComBusca(comExtras, 'marês', [...CONFIGURADAS, 'nao_existe'])).toBe(true);
  });

  it('obra sem campos_extras não quebra', () => {
    expect(obraBateComBusca({ nome_obra: 'Sem Extras' }, 'extras', CONFIGURADAS)).toBe(true);
    expect(
      obraBateComBusca({ nome_obra: 'Sem Extras', campos_extras: null }, 'zzz', CONFIGURADAS),
    ).toBe(false);
  });

  it('o filtro repassa as chaves para cada obra', () => {
    const r = filtrarObrasPorBusca([comExtras, { nome_obra: 'Outra' }], 'sofia', CONFIGURADAS);
    expect(r).toHaveLength(1);
    expect(r[0].nome_obra).toBe('Residencial Marês');
  });
});

describe('obraSemEnderecoNoMapa — "tentou e não achou" contra "ainda não tentou"', () => {
  it('é verdadeiro quando faltou a latitude e o serviço já tentou', () => {
    // O caso medido: 8 das 82 obras da MD estão assim.
    expect(obraSemEnderecoNoMapa({
      latitude: null, longitude: -35.2, geocoded_at: '2026-08-20T13:00:00Z',
    })).toBe(true);
  });

  it('é verdadeiro quando faltou a longitude', () => {
    expect(obraSemEnderecoNoMapa({
      latitude: -5.79, longitude: null, geocoded_at: '2026-08-20T13:00:00Z',
    })).toBe(true);
  });

  it('é falso quando a obra tem as duas coordenadas', () => {
    expect(obraSemEnderecoNoMapa(obraSaoJose)).toBe(false);
  });

  it('é falso quando o serviço ainda não tentou', () => {
    // 🔴 Sem carimbo é estado passageiro, não defeito. Acusar essa obra mandaria a pessoa
    // corrigir um endereço que pode estar perfeito.
    expect(obraSemEnderecoNoMapa({
      latitude: null, longitude: null, geocoded_at: null,
    })).toBe(false);
  });

  it('carimbo em branco também conta como "ainda não tentou"', () => {
    expect(obraSemEnderecoNoMapa({
      latitude: null, longitude: null, geocoded_at: '   ',
    })).toBe(false);
  });

  it('coordenada que nem veio na consulta conta como sem endereço', () => {
    // 🔴 `== null` pega o nulo E o ausente; `=== null` pegaria só o nulo. A consulta da tela
    // pode não trazer a coluna (ou o objeto vir de um formulário meio preenchido), e aí a
    // obra sem ponto no mapa sumiria do painel de pendências se passando por geocodificada.
    expect(obraSemEnderecoNoMapa({ geocoded_at: '2026-08-20T13:00:00Z' })).toBe(true);
    expect(obraSemEnderecoNoMapa({
      latitude: -5.79, geocoded_at: '2026-08-20T13:00:00Z',
    })).toBe(true);
  });

  it('latitude zero é coordenada de verdade, não campo vazio', () => {
    expect(obraSemEnderecoNoMapa({
      latitude: 0, longitude: 0, geocoded_at: '2026-08-20T13:00:00Z',
    })).toBe(false);
  });

  it('obra nula não explode', () => {
    expect(obraSemEnderecoNoMapa(null as unknown as ObraParaBusca)).toBe(false);
  });
});

describe('filtrarSemEndereco', () => {
  it('separa só as obras que o serviço tentou e não achou', () => {
    const lista: ObraParaBusca[] = [
      obraSaoJose,
      { nome_obra: 'Obra A', latitude: null, longitude: null, geocoded_at: '2026-08-20T13:00:00Z' },
      { nome_obra: 'Obra B', latitude: null, longitude: null, geocoded_at: null },
      { nome_obra: 'Obra C', latitude: -5.7, longitude: null, geocoded_at: '2026-08-20T13:00:00Z' },
    ];
    expect(filtrarSemEndereco(lista).map((o) => o.nome_obra)).toEqual(['Obra A', 'Obra C']);
  });

  it('lista nula devolve lista vazia, sem explodir', () => {
    expect(filtrarSemEndereco(null)).toEqual([]);
    expect(filtrarSemEndereco(undefined)).toEqual([]);
  });
});
