import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { NovoNegocioDialog } from '@/components/pedidos/NovoNegocioDialog';
import { usePedidoPorId } from '@/hooks/use-pedidos';
import { useResponsaveisDoNegocio } from '@/hooks/use-responsaveis-do-negocio';
import { useConfiguracoesCampos } from '@/hooks/use-configuracoes-campos';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useAuth } from '@/hooks/use-auth';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { montarCopiaDeNegocio, type NegocioParaCopiar } from '@/lib/copia-de-negocio';

const NovoPedido = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;

  /** Duplicar um negócio é esta tela com um endereço a mais — ver o desenho de 12/09/2026. */
  const copiaDeId = searchParams.get('copiaDe');

  const { data: original, isLoading: carregandoOriginal } = usePedidoPorId(copiaDeId, !!copiaDeId);
  const { data: responsaveis, isLoading: carregandoResponsaveis } = useResponsaveisDoNegocio(copiaDeId);
  const { data: camposConfig, isLoading: carregandoCampos } = useConfiguracoesCampos('pedidos', empresaId);
  // As etapas do funil DO NEGÓCIO copiado, já em ordem: a primeira é onde a cópia nasce.
  const { data: colunas, isLoading: carregandoColunas } = useKanbanColunas(empresaId, original?.funil_id);

  const copia = useMemo(() => {
    if (!copiaDeId || !original) return undefined;
    return montarCopiaDeNegocio({
      negocio: original as unknown as NegocioParaCopiar,
      responsaveis: (responsaveis ?? []).map((r) => ({ usuarioId: r.usuarioId, principal: r.principal })),
      camposDaEmpresa: (camposConfig ?? []).filter((c) => c.origem === 'customizado').map((c) => c.campo_key),
      primeiraEtapa: colunas?.[0]?.slug,
      rotulo: getNomeNegocio(original as never),
    });
  }, [copiaDeId, original, responsaveis, camposConfig, colunas]);

  // 🔴 A JANELA SÓ MONTA COM A CÓPIA PRONTA. O preenchimento dela é estado inicial, lido uma
  // vez dentro de NovoNegocioDialog (Tarefa 2): montar antes e preencher depois deixaria a
  // janela vazia para sempre — sem erro nenhum, só um formulário incompleto.
  //
  // Por isso espera as QUATRO consultas que alimentam a cópia — original, responsáveis, campos
  // customizados da empresa e etapas —, sempre pelo `isLoading` de cada uma, nunca por "o dado
  // ainda não chegou": uma consulta que falha deixa `data` undefined para sempre, e travaria a
  // tela girando (ver CLAUDE.md §7.15). `colunas` só liga quando `original.funil_id` existe —
  // medido que, no React Query 5.83 instalado aqui, o próprio `isLoading` dela já nasce `true`
  // na MESMA renderização em que `funilId` deixa de ser undefined (o cálculo "otimista" da
  // biblioteca cobre a troca de habilitada; não há brecha de uma renderização sem essa marca).
  const esperandoACopia = !!copiaDeId && (
    carregandoOriginal || carregandoResponsaveis || carregandoCampos || carregandoColunas
  );

  if (esperandoACopia) {
    return (
      <AppLayout>
        <div data-testid="espera-copia" className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      headerContent={
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/app')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">
            {copia ? 'Duplicar Negócio' : 'Novo Negócio'}
          </h1>
        </div>
      }
    >
      <NovoNegocioDialog
        open
        onOpenChange={(open) => { if (!open) navigate('/app'); }}
        copiaDe={copia}
        clienteId={copia?.clienteId || searchParams.get('clienteId') || undefined}
        status={copia?.status || searchParams.get('status') || undefined}
        funilId={copia?.funilId || searchParams.get('funilId') || undefined}
        onCreated={() => navigate('/app')}
      />
    </AppLayout>
  );
};

export default NovoPedido;
