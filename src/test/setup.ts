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
