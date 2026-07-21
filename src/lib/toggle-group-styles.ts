// Estilo padrão de "toggle button group" (o mesmo visual do seletor
// Kanban/Lista em Negocios.tsx): container com borda + fundo neutro, item
// ativo sólido na cor primária. Usado para padronizar os seletores de
// visão/aba nas páginas principais (Clientes, Obras, Calendário, WhatsApp,
// E-mails, Configurações).
export const TOGGLE_LIST_CLASS = "inline-flex items-center gap-1 rounded-md border border-border bg-background p-0.5 h-auto";

export const TOGGLE_TRIGGER_CLASS =
  "h-8 gap-1.5 px-3 rounded-md text-sm font-medium transition-colors " +
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none " +
  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground";

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
