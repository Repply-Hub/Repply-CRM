import "@testing-library/jest-dom";

// O jsdom não tem ResizeObserver, e o Radix (Popover, Command/cmdk) o usa ao montar. Sem este
// esboço, qualquer teste que renderize um desses componentes estoura com
// "ResizeObserver is not defined". Esboço vazio basta: os testes não medem tamanho de verdade.
class ResizeObserverEsboco {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverEsboco;

// O cmdk (Command) chama `scrollIntoView` no item selecionado, e o jsdom não implementa. Esboço
// vazio: no teste não há rolagem real para fazer.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// 🔴 O FUSO DOS TESTES É CRAVADO, e não é preferência: sem isto, os testes que existem
// justamente para pegar erro de fuso PASSAM COM O DEFEITO DE PÉ em qualquer máquina que rode em
// UTC. `new Date("2026-10-01")` lê o texto como UTC — atrás de UTC devolve 30/09 (o erro do
// CLAUDE.md §7.12), mas numa máquina em UTC devolve 01/10 e o teste não vê nada.
//
// Hoje nenhum servidor roda estes testes e todo mundo roda daqui, então o problema está
// adormecido. No dia em que existir um — e servidor nasce em UTC —, o teste de fuso de
// `aviso-da-tarefa-do-retorno.test.ts` vira enfeite em silêncio. Aquele arquivo prende a
// precondição: se alguém tirar esta linha, é ele que avisa.
//
// 🔴 FORTALEZA, E NÃO SÃO PAULO — medido, não escolhido. É o fuso desta máquina, o mesmo em que a
// suíte inteira foi escrita e validada, e o da MD (Natal). São Paulo foi a primeira escolha, em
// 10/09/2026, e derrubou 3 testes de data da importação (`src/lib/import/file-parser.test.ts`):
// todas as datas voltavam um dia. Não é horário de verão (2026 não tem) — é 1899. As duas cidades
// estão em UTC-3 hoje, mas o banco de fusos guarda a hora local de 30/12/1899, a data-zero do
// Excel: −3h06 em São Paulo, −2h34 em Fortaleza. A biblioteca de planilha conta os dias a partir
// dali, e em São Paulo a conta fecha seis minutos curta.
//
// Medido em 11/09/2026, e É SÓ DO TESTE: o escorregão aparece ao GRAVAR um `Date` numa célula
// (25/08 volta como 24/08 23:59:59), que é como o teste monta a planilha de exemplo. LER a
// planilha — o caminho da importação de verdade — acerta o dia em São Paulo também (25/08
// 00:00:28). E nenhuma tela do sistema grava `Date` em célula: as cinco que geram planilha
// escrevem texto. Se um dia alguma passar a gravar data de verdade, quem estiver no horário de São
// Paulo recebe o arquivo com as datas um dia antes — e esta suíte, cravada em Fortaleza, não vê.
process.env.TZ = "America/Fortaleza";
