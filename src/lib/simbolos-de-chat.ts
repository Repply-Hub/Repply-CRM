import {
  MessageCircle, Users2, Lightbulb, NotebookPen, Briefcase,
  Target, Megaphone, Calendar, ListChecks, Folder, type LucideIcon,
} from 'lucide-react';

/** Os símbolos que grupo/Geral podem escolher. Puro: chave estável + rótulo + ícone.
 *  Chave que sumir da lista cai no padrão sem erro (como o catálogo de sons). */
export interface SimboloDeChat {
  chave: string;
  rotulo: string;
  Icone: LucideIcon;
}

export const SIMBOLOS_DE_CHAT: readonly SimboloDeChat[] = [
  { chave: 'balao', rotulo: 'Balão de chat', Icone: MessageCircle },
  { chave: 'grupo', rotulo: 'Grupo de pessoas', Icone: Users2 },
  { chave: 'lampada', rotulo: 'Lâmpada', Icone: Lightbulb },
  { chave: 'notas', rotulo: 'Bloco de notas', Icone: NotebookPen },
  { chave: 'maleta', rotulo: 'Maleta', Icone: Briefcase },
  { chave: 'alvo', rotulo: 'Alvo', Icone: Target },
  { chave: 'megafone', rotulo: 'Megafone', Icone: Megaphone },
  { chave: 'agenda', rotulo: 'Agenda', Icone: Calendar },
  { chave: 'checklist', rotulo: 'Checklist', Icone: ListChecks },
  { chave: 'pasta', rotulo: 'Pasta', Icone: Folder },
];

export function simboloDoCatalogo(chave: string | null | undefined): SimboloDeChat | null {
  if (!chave) return null;
  return SIMBOLOS_DE_CHAT.find((s) => s.chave === chave) ?? null;
}
