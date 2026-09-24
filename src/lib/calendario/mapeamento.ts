// Porta de entrada do app/testes para o MIOLO ÚNICO da sincronização, que vive em
// `supabase/functions/_shared/calendario-nucleo.ts` (roda igual no Deno das funções e no Node dos
// testes). A lógica e a matemática de data moram lá; aqui só reexportamos, para não haver duas
// cópias que possam divergir.
export { paraGoogle, paraRepply } from '../../../supabase/functions/_shared/calendario-nucleo';
export type {
  EventoParaSincronizar,
  PontoGoogle,
  RecursoGoogle,
} from '../../../supabase/functions/_shared/calendario-nucleo';
