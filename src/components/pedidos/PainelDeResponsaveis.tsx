import { useMemo } from 'react';
import { CampoDeResponsaveis, type ResponsavelSelecionado } from '@/components/pedidos/CampoDeResponsaveis';
import {
  useResponsaveisDoNegocio,
  useAdicionarResponsavel,
  useRemoverResponsavel,
  useDefinirPrincipal,
} from '@/hooks/use-responsaveis-do-negocio';
import { useVendedores } from '@/hooks/use-clientes';

/**
 * O campo de responsáveis que GRAVA NA HORA, para a ficha do negócio.
 *
 * A diferença em relação ao cadastro e à edição é só o momento de gravar: lá a lista é
 * rascunho até alguém clicar em Salvar; aqui não existe botão de salvar, então cada clique
 * precisa valer imediatamente — ou a pessoa fecha o painel achando que mudou algo.
 *
 * 🔴 TRADUZ A LISTA INTEIRA EM UM GESTO SÓ. O `CampoDeResponsaveis` entrega a lista nova
 * pronta, mas o banco tem três operações diferentes (entrar, sair, virar principal) e a do
 * principal é uma função de banco que rebaixa o antigo antes de promover o novo. Comparar o
 * antes com o depois é o que descobre QUAL gesto foi feito.
 *
 * 🔴 A ESTRELA É CONFERIDA ANTES DAS ENTRADAS E SAÍDAS, porque só ela mexe em dinheiro: ela
 * move `pedidos.usuario_id` e, com ele, a venda de uma pessoa para outra. Se os três gestos
 * fossem tratados na mesma ordem de chegada, uma troca de estrela junto com uma remoção
 * poderia tentar remover quem acabou de virar principal — que o banco recusa, com razão.
 */

interface Props {
  pedidoId: string;
  /** Sem permissão de editar o negócio, a lista aparece mas não muda. */
  somenteLeitura?: boolean;
}

export function PainelDeResponsaveis({ pedidoId, somenteLeitura }: Props) {
  const { data: responsaveis, isLoading } = useResponsaveisDoNegocio(pedidoId);
  const { data: pessoas } = useVendedores();
  const adicionar = useAdicionarResponsavel(pedidoId);
  const remover = useRemoverResponsavel(pedidoId);
  const definirPrincipal = useDefinirPrincipal(pedidoId);

  const value = useMemo<ResponsavelSelecionado[]>(
    () => (responsaveis ?? []).map((r) => ({ usuarioId: r.usuarioId, principal: r.principal })),
    [responsaveis],
  );

  const aplicar = (proximo: ResponsavelSelecionado[]) => {
    const antes = value;

    // 1. A estrela primeiro: é o único gesto que move dinheiro.
    const principalNovo = proximo.find((r) => r.principal)?.usuarioId;
    const principalAntigo = antes.find((r) => r.principal)?.usuarioId;
    if (principalNovo && principalNovo !== principalAntigo) {
      definirPrincipal.mutate(principalNovo);
      return;
    }

    // 2. Quem entrou.
    const idsAntes = new Set(antes.map((r) => r.usuarioId));
    const entrou = proximo.find((r) => !idsAntes.has(r.usuarioId));
    if (entrou) {
      adicionar.mutate(entrou.usuarioId);
      return;
    }

    // 3. Quem saiu.
    const idsDepois = new Set(proximo.map((r) => r.usuarioId));
    const saiu = antes.find((r) => !idsDepois.has(r.usuarioId));
    if (saiu) remover.mutate(saiu.usuarioId);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <CampoDeResponsaveis
      pessoas={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.nome, avatarUrl: p.avatar_url }))}
      value={value}
      onChange={aplicar}
      disabled={somenteLeitura || adicionar.isPending || remover.isPending || definirPrincipal.isPending}
    />
  );
}
