import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O painel do negócio precisa saber buscar o negócio pelo identificador.
 *
 * 🔴 O DEFEITO QUE ISTO IMPEDE. O painel procurava o negócio SÓ entre as linhas já carregadas
 * na tela de Negócios. Essa tela filtra pelo mês corrente, pelo funil guardado no navegador e
 * por um teto de 50 por coluna — enquanto o botão "Abrir negócio" da tela "Hoje" manda
 * justamente os mais PARADOS, que quase nunca são do mês. O painel abria e girava para sempre,
 * sem erro, sem texto e sem nada no registro de erros.
 *
 * Nenhum teste de comportamento pega a volta disso: quem simplificar o `useMemo` e derrubar o
 * recurso por id continua com a tela funcionando para quem clica num card da própria lista. O
 * sintoma só reaparece semanas depois, num negócio antigo, sem ninguém ligar uma coisa à outra.
 *
 * SE ESTE TESTE FALHOU: não o apague. O caminho certo é manter `usePedidoPorId` encadeado como
 * último recurso do painel, com a varredura local tendo prioridade.
 */
describe('o painel do negócio busca por identificador', () => {
  const fonte = readFileSync(
    join(process.cwd(), 'src', 'pages', 'Negocios.tsx'),
    'utf8',
  );

  it('usa usePedidoPorId', () => {
    expect(fonte).toContain('usePedidoPorId');
  });

  it('mantém a varredura local com prioridade sobre a busca', () => {
    // `negocioLocal ?? negocioBuscado` — nunca o contrário: depois de arrastar um card no
    // Kanban, a linha local já tem a etapa nova e a buscada ainda teria a anterior.
    expect(fonte).toMatch(/negocioLocal\s*\?\?\s*negocioBuscado/);
  });

  it('tem um estado de "não encontrado", e não só carregando', () => {
    expect(fonte).toContain('Este negócio não está mais disponível');
  });

  it('sai do painel por um caminho só, que limpa o endereço', () => {
    expect(fonte).toContain('const fecharPainel');
    // O botão "Fechar" do rodapé não pode voltar a mexer no estado direto: ele não passa pelo
    // onOpenChange do Radix, e o `?negocio=` ficaria no endereço.
    expect(fonte).not.toContain('onClick={() => setViewOrderId(null)}');
  });
});
