import { describe, it, expect } from 'vitest';
import {
  assuntoDaPauta,
  assuntoDoPulso,
  diasParadoPorEmpresa,
  montarEmail,
  montarPulsoDaEquipe,
  type ItemDaPauta,
  type NegocioDaEquipe,
} from '../../supabase/functions/pauta-resumo-diario/corpo';
import { vozDaPauta } from './voz-da-pauta';

/**
 * O e-mail das 7h, conferido SEM DISPARAR ENVIO — há gente de verdade do outro lado.
 *
 * Este arquivo importa o mesmo módulo que o servidor executa (`corpo.ts`, dentro da função de
 * borda), monta o HTML com dados de mentira e lê o texto que sairia. É o caminho que
 * `src/lib/erro-do-provedor-de-email.test.ts` já usa com `_shared/nylas.ts`.
 *
 * Nomes e valores aqui são INVENTADOS: o repositório é público (CLAUDE.md §6.9).
 *
 * O que ele prende:
 *   · o pulso da equipe usa `total_geral`/`valor_geral` — o recorte INTEIRO —, e não as 5
 *     linhas que ele leu. Somar as 5 daria um número muito menor e ninguém perceberia;
 *   · `esc()` em tudo que vem do banco (CLAUDE.md: nome de cliente com `<` ou `&`);
 *   · o botão leva à tabela do time, não a "minha pauta" — que está vazia, e é por isso que
 *     este e-mail existe;
 *   · a fila pessoal fala com a voz da pauta — a MESMA frase da tela "Hoje" —, medindo "parado"
 *     com o ajuste da empresa de quem recebe.
 */

const LINK = 'https://crm.repplyhub.com.br/hoje';

const negocio = (over: Partial<NegocioDaEquipe> = {}): NegocioDaEquipe => ({
  id: 'id-1',
  nome: 'Obra do Porto',
  fabrica: 'Marca A',
  etapa: 'Negociação',
  responsavel: 'Vendedora Um',
  valor: 180000,
  dias_parado: 40,
  total_geral: 128,
  valor_geral: 6500000,
  ...over,
});

/** Só o texto: tira as etiquetas e junta os espaços, para conferir a frase e não o HTML. */
const texto = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// O `Intl` separa "R$" do número com um espaço INQUEBRÁVEL (U+00A0). `texto()` já o troca por
// espaço comum; o assunto não passa por ele. Escrito por código, e não colado: o caractere
// invisível dentro do fonte reprova no lint (`no-irregular-whitespace`).
const semNbsp = (s: string) => s.split(String.fromCharCode(0xa0)).join(' ');

/** Parágrafo sem texto nenhum dentro — o buraco que a linha de baixo vazia deixava. */
const PARAGRAFO_VAZIO = /<p[^>]*>\s*<\/p>/;

