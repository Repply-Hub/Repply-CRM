import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function autoResizeTextarea(el: HTMLTextAreaElement | null, maxRows = 6) {
  if (!el) return;

  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;
  const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom + borderTop + borderBottom;

  el.style.height = "auto";
  const newHeight = Math.min(el.scrollHeight, maxHeight);
  el.style.height = `${newHeight}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
}

// Usado para não navegar/abrir detalhe ao clicar em linhas de tabela quando o
// clique foi na verdade o fim de uma seleção de texto (o usuário estava
// copiando um valor da célula, não tentando abrir o registro).
export function hasTextSelection() {
  const selection = window.getSelection();
  return !!selection && selection.toString().length > 0;
}

export function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}
