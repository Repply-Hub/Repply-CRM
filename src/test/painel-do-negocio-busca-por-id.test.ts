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
 * ⚠️ E MUDOU DE DONO EM 09/09/2026 (Tarefa 2): quem lê e escreve o `?negocio=` do endereço é
 * `useNegocioNoEndereco`, um hook só, que qualquer tela usa. `Negocios.tsx` não guarda mais o
 * negócio aberto em estado próprio — quem manda é a URL, e por isso recarregar a página mantém o
 * painel aberto.
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
  const hoje = readFileSync(
    join(process.cwd(), 'src', 'pages', 'Hoje.tsx'),
    'utf8',
  );
  const painelDeNegocios = readFileSync(
    join(process.cwd(), 'src', 'components', 'pedidos', 'PainelDeNegocios.tsx'),
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
    // A saída única mudou de nome em 09/09/2026 (Tarefa 2): era `fecharPainel`, escrito à mão
    // dentro de `Negocios.tsx`, e passou a ser o `fecharNegocio` de `useNegocioNoEndereco` — o
    // mesmo que as outras telas usam. O que ela garante continua igual: apagar o `?negocio=` é o
    // que fecha o painel, e é um lugar só.
    expect(negocios).toContain('useNegocioNoEndereco');
    expect(negocios).toMatch(/onClose=\{fecharNegocio\}/);
    // O botão "Fechar" do rodapé não pode voltar a mexer em estado direto: ele não passa pelo
    // onOpenChange do Radix, e o `?negocio=` ficaria no endereço — recarregar reabriria o que a
    // pessoa acabou de fechar.
    expect(painel).not.toContain('setViewOrderId(null)');
    expect(negocios).not.toContain('setViewOrderId');
  });

  it('a tela "Hoje" ABRE o painel, e não navega para a tela de Negócios', () => {
    // 🔴 O defeito que isto impede (Tarefa 3, 09/09/2026, e o achado A3 da revisão dela). Até
    // aqui, clicar em "Abrir negócio" na pauta ou numa linha de "Os 10 maiores em risco" LEVAVA a
    // pessoa para `/app?negocio=<id>` — outra tela. Quem clica está no meio de uma fila de
    // trabalho: trocar de tela custava o lugar na fila, o filtro escolhido e a rolagem, e voltar
    // significava recomeçar.
    //
    // O sintoma da volta do bug é a pessoa SAIR da tela. Nenhum teste quebra com isso: a tela
    // continua funcionando, o negócio continua abrindo, só que no lugar errado. Estas três
    // asserções são a única coisa que prende a entrega.
    expect(hoje).toContain('useNegocioNoEndereco');
    expect(hoje).toMatch(/<PainelDoNegocio\b/);
    // Navegar para a tela de Negócios, em qualquer das duas formas que existiam antes.
    expect(hoje).not.toContain("navigate('/app");
    expect(hoje).not.toContain('/app?negocio=');
  });

  it('a lista de negócios da ficha ABRE o painel, e não desenha um detalhe próprio', () => {
    // 🔴 O defeito que isto impede (Tarefa 4, 09/09/2026, e o achado A4 da revisão dela). Até
    // aqui a lista de negócios das fichas de empresa e de contato tinha um diálogo PRÓPRIO de
    // detalhe: nome, obra, fabricante, valor, data, etapa e observações, e mais nada. Era a
    // TERCEIRA versão do detalhe do negócio e a mais pobre das três — sem responsáveis, sem
    // contatos, sem anexo, sem campos extras, sem tarefas, sem histórico e sem comentários.
    //
    // O sintoma da volta do bug NÃO é uma tela quebrada: é uma tela que funciona mostrando menos.
    // Nada falha se alguém trocar `abrirNegocio(p.id)` por um diálogo à mão ou por um
    // `navigate('/pedidos/<id>/editar')` amanhã — o clique continua abrindo alguma coisa, e a
    // divergência só aparece quando alguém compara duas telas lado a lado, meses depois.
    //
    // O guarda ESTRUTURAL vizinho (`painel-do-negocio-e-uma-peca-so.test.ts`) pega a cópia pela
    // forma dela; estas asserções prendem o GESTO desta lista em particular.
    expect(painelDeNegocios).toContain('useNegocioNoEndereco');
    expect(painelDeNegocios).toMatch(/<PainelDoNegocio\b/);
    // O clique da linha abre o painel pelo endereço — não guarda id em estado próprio, que é
    // como o diálogo antigo funcionava (`setViewOrderId`).
    expect(painelDeNegocios).toMatch(/onClick=\{\(\)\s*=>\s*p\.id\s*&&\s*abrirNegocio\(p\.id\)\}/);
    expect(painelDeNegocios).not.toContain('setViewOrderId');
  });

  it('a lista de negócios da ficha não volta a ter sobreposição de detalhe própria', () => {
    // `Dialog` e `ConteudoDialogo` são as duas formas de abrir um modal neste projeto (CLAUDE.md
    // §7.11). Nenhuma delas tem o que fazer aqui: quem mostra o detalhe é `PainelDoNegocio`, e
    // este componente não abre mais nada por conta própria. Um `<Dialog` novo neste arquivo é a
    // assinatura exata da terceira cópia voltando.
    expect(painelDeNegocios).not.toMatch(/<Dialog\b/);
    expect(painelDeNegocios).not.toContain('ConteudoDialogo');
  });

  it('a lista de negócios da ficha não manda ninguém para o formulário de edição', () => {
    // 🔴 O gesto que o Plano A inteiro veio tirar do sistema: mandar para a tela de EDIÇÃO quem
    // só queria OLHAR. Quem clica numa linha da ficha está lendo o histórico do cliente — cair no
    // formulário custa o lugar na lista, a rolagem e os filtros, e volta significa recomeçar.
    // Editar continua a um clique: é o botão do rodapé do próprio painel.
    expect(painelDeNegocios).not.toContain('/editar');
    expect(painelDeNegocios).not.toContain('useNavigate');
  });

  it('a tela de Negócios não tem a sua própria lógica do `?negocio=`', () => {
    // 🔴 Este é o guarda contra a volta do defeito de CLAUDE.md §7.14 — duas implementações da
    // mesma regra, e o conserto de uma não alcançando a outra. Até 09/09/2026 `Negocios.tsx`
    // mexia no parâmetro por conta própria; hoje o único dono dele é `useNegocioNoEndereco`.
    // Dois donos do mesmo parâmetro fazem o painel piscar, ou não abrir.
    expect(negocios).not.toMatch(/delete\(\s*['"]negocio['"]\s*\)/);
    expect(negocios).not.toMatch(/set\(\s*['"]negocio['"]\s*,/);
  });

  it('quem espelha filtros no endereço com `replace` repassa o `state` da entrada', () => {
    // 🔴 Guarda do conserto de 09/09/2026 (achados A1/A2 da revisão da Tarefa 3). A marca de "fui
    // eu que empurrei esta entrada do histórico" mora no `state` da entrada, e um `replace` sem
    // `state` nas opções não a preserva: grava `undefined` por cima. As duas telas espelham
    // filtros na URL com `replace` — `Negocios.tsx` num efeito que dispara SOZINHO logo depois de
    // abrir o painel —, então tirar esse repasse apaga a marca e o "Fechar" volta a deixar
    // entrada morta no histórico, sem nada na tela além de "o primeiro clique no voltar não fez
    // nada".
    //
    // O comportamento em si está preso em `src/hooks/use-negocio-no-endereco-na-tela.test.tsx`
    // (o teste do espelho de filtros); o que falta e mora aqui é o guarda de que as telas de
    // VERDADE fazem o repasse.
    expect(negocios).toMatch(/replace:\s*true,\s*state:\s*location\.state/);
    expect(hoje).toMatch(/replace:\s*true,[\s\S]{0,600}?state:\s*location\.state/);
  });
});