describe('pulso da equipe — o e-mail de quem tem a chave e ficou sem negócio próprio', () => {
  const cinco = [
    negocio({ id: '1', nome: 'Obra Exemplo | Fabricante Exemplo', valor: 180000, dias_parado: 40, responsavel: 'Ana Souza' }),
    negocio({ id: '2', nome: 'Obra Modelo | Marca B', valor: 150000, dias_parado: 32, responsavel: 'Vendedor Dois' }),
    negocio({ id: '3', nome: 'Construtora Exemplo', valor: 120000, dias_parado: 9, responsavel: 'Vendedora Três' }),
    negocio({ id: '4', nome: 'Residencial Modelo', valor: 90000, dias_parado: 3, responsavel: 'Vendedor Quatro' }),
    negocio({ id: '5', nome: 'Condomínio Exemplo', valor: 50000, dias_parado: 1, responsavel: 'Vendedora Cinco' }),
  ];

  it('o assunto conta o recorte inteiro, não as 5 linhas lidas', () => {
    expect(assuntoDoPulso(cinco)).toBe('128 negócios da equipe pedem atenção');
  });

  it('a manchete traz o dinheiro do recorte inteiro, e a linha de baixo a contagem', () => {
    const t = texto(montarPulsoDaEquipe('Carla Dias', cinco, LINK));
    expect(t).toContain('Bom dia, Carla.');
    expect(t).toContain('R$ 6.500.000 pedem atenção');
    expect(t).toContain('em 128 negócios da equipe');
    // A soma das 5 linhas é R$ 590.000. Se algum dia alguém trocar `valor_geral` por um
    // `reduce` das linhas, é este número que vai aparecer — e o teste quebra.
    expect(t).not.toContain('590.000');
  });

  it('cada linha traz nome, dono, etapa, valor e dias sem mexer', () => {
    const t = texto(montarPulsoDaEquipe('Carla', cinco, LINK));
    expect(t).toContain('Obra Exemplo | Fabricante Exemplo');
    expect(t).toContain('Ana Souza · Negociação · sem mexer há 40 dias');
    expect(t).toContain('R$ 180.000');
    expect(t).toContain('Vendedor Dois · Negociação · sem mexer há 32 dias');
  });

  it('mostra as 5 linhas recebidas e nada além disso', () => {
    const html = montarPulsoDaEquipe('Carla', cinco, LINK);
    expect(html.match(/Pede atenção/g)).toHaveLength(5);
  });

  it('o botão leva à tabela do time, e não a "minha pauta" — que está vazia', () => {
    const html = montarPulsoDaEquipe('Carla', cinco, LINK);
    expect(html).toContain('Ver a tabela do time');
    expect(html).not.toContain('Abrir minha pauta');
    expect(html).toContain(`href="${LINK}"`);
    expect(html).not.toContain('{{PAUTA_');
  });

  it('o rodapé aponta para a tabela do time, não para a pauta vazia', () => {
    const t = texto(montarPulsoDaEquipe('Carla', cinco, LINK));
    expect(t).toContain('É a mesma tabela do time que aparece na tela "Hoje".');
    expect(t).not.toContain('É a mesma pauta que aparece');
  });

  it('escapa o que vem do banco — nome de negócio e de pessoa podem ter < ou &', () => {
    const html = montarPulsoDaEquipe(
      'Fulana & Cia',
      [negocio({ nome: 'Obra <b>Norte</b> & Sul', responsavel: 'Alves & Filhos', etapa: 'Pré-venda' })],
      LINK,
    );
    expect(html).toContain('Obra &lt;b&gt;Norte&lt;/b&gt; &amp; Sul');
    expect(html).toContain('Alves &amp; Filhos');
    expect(html).toContain('Bom dia, Fulana.');
    // Nenhuma etiqueta veio do dado: o `<b>` do nome não pode virar negrito no e-mail.
    expect(html).not.toContain('<b>Norte</b>');
  });

  it('cifrão no nome não faz o marcador reaparecer no meio do e-mail', () => {
    // `replaceAll(alvo, texto)` interpreta `$&` como "o trecho casado". Com o nome vindo do
    // banco, um negócio chamado assim reescrevia o próprio marcador dentro do e-mail. Ver o
    // comentário de `preencher` em `corpo.ts`.
    const t = texto(montarPulsoDaEquipe('Carla', [negocio({ nome: 'Obra $& Cia' })], LINK));
    expect(t).toContain('Obra $&amp; Cia');
    expect(t).not.toContain('ITEM_TITULO');
  });

  it('singular: um negócio só pede atenção, não pedem', () => {
    const um = [negocio({ total_geral: 1, valor_geral: 180000 })];
    expect(assuntoDoPulso(um)).toBe('1 negócio da equipe pede atenção');
    expect(texto(montarPulsoDaEquipe('Carla', um, LINK))).toContain('em 1 negócio da equipe');
  });

  it('sem valor somado, a manchete vira a contagem — nunca "R$ 0 pedem atenção"', () => {
    const semValor = [negocio({ valor: null, valor_geral: 0, total_geral: 12 })];
    const t = texto(montarPulsoDaEquipe('Carla', semValor, LINK));
    expect(t).toContain('12 negócios da equipe pedem atenção');
    expect(t).not.toContain('R$ 0');
  });

  it('sem valor somado, a linha de baixo some inteira — o modelo é o mesmo da fila pessoal', () => {
    const semValor = [negocio({ valor: null, valor_geral: 0, total_geral: 12 })];
    expect(montarPulsoDaEquipe('Carla', semValor, LINK)).not.toMatch(PARAGRAFO_VAZIO);
  });

  it('com valor somado, a contagem continua dentro do parágrafo dela', () => {
    // O outro lado da troca de cima: a linha de baixo passou a só existir quando tem texto, e
    // o pulso não pode perder o parágrafo — nem o estilo dele — quando a linha existe.
    expect(montarPulsoDaEquipe('Carla', cinco, LINK)).toMatch(/<p[^>]*>\s*em 128 negócios da equipe\s*<\/p>/);
  });

  it('sem mexer há 0 dias não é frase — some, e o resto da linha fica', () => {
    const hoje = [negocio({ dias_parado: 0, responsavel: 'Vendedor X', etapa: 'Proposta' })];
    const t = texto(montarPulsoDaEquipe('Carla', hoje, LINK));
    expect(t).toContain('Vendedor X · Proposta');
    expect(t).not.toContain('sem mexer há 0');
  });

  it('linha sem dono, sem etapa e sem dias não fica muda', () => {
    const orfao = [negocio({ responsavel: null, etapa: null, dias_parado: null })];
    expect(texto(montarPulsoDaEquipe('Carla', orfao, LINK))).toContain('Negócio da equipe');
  });

  it('dia único no singular', () => {
    const t = texto(montarPulsoDaEquipe('Carla', [negocio({ dias_parado: 1 })], LINK));
    expect(t).toContain('sem mexer há 1 dia ');
  });
});

