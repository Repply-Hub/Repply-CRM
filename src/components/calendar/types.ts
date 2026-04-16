export type ViewMode = 'dia' | 'semana' | 'mes';
export type CalendarType = 'pessoal' | 'empresa';

export interface CalendarEvent {
  id: string;
  titulo: string;
  descricao?: string | null;
  inicio: Date;
  fim: Date;
  diaInteiro: boolean;
  tipoCalendario: CalendarType;
  cor: string;
  editavel: boolean;
}

export interface EventoForm {
  titulo: string;
  descricao: string;
  inicio: string;      // datetime-local or date
  fim: string;         // datetime-local or date
  diaInteiro: boolean;
  tipoCalendario: CalendarType;
  cor: string;
  participantes?: string[]; // user_ids (auth) — usado só na criação
}

export const CALENDAR_COLORS: Record<CalendarType, string> = {
  pessoal: '#3b82f6',
  empresa: '#1e3a5f',
};

export const EVENT_PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#1e3a5f', // navy
  '#6b7280', // gray
];
