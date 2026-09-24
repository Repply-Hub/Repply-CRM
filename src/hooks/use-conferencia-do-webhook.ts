import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LinhaDeConferencia } from '@/lib/prontidao-do-webhook';

/**
 * A medição que autoriza fechar o webhook do WhatsApp — item 16 da dívida técnica.
 *
 * O plano de blindagem só libera passar a RECUSAR quem chega sem segredo depois de alguns
 * dias com 100% dos eventos reais trazendo o segredo certo. Até agora essa conta só existia
 * como consulta solta no painel do Supabase, que uma pessoa só sabe rodar; aqui ela fica na
 * tela onde a decisão é tomada.
 *
 * A conta é feita **no banco** (`wa_conferencia_de_origem`), não aqui: são dezenas de milhares
 * de linhas por dia, e puxar isso para o navegador só para contar é o anti-padrão do
 * `CLAUDE.md` §6.4.
 *
 * Só admin da plataforma recebe linha — a checagem está dentro da função de banco, não nesta
 * tela (esconder botão não protege nada, `CLAUDE.md` §6.1).
 */
export function useConferenciaDoWebhook(habilitado = true) {
  return useQuery({
    queryKey: ['wa_webhook_origem'],
    enabled: habilitado,
    // Os números mudam a cada evento que chega; meio minuto é o suficiente para acompanhar
    // uma reconfiguração sem martelar o banco.
    staleTime: 30_000,
    // 🔴 Este painel existe para ser OLHADO enquanto a coisa acontece: depois de proteger um
    // número, a pessoa fica na tela esperando a conta subir. Sem isto, os números congelavam no
    // instante em que a página abriu, e quem esperasse cinco minutos veria o mesmo zero de
    // sempre — concluindo que não funcionou.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LinhaDeConferencia[]> => {
      const { data, error } = await supabase.rpc('wa_conferencia_de_origem');
      if (error) throw error;
      return (data ?? []) as LinhaDeConferencia[];
    },
  });
}
