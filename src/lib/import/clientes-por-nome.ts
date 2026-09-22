import { normalizeKey } from './resolve-entities';

export interface ClienteCitado {
  id: string;
  empresa: string | null;
}

/** Quantos nomes cabem numa pergunta ao banco. O mesmo bloco que `resolve-entities` usa. */
export const TAMANHO_DO_BLOCO = 50;

/**
 * Os clientes já cadastrados cujos nomes a planilha cita, pelo nome normalizado.
 *
 * 🔴 POR QUE ISTO EXISTE (item 52 da dívida técnica). A importação de contatos pedia a lista
 * INTEIRA de clientes para saber quais construtoras já existiam — e o PostgREST corta em 1.000
 * linhas, sem avisar e sem ordenação. Com a base da MD passando de 2.100, a construtora que
 * ficasse de fora era lida como "não existe" e ganhava ficha nova; e como as 1.000 que chegam
 * mudam a cada chamada, o estrago era diferente toda vez. Resultado: a mesma construtora em duas
 * fichas, com histórico, negócios e contatos divididos entre elas — pior a cada importação.
 *
 * Perguntar só pelos nomes citados, em blocos, tira o teto da jogada: o que limita passa a ser o
 * tamanho do bloco, não o tamanho da base.
 *
 * **Nome repetido fica de fora.** Se o mesmo nome tem duas fichas, não há como saber qual é a
 * certa, e vincular ao primeiro que aparecer seria adivinhar — o contato fica com o texto da
 * empresa e sem vínculo, que é o comportamento que a tela já tinha.
 *
 * Devolve DUAS coisas, e a segunda é fácil de esquecer: `porNome` só traz os nomes com uma
 * ficha, mas `jaCadastrados` traz todos os que existem — inclusive os ambíguos. Quem importa
 * precisa das duas: o ambíguo não vira vínculo, e também não pode virar ficha nova (senão a
 * importação criaria a terceira cópia da mesma construtora).
 *
 * `consultarBloco` recebe os nomes na grafia original (o `ilike` do banco já ignora maiúsculas) e
 * é injetado para esta regra poder ser testada sem banco.
 */
export async function clientesPorNomeCitado(
  nomesCitados: string[],
  consultarBloco: (nomes: string[]) => Promise<ClienteCitado[]>,
  tamanhoDoBloco: number = TAMANHO_DO_BLOCO,
): Promise<{ porNome: Map<string, string>; jaCadastrados: Set<string> }> {
  // Uma grafia por nome: a planilha repete a mesma construtora em dezenas de linhas, e cada
  // repetição viraria peso na pergunta ao banco.
  const porChave = new Map<string, string>();
  nomesCitados.forEach((nome) => {
    const limpo = nome?.trim();
    if (!limpo) return;
    const chave = normalizeKey(limpo);
    if (!porChave.has(chave)) porChave.set(chave, limpo);
  });

  const unicos = Array.from(porChave.values());
  const contagem = new Map<string, number>();
  const idPorChave = new Map<string, string>();

  for (let i = 0; i < unicos.length; i += tamanhoDoBloco) {
    const bloco = unicos.slice(i, i + tamanhoDoBloco);
    const encontrados = await consultarBloco(bloco);
    encontrados.forEach((cliente) => {
      if (!cliente.empresa) return;
      const chave = normalizeKey(cliente.empresa);
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      idPorChave.set(chave, cliente.id);
    });
  }

  return {
    porNome: new Map(
      Array.from(idPorChave.entries()).filter(([chave]) => contagem.get(chave) === 1),
    ),
    jaCadastrados: new Set(contagem.keys()),
  };
}
