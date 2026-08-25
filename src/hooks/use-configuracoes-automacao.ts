import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

/**
 * As configurações da pauta do dia, por empresa.
 *
 * Guardadas em `configuracoes_automacao` — tabela chave/valor que já existia desde
 * 07/2026 e estava com ZERO linhas, porque a aba que deveria alimentá-la nunca teve código
 * ligado aos controles.
 *
 * 🔴 AUSÊNCIA DE LINHA SIGNIFICA "USA O PADRÃO VIGENTE", nunca "desligado". A função de
 * banco `pauta_do_dia_de` lê com `coalesce(...)` e cai nos mesmos padrões declarados aqui.
 * Por isso não semeamos linha nenhuma: empresa que nunca abriu esta tela acompanha o padrão
 * quando ele mudar, em vez de ficar presa no valor do dia em que a tabela foi semeada.
 *
 * Só gestor escreve — é a política da tabela, não uma escolha da tela.
 */

export const PADROES_DA_PAUTA = {
  /** Dias sem mudar de etapa para um negócio entrar na pauta. */
  pauta_dias_parado: 3,
  /** Piso de itens: abaixo disso o corte AFROUXA, para um dia leve não parecer quebrado. */
  pauta_min_itens: 3,
  /** Teto de itens, contando compromissos. É o que faz a pauta poder terminar. */
  pauta_max_itens: 7,
  /** O resumo diário por e-mail. Nasce desligado. */
  pauta_resumo_email: false,
  /**
   * Em que dias da semana o e-mail sai. `0` = domingo … `6` = sábado, igual ao
   * `getDay()` do JavaScript e ao `extract(dow)` do Postgres — os dois usam a mesma
   * numeração, o que evita a conversão errada de sempre.
   *
   * Padrão: segunda a sexta. Estes dias controlam SÓ O E-MAIL — a tela é consulta ao vivo e
   * mostra a pauta de hoje inclusive num sábado, para quem escolher trabalhar.
   */
  pauta_dias_da_semana: [1, 2, 3, 4, 5] as number[],
};

export type ChaveDaPauta = keyof typeof PADROES_DA_PAUTA;

export type ConfiguracoesDaPauta = typeof PADROES_DA_PAUTA;

export function useConfiguracoesAutomacao(empresaId?: string) {
  return useQuery({
    queryKey: ['configuracoes-automacao', empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<ConfiguracoesDaPauta> => {
      const { data, error } = await supabase
        .from('configuracoes_automacao')
        .select('chave, valor')
        .eq('empresa_id', empresaId!);
      if (error) throw error;

      const guardado = new Map((data ?? []).map((r) => [r.chave, r.valor]));
      const resultado = { ...PADROES_DA_PAUTA };

      for (const chave of Object.keys(PADROES_DA_PAUTA) as ChaveDaPauta[]) {
        if (!guardado.has(chave)) continue;
        const bruto = guardado.get(chave);
        const padrao = PADROES_DA_PAUTA[chave];

        // O valor é `jsonb`: pode voltar como número, booleano ou lista. Só aceita o que
        // tem o mesmo formato do padrão — linha corrompida à mão no painel do Supabase cai
        // no padrão em vez de quebrar a tela.
        if (Array.isArray(padrao)) {
          if (Array.isArray(bruto) && bruto.every((v) => typeof v === 'number')) {
            (resultado[chave] as number[]) = bruto as number[];
          }
        } else if (typeof padrao === 'number') {
          if (typeof bruto === 'number' && Number.isFinite(bruto)) {
            (resultado[chave] as number) = bruto;
          }
        } else if (typeof padrao === 'boolean') {
          if (typeof bruto === 'boolean') (resultado[chave] as boolean) = bruto;
        }
      }

      return resultado;
    },
  });
}

export function useSalvarConfiguracaoAutomacao(empresaId?: string) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (args: { chave: ChaveDaPauta; valor: number | boolean | number[] }) => {
      if (!empresaId) throw new Error('Sem empresa definida');
      const { error } = await supabase.from('configuracoes_automacao').upsert(
        {
          empresa_id: empresaId,
          chave: args.chave,
          valor: args.valor as never,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id ?? null,
        } as never,
        { onConflict: 'empresa_id,chave' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes-automacao', empresaId] });
      // A pauta é montada com estes números: sem invalidar, o gestor muda o teto e a tela
      // "Hoje" continua mostrando a quantidade antiga até alguém recarregar.
      qc.invalidateQueries({ queryKey: ['pauta-do-dia'] });
    },
  });
}
