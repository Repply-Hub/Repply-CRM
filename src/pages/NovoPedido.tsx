import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { NovoNegocioDialog } from '@/components/pedidos/NovoNegocioDialog';
import { usePedidoPorId } from '@/hooks/use-pedidos';
import { useResponsaveisDoNegocio } from '@/hooks/use-responsaveis-do-negocio';
import { useConfiguracoesCampos } from '@/hooks/use-configuracoes-campos';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useAuth } from '@/hooks/use-auth';
import { useMyVendedorId, useIsGestor } from '@/hooks/use-novo-pedido';
import { useAnexosDoNegocio } from '@/hooks/use-pedido-anexos';
import { getNomeNegocio } from '@/lib/nome-negocio';
import { montarCopiaDeNegocio, type NegocioParaCopiar } from '@/lib/copia-de-negocio';

/** Decisão D2 do dono do produto (15/09/2026): negócio excluído ou fora do alcance da pessoa
 *  não trava a tela — abre Novo Negócio em branco, com este aviso. */
const AVISO_ORIGINAL_NAO_ENCONTRADO =
  'Não foi possível abrir o negócio para duplicar — ele pode ter sido excluído.';

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
  // Quem está duplicando — decide a regra D1 (ver `montarCopiaDeNegocio`). São os MESMOS ganchos
  // que `NovoNegocioDialog` já usa para travar o campo Responsável (`disabled={!isGestor}`) e
  // para o `vendedorId` do usuário logado: o id que eles devolvem é `usuarios.id`, o mesmo que
  // `vendedorId`/`usuario_id` usam em toda parte.
  const { data: isGestor, isLoading: carregandoIsGestor } = useIsGestor();
  const { data: myVendedorId, isLoading: carregandoMyVendedorId } = useMyVendedorId();
  // Os anexos do negócio ORIGINAL — a cópia leva a lista inteira, cada um apontando para o
  // MESMO arquivo (sem duplicar nada no armazenamento). Mesmo gancho que a ficha usa.
  const { data: anexosOriginais, isLoading: carregandoAnexosOriginais } = useAnexosDoNegocio(copiaDeId);

  const copia = useMemo(() => {
    if (!copiaDeId || !original) return undefined;
    return montarCopiaDeNegocio({
      negocio: original as unknown as NegocioParaCopiar,
      responsaveis: (responsaveis ?? []).map((r) => ({ usuarioId: r.usuarioId, principal: r.principal })),
      camposDaEmpresa: (camposConfig ?? []).filter((c) => c.origem === 'customizado').map((c) => c.campo_key),
      primeiraEtapa: colunas?.[0]?.slug,
      rotulo: getNomeNegocio(original),
      quemDuplica: { usuarioId: myVendedorId, ehGestor: !!isGestor },
      anexos: (anexosOriginais ?? []).map((a) => ({ url: a.url, nome: a.nome, tipo: a.tipo })),
    });
  }, [copiaDeId, original, responsaveis, camposConfig, colunas, myVendedorId, isGestor, anexosOriginais]);

  // 🔴 A JANELA SÓ MONTA COM A CÓPIA PRONTA. O preenchimento dela é estado inicial, lido uma
  // vez dentro de NovoNegocioDialog (Tarefa 2): montar antes e preencher depois deixaria a
  // janela vazia para sempre — sem erro nenhum, só um formulário incompleto.
  //
  // Por isso espera as SETE consultas que alimentam a cópia — original, responsáveis, campos
  // customizados da empresa, etapas, se quem duplica é gestor e qual é o `usuarioId` dela
  // (Correção da revisão final, 15/09/2026), e os anexos do original (pacote 5) —, sempre pelo
  // `isLoading` de cada uma, nunca por "o dado ainda não chegou": uma consulta que falha deixa
  // `data` undefined para sempre, e travaria a tela girando (ver CLAUDE.md §7.15). Sem esperar
  // os anexos, a cópia nasceria sem nenhum deles mesmo quando o original tem — a janela só lê
  // `copiaDe?.anexos` uma vez, no `useState` inicial (Tarefa 2/5), então chegar depois é o
  // mesmo que nunca chegar.
  //
  // `colunas` só liga quando `original.funil_id` existe — medido que, no React Query 5.83
  // instalado aqui, o próprio `isLoading` dela já nasce `true` na MESMA renderização em que
  // `funilId` deixa de ser undefined (o cálculo "otimista" da biblioteca cobre a troca de
  // habilitada; não há brecha de uma renderização sem essa marca). `anexosOriginais` segue a
  // mesma regra: a consulta só liga quando `copiaDeId` existe.
  const esperandoACopia = !!copiaDeId && (
    carregandoOriginal || carregandoResponsaveis || carregandoCampos || carregandoColunas ||
    carregandoIsGestor || carregandoMyVendedorId || carregandoAnexosOriginais
  );

  // Decisão D2 do dono do produto (15/09/2026): `?copiaDe=` aponta para um negócio que não
  // existe mais ou que esta pessoa não pode ver (a consulta termina com `original` nulo, tanto
  // por não achar a linha quanto por a regra de segurança do banco escondê-la). Em vez de travar
  // a tela ou mostrar um erro cru, avisa e abre o Novo Negócio em branco — `copia` já cai em
  // `undefined` sozinho ali em cima (o `!original` do `useMemo`), então não há mais nada a fazer
  // aqui além do aviso.
  //
  // `useRef`, não `useState`: é só uma trava de "já mostrei", não precisa re-renderizar a tela
  // — e um booleano de estado disparando o próprio efeito de novo seria o tipo de laço que essa
  // trava existe para evitar.
  const avisoOriginalAusenteMostrado = useRef(false);
  useEffect(() => {
    if (!copiaDeId || carregandoOriginal || original || avisoOriginalAusenteMostrado.current) return;
    avisoOriginalAusenteMostrado.current = true;
    toast.error(AVISO_ORIGINAL_NAO_ENCONTRADO);
  }, [copiaDeId, carregandoOriginal, original]);

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
