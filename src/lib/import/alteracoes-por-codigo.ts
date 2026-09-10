/**
 * O de-para: o que exatamente muda em cada negócio quando a planilha volta.
 *
 * Três campos, e só três: o nome do negócio, as observações e o marcador (decisão 4 do
 * desenho). Cliente, Fabricante, Valor, Etapa, Responsável e as datas são lidos e ignorados —
 * eles continuam mudando só dentro do CRM, onde há histórico de quem mudou. Deixar a planilha
 * mexer neles reativaria dois defeitos medidos: nome de cliente que não casa CRIA uma
 * construtora duplicada, e nome de responsável que não casa joga o negócio em quem importou
 * (4.777 negócios na MD, 01 e 04/09/2026).
 *
 * As três regras de escrita, todas com teste que as prende:
 *   1. Vazio não mexe. Célula em branco é "não informado", nunca "apague".
 *   2. Nome igual ao rótulo automático não mexe — é o que a nossa própria exportação escreveu.
 *   3. Marcador desconhecido não é criado; fica como está e entra no aviso.
 *
 * Sem rede, sem React, sem banco. Ver o desenho §5.B.
 */

export type CampoAlteravel = 'nome' | 'observacoes' | 'marcador_id';

/** O negócio como ele está no banco agora, com o que a comparação precisa saber. */
export interface NegocioAtual {
  id: string;
  nome: string | null;
  observacoes: string | null;
  marcador_id: string | null;
  /**
   * O rótulo que a tela monta quando `nome` está vazio: `"cliente | fabricante"`.
   * É contra ele que a regra 2 compara — ver `getNomeNegocioAutomatico` em
   * `src/lib/nome-negocio.ts`, que é quem a exportação usa.
   */
  nomeAutomatico: string;
  /** Como chamar este negócio na tela do aviso. */
  rotulo: string;
}

/** A linha da planilha, já mapeada pelo assistente. */
export interface LinhaParaAtualizar {
  codigo: string;
  negocio?: unknown;
  observacoes?: unknown;
  marcador?: unknown;
}

export interface AlteracaoDeCampo {
  campo: CampoAlteravel;
  /** O que está hoje, pronto para a tela. Vazio quando o campo está em branco no CRM. */
  de: string;
  para: string;
}

export interface AlteracaoDeNegocio {
  id: string;
  rotulo: string;
  alteracoes: AlteracaoDeCampo[];
  /** O que vai para o `update`. Nunca é vazio: negócio sem alteração não entra na lista. */
  patch: Record<string, string | null>;
}

export interface ResumoDasAlteracoes {
  negocios: AlteracaoDeNegocio[];
  porCampo: Record<CampoAlteravel, number>;
  /** Nomes de marcador que a planilha trouxe e a empresa não tem, na escrita original. */
  marcadoresDesconhecidos: string[];
}

/** Texto da planilha, aparado. Vazio quando não há nada escrito — e vazio nunca mexe. */
function texto(valor: unknown): string {
  if (typeof valor !== 'string' && typeof valor !== 'number') return '';
  return String(valor).trim();
}