describe('a fila pessoal fala com a voz da pauta', () => {
  // `dias_parado` vem de `pauta_do_dia_de` (nulo para compromisso). Os dois negócios estão
  // parados há 5 dias — nenhum destoa do outro —, então a voz cai no degrau do valor somado.
  const itens: ItemDaPauta[] = [
    { tipo: 'negocio_parado', selo: 'Orçamento parado', titulo: 'Obra do Porto', detalhe: 'Em Negociação desde 01/09/2026', valor: 12000, quando: null, dias_parado: 5 },
    { tipo: 'negocio_parado', selo: 'Orçamento parado', titulo: 'Obra do Sul', detalhe: 'Em Proposta desde 02/09/2026', valor: 8000, quando: null, dias_parado: 5 },
  ];
  const compromisso: ItemDaPauta = {
    tipo: 'compromisso', selo: 'Hoje', titulo: 'Visita à obra', detalhe: 'Compromisso na agenda',
    valor: null, quando: '2026-09-11T13:00:00Z', dias_parado: null,
  };
  // O da frente parado há 40 dias, o de trás há 8: o da frente destoa (degrau 3).
  const destoa: ItemDaPauta[] = [{ ...itens[0], dias_parado: 40 }, { ...itens[1], dias_parado: 8 }];
  // Negócio sem valor preenchido existe nesta base (degrau 6).
  const semValor: ItemDaPauta[] = [{ ...itens[0], valor: 0 }, { ...itens[1], valor: null }];

  it('manchete e assunto são os da voz — não mais "N coisas esperam você"', () => {
    const t = texto(montarEmail('Ana Souza', itens, LINK, 3));
    expect(t).toContain('R$ 20.000 parados em 2 negócios');
    expect(t).not.toContain('esperam você');
    expect(t).not.toContain('em jogo');
    expect(semNbsp(assuntoDaPauta(itens, 3))).toBe('R$ 20.000 esperando você hoje');
  });

  it('é a MESMA frase da tela: manchete, linha de baixo e assunto saem de vozDaPauta', () => {
    // A tela "Hoje" lê `src/lib/voz-da-pauta.ts`; o e-mail, a cópia de `_shared/` — idênticas
    // byte a byte (`voz-da-pauta.test.ts`). Conferir contra a da tela prova que o e-mail não
    // montou frase própria em nenhum dos degraus que ele pode receber.
    const filas: ItemDaPauta[][] = [
      [compromisso],           // degrau 2
      destoa,                  // degrau 3
      [compromisso, ...itens], // degrau 4
      itens,                   // degrau 5
      semValor,                // degrau 6
    ];
    for (const fila of filas) {
      const voz = vozDaPauta(fila, 3);
      const t = texto(montarEmail('Ana', fila, LINK, 3));
      expect(t).toContain(texto(voz.manchete));
      if (voz.apoio) expect(t).toContain(texto(voz.apoio));
      expect(assuntoDaPauta(fila, 3)).toBe(voz.assunto);
    }
  });

  it('degrau 3: a linha de baixo traz valor e nome do negócio — ESCAPADOS, porque o nome vem do banco', () => {
    const fila: ItemDaPauta[] = [{ ...destoa[0], titulo: 'Obra <Norte> & Sul', valor: 180000 }, destoa[1]];
    const html = montarEmail('Ana', fila, LINK, 3);
    const t = texto(html);
    expect(t).toContain('Um negócio seu está há 40 dias sem mexer');
    expect(t).toContain('R$ 180.000 · Obra &lt;Norte&gt; &amp; Sul');
    // Nenhuma etiqueta veio do dado: o `<Norte>` do nome não pode virar HTML no e-mail.
    expect(html).not.toContain('<Norte>');
  });

  it('sem linha de baixo — o caso comum —, o parágrafo dela some: nada de buraco', () => {
    // A voz só tem linha de baixo no degrau 3. Um `<p>` vazio no lugar somava a margem dele ao
    // espaço acima dos itens — e no Outlook de computador parágrafo vazio vira linha em branco.
    for (const fila of [[compromisso], [compromisso, ...itens], itens, semValor]) {
      expect(vozDaPauta(fila, 3).apoio).toBeNull();
      expect(montarEmail('Ana', fila, LINK, 3)).not.toMatch(PARAGRAFO_VAZIO);
    }
  });

  it('com linha de baixo, o parágrafo volta — com o texto dentro', () => {
    const html = montarEmail('Ana', destoa, LINK, 3);
    expect(html).toMatch(/<p[^>]*>\s*R\$\s12\.000 · Obra do Porto\s*<\/p>/);
    expect(html).not.toContain('LINHA_TEXTO');
  });

  it('o ajuste "dias parado" da empresa chega à voz — a mesma régua da fila', () => {
    // 8 dias contra 4 é o dobro. Com o padrão (3), 8 já conta como parado e o negócio destoa.
    // Numa empresa que só chama de parado a partir de 10 dias, a fila dela não o considera
    // parado — e o e-mail não pode dizer que ele está esquecido.
    const fila: ItemDaPauta[] = [{ ...itens[0], dias_parado: 8 }, { ...itens[1], dias_parado: 4 }];
    expect(assuntoDaPauta(fila, 3)).toBe('Um negócio seu está há 8 dias sem mexer');
    expect(texto(montarEmail('Ana', fila, LINK, 3))).toContain('Um negócio seu está há 8 dias sem mexer');
    expect(semNbsp(assuntoDaPauta(fila, 10))).toBe('R$ 20.000 esperando você hoje');
    expect(texto(montarEmail('Ana', fila, LINK, 10))).toContain('R$ 20.000 parados em 2 negócios');
  });

  it('o dia vazio não sai com dois pontos — o modelo já fecha a manchete com o ponto da marca', () => {
    // Hoje fila vazia não gera e-mail (`index.ts`), mas essa decisão está marcada para revisão
    // agora que a voz existe — e aí "…Seu dia está seu." encontraria o ponto laranja do modelo.
    const html = montarEmail('Ana', [], LINK, 3);
    expect(texto(html)).toContain('Nada parado. Seu dia está seu');
    expect(html).not.toMatch(/seu\.\s*<span[^>]*>\.<\/span>/);
  });

  it('o botão dela continua sendo "Abrir minha pauta"', () => {
    const html = montarEmail('Ana', itens, LINK, 3);
    expect(html).toContain('Abrir minha pauta');
    expect(html).not.toContain('Ver a tabela do time');
    expect(html).not.toContain('{{PAUTA_');
    expect(texto(html)).toContain('É a mesma pauta que aparece na tela "Hoje".');
  });

  it('item de colega continua trazendo o nome do dono', () => {
    const comDono: ItemDaPauta[] = [{ ...itens[0], responsavel: 'Vendedor Dois' }];
    expect(texto(montarEmail('Carla', comDono, LINK, 3)))
      .toContain('Em Negociação desde 01/09/2026 · Vendedor Dois');
  });

  it('um compromisso só fica no singular', () => {
    expect(assuntoDaPauta([compromisso], 3)).toBe('1 compromisso hoje');
    expect(texto(montarEmail('Ana', [compromisso], LINK, 3))).toContain('1 compromisso hoje');
  });
});

