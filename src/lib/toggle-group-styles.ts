// Estilo padrão de "toggle button group" (o mesmo visual do seletor
// Kanban/Lista em Negocios.tsx): container com borda + fundo neutro, item
// ativo sólido na cor primária. Usado para padronizar os seletores de
// visão/aba nas páginas principais (Clientes, Obras, Calendário, WhatsApp,
// E-mails, Configurações).
//
// A segunda linha é o que impede a tira de abas de ser CORTADA numa tela
// estreita. Sem ela, em Configurações as últimas abas (Campos e Empresa)
// simplesmente somem no celular, sem barra de rolagem em lugar nenhum — o
// usuário perde acesso à funcionalidade inteira, e nada indica que ela existe.
// - `max-w-full overflow-x-auto`: quando não couber, rola de lado em vez de sumir.
// - `[scrollbar-width:none]` e `[&::-webkit-scrollbar]:hidden`: rola sem barra à
//   vista, para não roubar altura de uma tira de 32px.
// - `[&>*]:shrink-0`: as abas precisam se recusar a encolher, senão elas se
//   espremem para caber e a rolagem nunca chega a existir.
// - `justify-start`: o ToggleGroup do Radix já vem com `justify-center`, e
//   conteúdo centralizado que transborda fica inalcançável do lado esquerdo.
export const TOGGLE_LIST_CLASS =
  "inline-flex items-center justify-start gap-1 rounded-md border border-border bg-background p-0.5 h-auto " +
  "max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0";

// `group` existe para o contador (TOGGLE_BADGE_CLASS) conseguir reagir ao
// estado da aba: o data-state fica no gatilho, não no badge.
export const TOGGLE_TRIGGER_CLASS =
  "group h-8 gap-1.5 px-3 rounded-md text-sm font-medium transition-colors " +
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none " +
  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground";

/**
 * Contador dentro de uma aba (ex.: "Recebidos [12]").
 *
 * HISTÓRICO, porque este chip já quebrou duas vezes por motivos diferentes:
 *
 * 1. `bg-primary/10 text-primary` fixo. Na aba ATIVA o fundo é laranja sólido,
 *    então laranja a 10% sobre laranja com texto laranja dava 1,00:1 — o número
 *    sumia por completo. Na inativa, 2,77:1.
 * 2. `bg-primary-foreground` + `text-accent-foreground` na aba ativa. Resolveu o
 *    tema claro (5,4:1) e QUEBROU o escuro, porque os dois tokens se movem em
 *    direções opostas entre os temas: `--primary-foreground` é branco nos dois,
 *    mas `--accent-foreground` vai de laranja escuro (claro) para pêssego
 *    clarinho #FFD8C2 (escuro). Pêssego sobre branco = 1,32:1.
 *
 * A lição das duas: par de tokens só é seguro quando AMBOS viram junto. Daqui em
 * diante o chip usa `background`/`foreground`, que é o par que o tema inteiro
 * inverte de uma vez:
 *
 *              chip                    número no chip     chip sobre a aba
 *   claro      #FFFFFF                 18,9:1             3,1:1 sobre o laranja
 *   escuro     #121212                 15,8:1             5,6:1 sobre o laranja
 *
 * `tabular-nums` mantém a largura estável enquanto a contagem muda, para a
 * aba não "pular" a cada sincronização.
 */
export const TOGGLE_BADGE_CLASS =
  "ml-1 h-5 min-w-[20px] justify-center border-none px-1.5 tabular-nums " +
  "bg-muted text-foreground " +
  "group-data-[state=active]:bg-background group-data-[state=active]:text-foreground";

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
