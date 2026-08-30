import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nenhum comentário `//` pode estar em posição de FILHO de JSX.
 *
 * 🔴 O BUG QUE ISTO IMPEDE, e ele foi para produção em 28/08/2026.
 *
 * Em JSX, `//` só é comentário FORA das chaves. Dentro dos filhos de um elemento ele é
 * TEXTO, e o React desenha na tela — barras e tudo. O `VisitasObrasPainel` tinha um bloco
 * de comentário perfeitamente válido logo depois do `return (`:
 *
 *     return (
 *       // 🔴 BLOCOS DE DIA LADO A LADO, e não uma lista corrida.
 *       <div className="grid ...">
 *
 * Ao envolver aquilo numa `<div>` para acrescentar uma barra de filtro, o mesmo comentário
 * virou filho de JSX sem que uma linha dele mudasse:
 *
 *     return (
 *       <div>
 *         {barraDeFiltros}
 *         // 🔴 BLOCOS DE DIA LADO A LADO, e não uma lista corrida.   <- agora é TEXTO
 *         <div className="grid ...">
 *
 * O parágrafo inteiro apareceu no meio da tela de Obras, em produção, para o cliente
 * pagante. E nada acusou: **compila, passa no lint, passa nos tipos e passa nos testes** —
 * é texto válido para o React. Só olhando a tela dá para ver.
 *
 * Por isso este teste existe: ele é o único guarda automático contra essa família de erro.
 * Ele é de LEITURA DE ARQUIVO de propósito — cobrir isso com teste de renderização exigiria
 * montar cada tela com todos os seus dados falsos, e a maioria das telas deste projeto não
 * tem esse arranjo.
 *
 * A alternativa oficial seria a regra `react/jsx-no-comment-textnodes` do
 * `eslint-plugin-react`, que este projeto não usa (só tem `react-hooks` e `react-refresh`).
 * Se um dia esse plugin entrar, este teste pode sair.
 *
 * COMO ESCREVER COMENTÁRIO DENTRO DE JSX: envolva em chaves. A abertura é chave seguida de
 * barra-asterisco, e o fecho é asterisco-barra seguido de chave — o mesmo par de um
 * comentário de bloco, dentro de uma expressão JSX.
 */

const RAIZ = join(process.cwd(), 'src');

function arquivosTsx(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosTsx(caminho, achados);
    else if (nome.endsWith('.tsx')) achados.push(caminho);
  }
  return achados;
}

interface Vazamento {
  arquivo: string;
  linha: number;
  texto: string;
}

/**
 * A assinatura do vazamento: um `//` cuja linha anterior TERMINA em `>`, `/>` ou `}` (ou
 * seja, um irmão de JSX acabou de fechar) e cuja próxima linha de código ABRE uma tag.
 *
 * 🔴 `=>` é excluído porque é seta de função, não fim de elemento — sem essa exceção, todo
 * comentário dentro de um `map(() =>` daria alarme falso, e teste que grita à toa é teste
 * que alguém desliga.
 */
export function comentariosVazados(conteudo: string, arquivo = ''): Vazamento[] {
  const linhas = conteudo.split('\n');
  const vazamentos: Vazamento[] = [];

  for (let i = 0; i < linhas.length; i++) {
    if (!/^\s*\/\//.test(linhas[i])) continue;

    let anterior = i - 1;
    while (anterior >= 0 && !linhas[anterior].trim()) anterior--;

    let proxima = i + 1;
    while (
      proxima < linhas.length &&
      (!linhas[proxima].trim() || /^\s*\/\//.test(linhas[proxima]))
    ) {
      proxima++;
    }

    if (anterior < 0 || proxima >= linhas.length) continue;

    const antes = linhas[anterior].trim();
    const depois = linhas[proxima].trim();

    const fechaIrmaoDeJsx =
      (antes.endsWith('>') || antes.endsWith('}')) && !antes.endsWith('=>');

    if (fechaIrmaoDeJsx && depois.startsWith('<')) {
      vazamentos.push({ arquivo, linha: i + 1, texto: linhas[i].trim().slice(0, 70) });
    }
  }

  return vazamentos;
}

describe('comentário `//` em posição de filho de JSX', () => {
  it('reconhece o vazamento que foi para produção em 28/08/2026', () => {
    const trecho = [
      'return (',
      '  <div>',
      '    {barraDeFiltros}',
      '    // 🔴 BLOCOS DE DIA LADO A LADO, e não uma lista corrida.',
      '    <div className="grid">',
      '  </div>',
      ');',
    ].join('\n');

    expect(comentariosVazados(trecho)).toHaveLength(1);
  });

  it('não acusa o comentário entre o `return (` e o JSX, que é válido', () => {
    const trecho = [
      'return (',
      '  // este aqui é comentário de verdade',
      '  <div className="grid">',
      ');',
    ].join('\n');

    expect(comentariosVazados(trecho)).toHaveLength(0);
  });

  it('não acusa comentário dentro de callback — a seta não fecha elemento', () => {
    const trecho = [
      'lista.map((item) =>',
      '  // explicando o map',
      '  <Item key={item.id} />',
      ')',
    ].join('\n');

    expect(comentariosVazados(trecho)).toHaveLength(0);
  });

  /**
   * 🔴 30 SEGUNDOS, E NÃO OS 5 DE FÁBRICA — este teste lê o disco, não memória.
   *
   * Ele abre e varre TODOS os `.tsx` do projeto, um a um, de forma síncrona. Numa máquina
   * ociosa leva menos de um segundo; com o build ou outra suíte rodando junto, já passou dos
   * 5 segundos padrão do vitest e falhou por tempo — sem existir comentário vazado nenhum.
   *
   * Falha por tempo é a pior espécie: ela não reproduz quando alguém vai conferir, e o
   * caminho fácil é desligar o teste. Medido em 29/08/2026: 11 segundos numa rodada com o
   * build em paralelo, contra menos de 1 segundo isolado. 30 dá folga para a máquina ruim sem
   * deixar um travamento de verdade rodar para sempre.
   */
  it('🔴 nenhum arquivo .tsx do projeto tem comentário vazado', () => {
    const problemas = arquivosTsx(RAIZ).flatMap((caminho) =>
      comentariosVazados(readFileSync(caminho, 'utf-8'), caminho.replace(process.cwd(), '')),
    );

    // A mensagem lista arquivo e linha: quem quebrar isto tem de saber onde consertar sem
    // precisar caçar.
    expect(
      problemas.map((p) => `${p.arquivo}:${p.linha} -> ${p.texto}`),
    ).toEqual([]);
  }, 30_000);
});