describe('o ajuste "dias parado" de cada empresa, lido como o banco lê', () => {
  // `pauta_do_dia_de` faz `coalesce((valor #>> '{}')::int, 3)`. O `index.ts` lê as linhas de
  // todas as empresas dos destinatários numa consulta só e passa por aqui.
  it('empresa que nunca salvou o ajuste fica com 3, o padrão do banco', () => {
    expect(diasParadoPorEmpresa([{ empresa_id: 'empresa-a', valor: 10 }])('empresa-b')).toBe(3);
    expect(diasParadoPorEmpresa([])('empresa-a')).toBe(3);
  });

  it('cada empresa com o seu, numa leitura só', () => {
    const dias = diasParadoPorEmpresa([
      { empresa_id: 'empresa-a', valor: 10 },
      { empresa_id: 'empresa-b', valor: 1 },
    ]);
    expect(dias('empresa-a')).toBe(10);
    expect(dias('empresa-b')).toBe(1);
  });

  it('número guardado como texto vale, como no `::int` do banco', () => {
    expect(diasParadoPorEmpresa([{ empresa_id: 'e', valor: '7' }])('e')).toBe(7);
  });

  it('valor nulo cai no padrão, como no `coalesce` do banco', () => {
    expect(diasParadoPorEmpresa([{ empresa_id: 'e', valor: null }])('e')).toBe(3);
  });
});
