// Porta de entrada do app/testes para o MIOLO ÚNICO da sincronização
// (`supabase/functions/_shared/calendario-nucleo.ts`). Ver o comentário em `mapeamento.ts`.
export {
  quemVence,
  LIMITE_EXCLUSAO_EM_LOTE,
  excedeDisjuntor,
  deveTratarComoRecusa,
} from '../../../supabase/functions/_shared/calendario-nucleo';
