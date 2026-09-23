import { describe, it, expect } from 'vitest';
import { sanitizarHtmlDeAnexo } from './sanitizar-html-de-anexo';

/**
 * O QUE ESTE ARQUIVO PRENDE: que a pré-visualização de anexo não EXECUTE o arquivo
 * (item 37 da dívida técnica).
 *
 * 🔴 POR QUE. `FilePreviewDialog` converte `.xlsx`, `.xls`, `.csv` e `.docx` em página e
 * injetava o resultado com `dangerouslySetInnerHTML` **sem limpar**. Célula com formatação
 * mista carrega HTML próprio (o campo `h` do SheetJS), e o `mammoth` não sanitiza por contrato.
 *
 * **Quem dispara: qualquer pessoa que tenha o número de WhatsApp da empresa.** Não precisa de
 * conta no sistema nem de link suspeito — precisa que alguém clique em "pré-visualizar", que é
 * o gesto do dia. O diálogo é usado na caixa de entrada, não só no chat interno. O código roda
 * com a sessão de quem clicou, e o token do Supabase vive no `localStorage` do navegador.
 *
 * 🔴 O ajudante de e-mail (`sanitizarHtmlEmail`) NÃO serve aqui: ele barra `table`, e planilha
 * é toda tabela. São dois conjuntos de permissões diferentes de propósito, como já acontece
 * entre escrever e ler e-mail.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

describe('sanitizarHtmlDeAnexo', () => {
  it('mantém a tabela inteira — é o conteúdo da planilha', () => {
    const limpo = sanitizarHtmlDeAnexo(
      '<table><thead><tr><th>Obra</th></tr></thead><tbody><tr><td>Obra Exemplo</td></tr></tbody></table>',
    );
    expect(limpo).toContain('<table>');
    expect(limpo).toContain('<th>Obra</th>');
    expect(limpo).toContain('<td>Obra Exemplo</td>');
  });

  it('mantém a formatação que o documento traz', () => {
    const limpo = sanitizarHtmlDeAnexo('<p><strong>Ana Souza</strong> e <em>Obra Exemplo</em></p>');
    expect(limpo).toContain('<strong>');
    expect(limpo).toContain('<em>');
  });

  it('🔴 tira <script> — é o caso que faz este arquivo existir', () => {
    const limpo = sanitizarHtmlDeAnexo('<td>ok</td><script>roubarToken()</script>');
    expect(limpo).not.toMatch(/<script/i);
    expect(limpo).not.toContain('roubarToken');
    expect(limpo).toContain('ok');
  });

  it('🔴 tira os gatilhos `on*`, que é como se executa sem <script>', () => {
    const limpo = sanitizarHtmlDeAnexo('<img src="x" onerror="roubarToken()"><td onclick="x()">a</td>');
    expect(limpo.toLowerCase()).not.toContain('onerror');
    expect(limpo.toLowerCase()).not.toContain('onclick');
  });

  it('🔴 tira link `javascript:`', () => {
    const limpo = sanitizarHtmlDeAnexo('<a href="javascript:roubarToken()">clique</a>');
    expect(limpo.toLowerCase()).not.toContain('javascript:');
    expect(limpo).toContain('clique');
  });

  it('🔴 tira iframe, object e embed', () => {
    const limpo = sanitizarHtmlDeAnexo(
      '<iframe src="https://exemplo.invalido"></iframe><object data="x"></object><embed src="y">',
    );
    expect(limpo.toLowerCase()).not.toContain('<iframe');
    expect(limpo.toLowerCase()).not.toContain('<object');
    expect(limpo.toLowerCase()).not.toContain('<embed');
  });

  it('mantém imagem embutida do .docx, que vem como dados no próprio endereço', () => {
    // O mammoth converte a imagem do documento em `data:image/...`. Sem isso, documento com
    // figura abriria sem as figuras.
    const limpo = sanitizarHtmlDeAnexo('<img src="data:image/png;base64,AAA" alt="grafico">');
    expect(limpo).toContain('data:image/png');
  });

  it('🔴 imagem apontando para endereço de fora NÃO passa — seria farol de leitura', () => {
    const limpo = sanitizarHtmlDeAnexo('<img src="https://rastreador.invalido/pixel.gif">');
    expect(limpo).not.toContain('rastreador.invalido');
  });

  it('🔴 link para fora perde o endereço, mas o texto fica', () => {
    // Não é descuido: numa pré-visualização de arquivo que chegou pelo WhatsApp, de alguém que
    // pode ser qualquer um, link clicável é phishing pronto. O DOMPurify aplica a mesma regra
    // de endereço a `href` e a `src`, então aceitar http(s) no link aceitaria a imagem de fora
    // junto — e aí volta o farol de leitura.
    const limpo = sanitizarHtmlDeAnexo('<a href="https://sitedefora.invalido">ver mais</a>');
    expect(limpo).toContain('ver mais');
    expect(limpo).not.toContain('sitedefora.invalido');
  });

  it('vazio e nulo não quebram', () => {
    expect(sanitizarHtmlDeAnexo('')).toBe('');
    expect(sanitizarHtmlDeAnexo(null as unknown as string)).toBe('');
    expect(sanitizarHtmlDeAnexo(undefined as unknown as string)).toBe('');
  });
});
