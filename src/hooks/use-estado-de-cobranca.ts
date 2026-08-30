import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { registrarEstadoDeCobranca } from '@/lib/recusa-do-banco';
import { useAuth } from '@/hooks/use-auth';
import {
  diasDeInadimplencia,
  meuDegrauNaRegua,
  motivoDoBloqueio,
  type DegrauDaRegua,
  type MotivoDoBloqueio,
} from '@/lib/plano-gate';

/**
 * O estado de cobrança da empresa de quem está logado — SEMPRE ATUAL.
 *
 * 🔴 O DEFEITO QUE ISTO CONSERTA, relatado pelo Lucas em 30/08/2026:
 *
 *   "fiz o teste de bloquear e mesmo assim ainda era possível de eu clicar em criar contatos,
 *    criar negócios, etc, não aparecia nenhum aviso de bloqueio"
 *
 * A faixa lia o `profile`, que o navegador carrega UMA VEZ no login e guarda. Quando o admin
 * bloqueava a empresa, esse retrato continuava dizendo "ativo": o banco recusava a gravação
 * corretamente, mas a tela não sabia e não avisava nada. A pessoa preenchia o formulário
 * inteiro e só descobria no salvar — exatamente o que a faixa existia para acabar.
 *
 * 🔴 O PERFIL AINDA ENTRA, COMO PALPITE INICIAL. Não é redundância: quem entra numa empresa
 * já bloqueada vê a faixa no primeiro quadro, sem esperar a consulta. A consulta é a
 * AUTORIDADE — ela confirma ou desmente — mas começar por ela deixaria a faixa piscando para
 * dentro depois de meio segundo, em toda troca de tela.
 */

export interface EstadoDeCobranca {
  /** A conta foi encerrada pelo admin. Vence sobre tudo o mais. */
  encerrada: boolean;
  /** Não pode escrever. Inclui teste vencido, nunca ativou, pagamento parado e encerrada. */
  bloqueado: boolean;
  motivo: MotivoDoBloqueio | null;
  venceuEm: Date | null;
  /** Dias desde que o pagamento parou. `null` para quem não está na régua. */
  diasInadimplencia: number | null;
  degrau: DegrauDaRegua;
}

interface RespostaDoBanco {
  encerrada: boolean;
  bloqueado: boolean;
  motivo: MotivoDoBloqueio | null;
  venceu_em: string | null;
  dias_inadimplencia: number | null;
  degrau: DegrauDaRegua;
}

export function useEstadoDeCobranca(): EstadoDeCobranca {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id;

  // O palpite, a partir do que o perfil já traz. Vale até a consulta responder.
  const bloqueioDoPerfil = motivoDoBloqueio(profile);
  const palpite: EstadoDeCobranca = {
    encerrada: false,
    bloqueado: !!bloqueioDoPerfil,
    motivo: bloqueioDoPerfil?.motivo ?? null,
    venceuEm: bloqueioDoPerfil?.venceuEm ?? null,
    diasInadimplencia: diasDeInadimplencia(profile),
    degrau: meuDegrauNaRegua(profile),
  };

  const { data } = useQuery({
    queryKey: ['meu_estado_de_cobranca', empresaId],
    queryFn: async (): Promise<EstadoDeCobranca> => {
      const { data, error } = await supabase.rpc('meu_estado_de_cobranca' as never);
      if (error) throw error;

      const r = data as unknown as RespostaDoBanco;
      return {
        encerrada: !!r?.encerrada,
        bloqueado: !!r?.bloqueado,
        // O motivo só significa alguma coisa quando está bloqueado. Fora disso o banco
        // devolve um valor calculado que não descreve nada — usá-lo acenderia a faixa para
        // quem está em dia.
        motivo: r?.bloqueado ? (r.motivo ?? 'nunca_ativou') : null,
        venceuEm: r?.venceu_em ? new Date(r.venceu_em) : null,
        diasInadimplencia: r?.dias_inadimplencia ?? null,
        degrau: r?.degrau ?? 'em_dia',
      };
    },
    // Admin global não tem empresa e nunca é bloqueado.
    enabled: !!empresaId && profile?.role !== 'admin',
    // 🔴 REVALIDA AO VOLTAR PARA A ABA. É o que faz a faixa aparecer para quem estava com o
    // sistema aberto quando o bloqueio foi aplicado — o caso exato do relato de 30/08.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: false,
  });

  const estado = data ?? palpite;

  /**
   * 🔴 DEIXA O ESTADO ONDE UMA FUNÇÃO SEM REACT ALCANCE. `mensagemDeErro` roda dentro do
   * `catch` de cada gravação — não é componente, não tem hook, e sem isto não teria como
   * saber se a recusa do banco veio de bloqueio ou de falta de permissão. São problemas
   * opostos: um resolve pagando, o outro pedindo a um gestor.
   */
  useEffect(() => {
    registrarEstadoDeCobranca({ bloqueado: estado.bloqueado, encerrada: estado.encerrada });
  }, [estado.bloqueado, estado.encerrada]);

  return estado;
}
