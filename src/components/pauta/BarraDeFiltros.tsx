import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MultiSelectSearch } from '@/components/shared/MultiSelectSearch';
import { useKanbanColunasEmpresa } from '@/hooks/use-kanban-colunas';
// 🔴 Os dois vêm de `use-clientes`, não de arquivos com o nome deles. É de onde a tela de
// Negócios os importa (`Negocios.tsx:33`) — usar outro caminho criaria uma segunda lista.
import { useVendedores, useFabricantes } from '@/hooks/use-clientes';
import type { FiltrosDoPainel } from '@/lib/filtros-do-painel';
import { PeriodoDoPainel } from '@/components/pauta/PeriodoDoPainel';

/**
 * A barra de filtros do painel "No geral".
 *
 * O filtro de RESPONSÁVEL só aparece para quem pode ver a carteira dos colegas. Esconder o
 * controle não protege nada — quem decide é a regra do banco, e `dashboard_negocios_risco` já
 * devolve a lista nominal só para quem tem a chave `pauta_de_todos` (ou, sem a chave gravada,
 * para quem é gestor/admin/empresa). Aqui é só para não oferecer o que vai voltar vazio.
 *
 * O filtro de PERÍODO nasce DESLIGADO (`PeriodoDoPainel`): sem ele, o bloco mostra tudo, inclusive
 * os parados mais antigos, que são os que mais importa achar (os abertos mais antigos são de anos
 * atrás). Ao contrário do responsável, o período vale para TODOS — não depende da chave. Quando
 * ligado, recorta por data de CRIAÇÃO. Ver a decisão em `RadarDeRisco.tsx`.
 *
 * 🔴 As opções de ETAPA vêm de `useKanbanColunasEmpresa`, não de `useKanbanColunas`.
 * `useKanbanColunas(empresaId, funilId)` só busca quando recebe um `funilId`
 * (`enabled: !!funilId`), e este painel não escolhe funil nenhum — `dashboard_negocios_risco`
 * compara `p_etapas` direto contra `pedidos.status`, sem cruzar com `funil_id`
 * (migration 20260905120000). Chamar o hook que exige funil aqui deixaria a busca sempre
 * desligada e a lista de Etapa sempre vazia. `useKanbanColunasEmpresa` traz as colunas de TODOS
 * os funis da empresa só com o `empresaId`, e por isso o filtro deduplica por slug — dois funis
 * podem repetir a mesma etapa "de sistema" com o mesmo slug.
 */
interface Props {
  empresaId?: string;
  filtros: FiltrosDoPainel;
  onChange: (filtros: FiltrosDoPainel) => void;
  podeFiltrarPorResponsavel: boolean;
}

export function BarraDeFiltros({ empresaId, filtros, onChange, podeFiltrarPorResponsavel }: Props) {
  const { data: colunas } = useKanbanColunasEmpresa(empresaId);
  const { data: fabricantes } = useFabricantes();
  const { data: vendedores } = useVendedores();

  const vistos = new Set<string>();
  const abertas = (colunas ?? []).filter((c) => {
    if (['fechamento', 'perdido'].includes(c.slug)) return false;
    if (vistos.has(c.slug)) return false;
    vistos.add(c.slug);
    return true;
  });
  // O responsável só entra na conta quando o controle dele existe na barra. Sem a chave, o
  // `?responsaveis=` que tenha sobrado no endereço não é mandado para o servidor
  // (`RadarDeRisco.tsx`), então contá-lo aqui deixaria um crachá "1 filtro" e um botão "Limpar"
  // apontando para um recorte que não está mais acontecendo — e sem dizer qual filtro é.
  const temPeriodo = !!(filtros.dataDe && filtros.dataAte);
  const quantos =
    filtros.etapas.length +
    filtros.fabricantes.length +
    (podeFiltrarPorResponsavel ? filtros.responsaveis.length : 0) +
    (temPeriodo ? 1 : 0);

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <MultiSelectSearch
        placeholder="Etapa"
        options={abertas.map((c) => ({ value: c.slug, label: c.nome }))}
        value={filtros.etapas}
        onValueChange={(etapas) => onChange({ ...filtros, etapas })}
        className="w-[190px]"
      />
      <MultiSelectSearch
        placeholder="Fabricante"
        options={(fabricantes ?? []).map((f) => ({ value: f.id, label: f.nome }))}
        value={filtros.fabricantes}
        onValueChange={(fabricantes) => onChange({ ...filtros, fabricantes })}
        className="w-[190px]"
      />
      {podeFiltrarPorResponsavel && (
        <MultiSelectSearch
          placeholder="Responsável"
          options={(vendedores ?? []).map((v) => ({ value: v.id, label: v.nome }))}
          value={filtros.responsaveis}
          onValueChange={(responsaveis) => onChange({ ...filtros, responsaveis })}
          className="w-[190px]"
        />
      )}
      {/* O período vem para TODOS — não é gated pela chave, ao contrário do responsável acima. É
          opcional e nasce desligado; ver `PeriodoDoPainel` e o comentário de "sem período" abaixo. */}
      <PeriodoDoPainel
        dataDe={filtros.dataDe}
        dataAte={filtros.dataAte}
        onChange={(periodo) => onChange({ ...filtros, ...periodo })}
      />
      {quantos > 0 && (
        <>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {quantos} {quantos === 1 ? 'filtro' : 'filtros'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => onChange({ etapas: [], fabricantes: [], responsaveis: [] })}
          >
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        </>
      )}
    </div>
  );
}