/** Para comparar rótulo com rótulo sem tropeçar em espaço duplicado ou caixa. */
function paraComparar(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function calcularAlteracoes(
  linhas: LinhaParaAtualizar[],
  atuais: ReadonlyMap<string, NegocioAtual>,
  /** Marcadores da empresa: nome em caixa baixa → identificador. */
  marcadoresPorNome: ReadonlyMap<string, string>,
): ResumoDasAlteracoes {
  const negocios: AlteracaoDeNegocio[] = [];
  const porCampo: Record<CampoAlteravel, number> = { nome: 0, observacoes: 0, marcador_id: 0 };
  const desconhecidos = new Map<string, string>();

  for (const linha of linhas) {
    const atual = atuais.get(linha.codigo);
    // Linha sem par não é erro aqui: a classificação (reencontro-por-codigo.ts) já a mandou
    // para outro balde antes desta função ser chamada.
    if (!atual) continue;

    const alteracoes: AlteracaoDeCampo[] = [];
    const patch: Record<string, string | null> = {};

    // ---- nome ----
    const nomeNovo = texto(linha.negocio);
    if (nomeNovo) {
      const nomeHoje = atual.nome?.trim() ?? '';
      const jaEIgual = paraComparar(nomeNovo) === paraComparar(nomeHoje);
      // 🔴 A REGRA QUE IMPEDE O ESTRAGO SILENCIOSO. A exportação escreve o rótulo automático
      // quando o negócio não tem nome próprio, então reimportar sem editar traria esse mesmo
      // texto de volta. Gravá-lo transformaria "sem nome" em "chamado assim para sempre" em
      // 12.324 negócios, sem nada mudar na tela.
      const eOAutomatico = paraComparar(nomeNovo) === paraComparar(atual.nomeAutomatico);
      if (!jaEIgual && !eOAutomatico) {
        alteracoes.push({ campo: 'nome', de: nomeHoje || atual.nomeAutomatico, para: nomeNovo });
        patch.nome = nomeNovo;
        porCampo.nome += 1;
      }
    }

    // ---- observações ----
    const obsNova = texto(linha.observacoes);
    if (obsNova) {
      const obsHoje = atual.observacoes?.trim() ?? '';
      if (obsNova !== obsHoje) {
        alteracoes.push({ campo: 'observacoes', de: obsHoje, para: obsNova });
        patch.observacoes = obsNova;
        porCampo.observacoes += 1;
      }
    }

    // ---- marcador ----
    const marcadorNovo = texto(linha.marcador);
    if (marcadorNovo) {
      const id = marcadoresPorNome.get(marcadorNovo.toLowerCase());
      if (!id) {
        // Guarda a PRIMEIRA escrita que apareceu, para a tela mostrar do jeito que a pessoa
        // escreveu — e a chave em caixa baixa impede o mesmo nome entrar duas vezes.
        if (!desconhecidos.has(marcadorNovo.toLowerCase())) {
          desconhecidos.set(marcadorNovo.toLowerCase(), marcadorNovo);
        }
      } else if (id !== atual.marcador_id) {
        alteracoes.push({ campo: 'marcador_id', de: atual.marcador_id ?? '', para: marcadorNovo });
        patch.marcador_id = id;
        porCampo.marcador_id += 1;
      }
    }

    if (alteracoes.length > 0) {
      negocios.push({ id: atual.id, rotulo: atual.rotulo, alteracoes, patch });
    }
  }

  return { negocios, porCampo, marcadoresDesconhecidos: [...desconhecidos.values()] };
}

/** As frases do aviso. Vazio quando não há nada a dizer. */
export function textoDoResumoDeAlteracoes(resumo: ResumoDasAlteracoes): string[] {
  const frases: string[] = [];

  if (resumo.negocios.length > 0) {
    const quantos = resumo.negocios.length === 1
      ? '1 negócio será atualizado'
      : `${resumo.negocios.length} negócios serão atualizados`;

    const pedacos: string[] = [];
    if (resumo.porCampo.observacoes > 0) pedacos.push(`${resumo.porCampo.observacoes} em Observações`);
    if (resumo.porCampo.marcador_id > 0) pedacos.push(`${resumo.porCampo.marcador_id} no Marcador`);
    if (resumo.porCampo.nome > 0) pedacos.push(`${resumo.porCampo.nome} no nome`);

    frases.push(`${quantos} — ${pedacos.join(', ')}.`);
  }

  if (resumo.marcadoresDesconhecidos.length > 0) {
    const lista = resumo.marcadoresDesconhecidos.slice(0, 5).map(m => `"${m}"`).join(', ');
    const resto = resumo.marcadoresDesconhecidos.length > 5
      ? ` e mais ${resumo.marcadoresDesconhecidos.length - 5}`
      : '';
    frases.push(
      `Marcador que não existe aqui${resto ? '' : ''}: ${lista}${resto}. Esses negócios ficam com o marcador que já têm — a importação não cria marcador novo.`,
    );
  }

  return frases;
}
