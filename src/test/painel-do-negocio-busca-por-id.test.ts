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
 * Nenhum teste de comportamento pega a volta disso: quem simplificar a cadeia e derrubar o
 * recurso por id continua com a tela funcionando para quem clica num card da própria lista. O
 * sintoma só reaparece semanas depois, num negócio antigo, sem ninguém ligar uma coisa à outra.
 *
 * ⚠️ MUDOU DE ENDEREÇO EM 07/09/2026, e a cadeia agora atravessa DOIS arquivos. O painel saiu de
 * dentro de `Negocios.tsx` e virou `PainelDoNegocio.tsx`, para poder ser montado de outras telas
 * sem tirar a pessoa do lugar. A divisão é esta, e é ela que estas asserções prendem:
 *
 *   - `Negocios.tsx` continua fazendo a VARREDURA LOCAL (ela depende do Kanban, da lista e do
 *     lote de seleção em massa, que são dela) e entrega o resultado em `negocioJaCarregado`.
 *     Sem isso, clicar num card da própria tela passaria a disparar uma requisição que hoje não
 *     existe;
 *   - `PainelDoNegocio.tsx` é quem BUSCA por id, e só quando nada chegou pronto.
 *
 * SE ESTE TESTE FALHOU: não o apague. O caminho certo é manter `usePedidoPorId` encadeado como
 * último recurso do painel, com o que a tela já tem em mãos tendo prioridade.
 */
describe('o painel do negócio busca por identificador', () => {
  const painel = readFileSync(
    join(process.cwd(), 'src', 'components', 'pedidos', 'PainelDoNegocio.tsx'),
    'utf8',
  );
  const negocios = readFileSync(
    join(process.cwd(), 'src', 'pages', 'Negocios.tsx'),
    'utf8',
  );

  it('usa usePedidoPorId', () => {
    expect(painel).toContain('usePedidoPorId');
  });

  it('mantém o que a tela já carregou com prioridade sobre a busca', () => {
    // `negocioJaCarregado ?? negocioBuscado` — nunca o contrário: depois de arrastar um card no
    // Kanban, a linha local já tem a etapa nova e a buscada ainda teria a anterior.
    expect(painel).toMatch(/negocioJaCarregado\s*\?\?\s*negocioBuscado/);
  });

  it('a busca só sai quando a tela não mandou o negócio pronto', () => {
    // O segundo argumento de `usePedidoPorId` é o "habilitado". Sem ele, a tela mais usada do
    // sistema ganharia uma requisição por abertura de painel.
    expect(painel).toMatch(/usePedidoPorId\(\s*pedidoId\s*,\s*!negocioJaCarregado\s*,?\s*\)/);
  });

  it('a tela de Negócios continua entregando a varredura local ao painel', () => {
    expect(negocios).toContain('const negocioLocal');
    expect(negocios).toMatch(/negocioJaCarregado=\{negocioLocal\}/);
  });

  it('tem um estado de "não encontrado", e não só carregando', () => {
    expect(painel).toContain('Este negócio não está mais disponível');
  });

  it('sai do painel por um caminho só, que limpa o endereço', () => {
    expect(negocios).toContain('const fecharPainel');
    // O botão "Fechar" do rodapé não pode voltar a mexer no estado direto: ele não passa pelo
    // onOpenChange do Radix, e o `?negocio=` ficaria no endereço. Hoje ele chama `onClose`, que
    // é `fecharPainel` — o único caminho de saída.
    expect(painel).not.toContain('setViewOrderId(null)');
    expect(negocios).not.toContain('onClick={() => setViewOrderId(null)}');
  });
});
