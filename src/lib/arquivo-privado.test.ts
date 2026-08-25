import { describe, it, expect } from 'vitest';
import { caminhoDoArquivo } from './arquivo-privado';

// O endereço do projeto, como aparece nos 11.917 registros medidos em 25/08/2026.
const BASE = 'https://hukeirrmsoiowvvrhivx.supabase.co/storage/v1/object';

describe('caminhoDoArquivo', () => {
  // Os quatro baldes que de fato têm endereço gravado no banco, com o formato de caminho
  // que cada um usa de verdade — não exemplos inventados.
  it('extrai balde e caminho dos quatro baldes que existem no banco', () => {
    expect(caminhoDoArquivo(`${BASE}/public/pedido-anexos/0c5df684-20d1/orcamento.pdf`))
      .toEqual({ balde: 'pedido-anexos', caminho: '0c5df684-20d1/orcamento.pdf' });

    expect(caminhoDoArquivo(`${BASE}/public/whatsapp-media/incoming/0c5df684/foto.jpg`))
      .toEqual({ balde: 'whatsapp-media', caminho: 'incoming/0c5df684/foto.jpg' });

    expect(caminhoDoArquivo(`${BASE}/public/chat-files/a1997cd6/1690000-planilha.xlsx`))
      .toEqual({ balde: 'chat-files', caminho: 'a1997cd6/1690000-planilha.xlsx' });

    expect(caminhoDoArquivo(`${BASE}/public/avatars/a1997cd6/perfil.png`))
      .toEqual({ balde: 'avatars', caminho: 'a1997cd6/perfil.png' });
  });

  // 🔴 O caso que quebraria em silêncio: o endereço guarda o nome escapado, mas a API do
  // Storage espera o nome cru. Sem decodificar, arquivo com espaço ou acento dá 404 mudo.
  it('devolve o caminho DECODIFICADO — é o que a API do Storage espera', () => {
    expect(caminhoDoArquivo(`${BASE}/public/pedido-anexos/empresa/Or%C3%A7amento%20final.pdf`))
      .toEqual({ balde: 'pedido-anexos', caminho: 'empresa/Orçamento final.pdf' });
  });

  it('aceita o formato com identidade, não só o público', () => {
    expect(caminhoDoArquivo(`${BASE}/pedido-anexos/empresa/x.pdf`))
      .toEqual({ balde: 'pedido-anexos', caminho: 'empresa/x.pdf' });
  });

  it('aceita um endereço já assinado e descarta a assinatura', () => {
    expect(caminhoDoArquivo(`${BASE}/sign/whatsapp-media/incoming/x.jpg?token=abc.def.ghi`))
      .toEqual({ balde: 'whatsapp-media', caminho: 'incoming/x.jpg' });
  });

  // 🔴 Os 76 endereços externos medidos no banco. Devolver `null` aqui é o que faz o app
  // deixá-los intactos — tentar assinar endereço de outro domínio esconderia a imagem que
  // hoje aparece.
  it('devolve null para endereço que NÃO é do nosso Storage', () => {
    expect(caminhoDoArquivo('https://cdn.bitrix24.com.br/arquivo.pdf')).toBeNull();
    expect(caminhoDoArquivo('https://pps.whatsapp.net/v/t61/foto.jpg')).toBeNull();
    expect(caminhoDoArquivo('https://exemplo.com/storage/algo.png')).toBeNull();
  });

  it('devolve null para vazio, nulo e lixo', () => {
    expect(caminhoDoArquivo(null)).toBeNull();
    expect(caminhoDoArquivo(undefined)).toBeNull();
    expect(caminhoDoArquivo('')).toBeNull();
    expect(caminhoDoArquivo('nem é uma url')).toBeNull();
  });

  // Endereço truncado ou com balde sem arquivo não pode virar um pedido malformado.
  it('devolve null quando falta o balde ou o caminho', () => {
    expect(caminhoDoArquivo(`${BASE}/public/`)).toBeNull();
    expect(caminhoDoArquivo(`${BASE}/public/pedido-anexos`)).toBeNull();
    expect(caminhoDoArquivo(`${BASE}/public/pedido-anexos/`)).toBeNull();
  });

  it('preserva subpasta funda e ponto no nome', () => {
    expect(caminhoDoArquivo(`${BASE}/public/whatsapp-media/incoming/emp/2026/08/a.b.c.ogg`))
      .toEqual({ balde: 'whatsapp-media', caminho: 'incoming/emp/2026/08/a.b.c.ogg' });
  });
});
