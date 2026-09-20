import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // Nasce já com a largura real (inicializador preguiçoso do `useState`), não
  // com `undefined`. Calcular isso só dentro do `useEffect` abaixo fazia o
  // PRIMEIRO render sempre achar que era desktop — `isMobile` nascia
  // `undefined`, e `!!undefined` é `false`, mesmo com a tela aberta num
  // celular de verdade. Quem decide algo a partir desse primeiro valor (como
  // `deveMarcarMencaoComoVista` em `Chat.tsx`) errava justo nesse instante:
  // achado crítico da revisão do commit 2ca6c4c8 (Bloco 4, menções).
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
