// Estilo padrão de "toggle button group" (o mesmo visual do seletor
// Kanban/Lista em Negocios.tsx): container com borda + fundo neutro, item
// ativo sólido na cor primária. Usado para padronizar os seletores de
// visão/aba nas páginas principais (Clientes, Obras, Calendário, WhatsApp,
// E-mails, Configurações).
export const TOGGLE_LIST_CLASS = "inline-flex items-center gap-1 rounded-md border border-border bg-background p-0.5 h-auto";

// `group` existe para o contador (TOGGLE_BADGE_CLASS) conseguir reagir ao
// estado da aba: o data-state fica no gatilho, não no badge.
export const TOGGLE_TRIGGER_CLASS =
  "group h-8 gap-1.5 px-3 rounded-md text-sm font-medium transition-colors " +
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none " +
  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground";

/**
 * Contador dentro de uma aba (ex.: "Recebidos [12]").
 *
 * O padrão anterior era `bg-primary/10 text-primary` fixo, e ele quebrava nos
 * dois estados: na aba ATIVA o fundo é laranja sólido, então laranja a 10%
 * sobre laranja com texto laranja dava contraste de 1,00:1 — o número
 * desaparecia por completo. Na aba inativa dava 2,77:1, também abaixo dos
 * 4,5:1 da WCAG.
 *
 * Agora o chip inverte junto com a aba: neutro quando inativa (18,2:1) e
 * branco com número em laranja escuro quando ativa (5,4:1).
 *
 * `tabular-nums` mantém a largura estável enquanto a contagem muda, para a
 * aba não "pular" a cada sincronização.
 */
export const TOGGLE_BADGE_CLASS =
  "ml-1 h-5 min-w-[20px] justify-center border-none px-1.5 tabular-nums " +
  "bg-muted text-foreground " +
  "group-data-[state=active]:bg-primary-foreground group-data-[state=active]:text-accent-foreground";

// Variante para @radix-ui/react-toggle-group (ToggleGroupItem usa data-state="on"|"off").
export const TOGGLE_ITEM_CLASS =
  "h-8 gap-1.5 px-3 rounded-md text-sm font-medium transition-colors " +
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-none " +
  "data-[state=off]:text-muted-foreground data-[state=off]:hover:bg-accent data-[state=off]:hover:text-accent-foreground";

// Para toggles feitos com <button> puro (sem Tabs/ToggleGroup do Radix), onde
// o estado ativo/inativo é resolvido manualmente:
// cn(TOGGLE_BUTTON_CLASS, active ? TOGGLE_BUTTON_ACTIVE : TOGGLE_BUTTON_INACTIVE)
export const TOGGLE_BUTTON_CLASS = "h-8 gap-1.5 px-3 rounded-md text-sm font-medium transition-colors inline-flex items-center justify-center";
export const TOGGLE_BUTTON_ACTIVE = "bg-primary text-primary-foreground";
export const TOGGLE_BUTTON_INACTIVE = "text-muted-foreground hover:bg-accent hover:text-accent-foreground";
