import { describe, it, expect } from 'vitest';
import {
  assuntoDaPauta,
  assuntoDoPulso,
  montarEmail,
  montarPulsoDaEquipe,
  type ItemDaPauta,
  type NegocioDaEquipe,
} from '../../supabase/functions/pauta-resumo-diario/corpo';

/**
 * O e-mail das 7h, conferido SEM DISPARAR ENVIO — há gente de verdade do outro lado.
 *
 * Este arquivo importa o mesmo módulo que o servidor executa (`corpo.ts`, dentro da função de
 * borda), monta o HTML com dados de mentira e lê o texto que sairia. É o caminho que
 * `src/lib/erro-do-provedor-de-email.test.ts` já usa com `_shared/nylas.ts`.
 *
 * O que ele prende:
 *   · o pulso da equipe usa `total_geral`/`valor_geral` — o recorte INTEIRO —, e não as 5
 *     linhas que ele leu. Somar as 5 daria um número muito menor e ninguém perceberia;
 *   · `esc()` em tudo que vem do banco (CLAUDE.md: nome de cliente com `<` ou `&`);
 *   · o botão leva à tabela do time, não a "minha pauta" — que está vazia, e é por isso que
 *     este e-mail existe;
 *   · a fila pessoal continua exatamente como era.
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
  total_geral: 145,
  valor_geral: 7402422,
  ...over,
});

/** Só o texto: tira as etiquetas e junta os espaços, para conferir a frase e não o HTML. */
const texto = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

describe('pulso da equipe — o e-mail de quem tem a chave e ficou sem negócio próprio', () => {
  const cinco = [
    negocio({ id: '1', nome: 'Obra Exemplo | Fabricante Exemplo', valor: 180000, dias_parado: 40, responsavel: 'Ana Souza' }),
    negocio({ id: '2', nome: 'Jampa Ocean Palace | Deca', valor: 198000, dias_parado: 32, responsavel: 'Pricila Azevedo' }),
    negocio({ id: '3', nome: 'ML8 Empreendimentos', valor: 120000, dias_parado: 9, responsavel: 'José Artur' }),
    negocio({ id: '4', nome: 'Construtora Licenge', valor: 90000, dias_parado: 3, responsavel: 'Margley Pontes' }),
    negocio({ id: '5', nome: 'Dois A Reserva Pipa', valor: 50000, dias_parado: 1, responsavel: 'Daniel Nóbrega' }),
  ];

  it('o assunto conta o recorte inteiro, não as 5 linhas lidas', () => {
    expect(assuntoDoPulso(cinco)).toBe('145 negócios da equipe pedem atenção');
  });

  it('a manchete traz o dinheiro do recorte inteiro, e a linha de baixo a contagem', () => {
    const t = texto(montarPulsoDaEquipe('Carla Dias', cinco, LINK));
    expect(t).toContain('Bom dia, Carla.');
    expect(t).toContain('R$ 7.402.422 pedem atenção');
    expect(t).toContain('em 145 negócios da equipe');
    // A soma das 5 linhas é R$ 672.000. Se algum dia alguém trocar `valor_geral` por um
    // `reduce` das linhas, é este número que vai aparecer — e o teste quebra.
    expect(t).not.toContain('672.000');
  });

  it('cada linha traz nome, dono, etapa, valor e dias sem mexer', () => {
    const t = texto(montarPulsoDaEquipe('Carla', cinco, LINK));
    expect(t).toContain('Obra Exemplo | Fabricante Exemplo');
    expect(t).toContain('Ana Souza · Negociação · sem mexer há 40 dias');
    expect(t).toContain('R$ 180.000');
    expect(t).toContain('Pricila Azevedo · Negociação · sem mexer há 32 dias');
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
      'Fabíola & Cia',
      [negocio({ nome: 'Obra <b>Norte</b> & Sul', responsavel: 'Alves & Filhos', etapa: 'Pré-venda' })],
      LINK,
    );
    expect(html).toContain('Obra &lt;b&gt;Norte&lt;/b&gt; &amp; Sul');
    expect(html).toContain('Alves &amp; Filhos');
    expect(html).toContain('Bom dia, Fabíola.');
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

describe('a fila pessoal continua como era', () => {
  const itens: ItemDaPauta[] = [
    { tipo: 'negocio_parado', selo: 'Orçamento parado', titulo: 'Obra do Porto', detalhe: 'Em Negociação desde 01/09/2026', valor: 12000, quando: null },
    { tipo: 'negocio_parado', selo: 'Orçamento parado', titulo: 'Obra do Sul', detalhe: 'Em Proposta desde 02/09/2026', valor: 8000, quando: null },
  ];

  it('a manchete conta os itens e soma o valor deles', () => {
    const t = texto(montarEmail('Ana Souza', itens, LINK));
    expect(t).toContain('2 coisas esperam você');
    expect(t).toContain('R$ 20.000 em jogo');
    expect(assuntoDaPauta(itens)).toBe('2 coisas esperam você hoje');
  });

  it('o botão dela continua sendo "Abrir minha pauta"', () => {
    const html = montarEmail('Ana', itens, LINK);
    expect(html).toContain('Abrir minha pauta');
    expect(html).not.toContain('Ver a tabela do time');
    expect(html).not.toContain('{{PAUTA_');
    expect(texto(html)).toContain('É a mesma pauta que aparece na tela "Hoje".');
  });

  it('item de colega continua trazendo o nome do dono', () => {
    const comDono: ItemDaPauta[] = [{ ...itens[0], responsavel: 'Pricila Azevedo' }];
    expect(texto(montarEmail('Carla', comDono, LINK)))
      .toContain('Em Negociação desde 01/09/2026 · Pricila Azevedo');
  });

  it('um item só fica no singular', () => {
    expect(assuntoDaPauta([itens[0]])).toBe('1 coisa espera você hoje');
    expect(texto(montarEmail('Ana', [itens[0]], LINK))).toContain('1 coisa espera você');
  });
});
