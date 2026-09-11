/**
 * O que a tela "Hoje" e o e-mail das 7h dizem, conforme o dia.
 *
 * Por que não uma frase fixa: esta frase chega TODO DIA ÚTIL. O que impressiona na segunda é
 * papel de parede na terceira semana. O impacto vem da concretude — números que mudam sozinhos —
 * e não do adjetivo, que também brigaria com o tom do produto (CLAUDE.md §8: sóbrio e técnico,
 * sem linguagem de varejo).
 *
 * Uma função só, duas pontas: a tela e o e-mail leem daqui. Se cada um montasse a própria frase,
 * eles divergiriam — é como o projeto já se machucou antes (CLAUDE.md §7.14).
 *
 * 🔴 ESTE ARQUIVO EXISTE EM DUAS CÓPIAS IDÊNTICAS, byte a byte: `src/lib/voz-da-pauta.ts` (a tela)
 * e `supabase/functions/_shared/voz-da-pauta.ts` (o e-mail), porque a função de borda roda em Deno
 * e não importa de `src/`. As duas são presas ao mesmo contrato por `src/lib/voz-da-pauta.test.ts`.
 * Mudou uma, copie o arquivo inteiro para a outra — é por isso que ele não tem import nenhum.
 */
export type ItemParaVoz = {
  tipo: string;
  titulo: string;
  valor: number | null;
  dias_parado: number | null;
};

export type VozDaPauta = {
  manchete: string;
  apoio: string | null;
  assunto: string;
};

const dinheiro = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

export function vozDaPauta(itens: ItemParaVoz[], diasParadoDaEmpresa: number): VozDaPauta {
  const negocios = itens.filter((i) => i.tipo !== 'compromisso');
  const compromissos = itens.length - negocios.length;
  const valor = negocios.reduce((s, i) => s + (Number(i.valor) || 0), 0);

  // Degrau 1 — o vazio COMEMORA. É o dia em que a pessoa terminou, e é o que faz ela abrir a
  // tela amanhã.
  if (itens.length === 0) {
    return {
      manchete: 'Nada parado. Seu dia está seu.',
      apoio: null,
      assunto: 'Seu dia está livre',
    };
  }

  // Degrau 2
  if (negocios.length === 0) {
    const frase = `${plural(compromissos, 'compromisso', 'compromissos')} hoje`;
    return { manchete: frase, apoio: null, assunto: frase };
  }

  // Degrau 3 — um negócio destoa. A régua é RELATIVA à própria fila, não um número fixo:
  // medido em 09/09/2026, os 150 negócios abertos da MD estão parados entre 0 e 7 dias e nenhum
  // acima de 30 (a migração do Bitrix carimbou todos em 01/09). Um limite fixo nunca dispararia
  // hoje e, semanas depois, dispararia para todo mundo de uma vez.
  //
  // "Primeiro" e "segundo" são entre os NEGÓCIOS — compromisso não tem dias parado. Com um
  // negócio só não há segundo colocado, e o degrau não casa.
  const porParado = [...negocios].sort(
    (a, b) => (Number(b.dias_parado) || 0) - (Number(a.dias_parado) || 0),
  );
  const primeiro = Number(porParado[0]?.dias_parado) || 0;
  const segundo = Number(porParado[1]?.dias_parado) || 0;
  if (porParado.length >= 2 && primeiro >= diasParadoDaEmpresa && primeiro >= segundo * 2) {
    const alvo = porParado[0];
    const valorDoAlvo = Number(alvo.valor) || 0;
    return {
      manchete: `Um negócio seu está há ${plural(primeiro, 'dia', 'dias')} sem mexer`,
      apoio: valorDoAlvo > 0 ? `${dinheiro(valorDoAlvo)} · ${alvo.titulo}` : alvo.titulo,
      assunto: `Um negócio seu está há ${plural(primeiro, 'dia', 'dias')} sem mexer`,
    };
  }

  // Degrau 4
  if (compromissos > 0) {
    const frase = `${plural(compromissos, 'compromisso', 'compromissos')} e ${plural(negocios.length, 'negócio', 'negócios')} hoje`;
    return { manchete: frase, apoio: null, assunto: frase };
  }

  // Degrau 5
  if (valor > 0) {
    const frase = `${dinheiro(valor)} parados em ${plural(negocios.length, 'negócio', 'negócios')}`;
    return { manchete: frase, apoio: null, assunto: `${dinheiro(valor)} esperando você hoje` };
  }

  // Degrau 6 — negócio sem valor preenchido existe nesta base e não pode virar "R$ 0,00 parados".
  const frase = plural(negocios.length, 'negócio parado', 'negócios parados');
  return { manchete: frase, apoio: null, assunto: `${frase} hoje` };
}
