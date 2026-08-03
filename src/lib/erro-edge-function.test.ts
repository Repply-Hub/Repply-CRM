import { describe, expect, it } from 'vitest';
import { mensagemDeErroDaFunction } from './erro-edge-function';

/** Reproduz o erro que a biblioteca lança quando a função responde com falha. */
function erroHttp(status: number, corpo: unknown, tipo = 'application/json') {
  const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  return {
    message: 'Edge Function returned a non-2xx status code',
    name: 'FunctionsHttpError',
    context: new Response(texto, { status, headers: { 'Content-Type': tipo } }),
  };
}

describe('mensagemDeErroDaFunction', () => {
  it('extrai a mensagem em português do corpo da resposta', async () => {
    const erro = erroHttp(400, { error: 'Instância desconectada' });
    await expect(mensagemDeErroDaFunction(erro)).resolves.toBe('Instância desconectada');
  });

  it('nunca devolve a frase genérica da biblioteca quando há corpo', async () => {
    const erro = erroHttp(502, { error: 'Número não possui WhatsApp', detail: 'cru' });
    const msg = await mensagemDeErroDaFunction(erro);
    expect(msg).toBe('Número não possui WhatsApp');
    expect(msg).not.toContain('non-2xx');
  });

  it('não consome o corpo da resposta — pode ser lido de novo depois', async () => {
    // Se o clone() saísse, uma segunda leitura estouraria "body already read".
    const erro = erroHttp(400, { error: 'Instância desconectada' });
    await mensagemDeErroDaFunction(erro);
    await expect((erro.context as Response).json()).resolves.toEqual({
      error: 'Instância desconectada',
    });
  });

  it('aceita a chave message além de error', async () => {
    const erro = erroHttp(500, { message: 'Falha interna' });
    await expect(mensagemDeErroDaFunction(erro)).resolves.toBe('Falha interna');
  });

  it('usa o texto cru quando a resposta não é JSON', async () => {
    const erro = erroHttp(500, 'Erro no servidor', 'text/plain');
    await expect(mensagemDeErroDaFunction(erro)).resolves.toBe('Erro no servidor');
  });

  it('ignora corpo em HTML — é página de erro, não mensagem', async () => {
    const erro = erroHttp(502, '<!doctype html><html>Bad Gateway</html>', 'text/html');
    await expect(mensagemDeErroDaFunction(erro, 'padrão')).resolves.toBe('padrão');
  });

  it('ignora corpo longo demais para ser mensagem', async () => {
    const erro = erroHttp(500, 'x'.repeat(400), 'text/plain');
    await expect(mensagemDeErroDaFunction(erro, 'padrão')).resolves.toBe('padrão');
  });

  it('cai no padrão quando o corpo está vazio', async () => {
    const erro = erroHttp(500, '', 'text/plain');
    await expect(mensagemDeErroDaFunction(erro, 'padrão')).resolves.toBe('padrão');
  });

  it('traduz falha de rede, que chega sem corpo', async () => {
    const erro = { message: 'Failed to fetch' };
    await expect(mensagemDeErroDaFunction(erro)).resolves.toMatch(/sem conexão/i);
  });

  it('preserva mensagens próprias que não são a genérica', async () => {
    await expect(mensagemDeErroDaFunction({ message: 'Sessão expirada' })).resolves.toBe(
      'Sessão expirada',
    );
  });

  it('troca a frase genérica pelo padrão quando não há corpo nenhum', async () => {
    const erro = { message: 'Edge Function returned a non-2xx status code' };
    await expect(mensagemDeErroDaFunction(erro, 'Erro ao enviar mensagem')).resolves.toBe(
      'Erro ao enviar mensagem',
    );
  });

  it('não quebra com entradas inesperadas', async () => {
    await expect(mensagemDeErroDaFunction(null, 'padrão')).resolves.toBe('padrão');
    await expect(mensagemDeErroDaFunction(undefined, 'padrão')).resolves.toBe('padrão');
    await expect(mensagemDeErroDaFunction('texto solto', 'padrão')).resolves.toBe('padrão');
    await expect(mensagemDeErroDaFunction({ context: 42 }, 'padrão')).resolves.toBe('padrão');
  });
});
