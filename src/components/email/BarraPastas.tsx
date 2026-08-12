import { useMemo, useState } from 'react';
import { Inbox, Tag, Loader2, ShieldAlert, Trash2, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { PastaEmail } from '@/hooks/use-email-pastas';

/** `null` = sem filtro de pasta (a aba Recebidos/Enviados manda). */
export type PastaSelecionada = string | null;

/** Ids das pastas de sistema que a barra oferece como filtro próprio. */
export const PASTA_SPAM = 'SPAM';
export const PASTA_LIXEIRA = 'TRASH';

/** Marcadores visíveis antes do "ver todos" — uma caixa com 900+ mensagens pode ter dezenas. */
const LIMITE_MARCADORES_VISIVEIS = 10;

interface Props {
  pastas: PastaEmail[];
  carregando: boolean;
  selecionada: PastaSelecionada;
  onSelecionar: (pastaId: PastaSelecionada) => void;
  /** Quantas mensagens a aba atual tem sem filtro de pasta. */
  totalSemFiltro: number;
  /** Contagem LOCAL por pasta: quantas o CRM tem e quantas estão por ler. */
  contagens: Map<string, { total: number; naoLidas: number }>;
}
/** Uma linha da barra — usada tanto pelas pastas de sistema quanto pelos marcadores. */

function Item({
  icone,
  rotulo,
  ativo,
  onClick,
  total,
  naoLidas,
}: {
  icone: React.ReactNode;
  rotulo: string;
  ativo: boolean;
  onClick: () => void;
  total: number;
  naoLidas: number;
}) {
  return (
    <button
      onClick={onClick}
      title={rotulo}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
        ativo
          ? 'bg-primary/10 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span className="shrink-0">{icone}</span>
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>

      {/* O número é o que ESTÁ AQUI, e por isso sempre bate com a lista.
          Antes vinha do `unread_count` do Gmail, que conta a etiqueta inteira
          no provedor — inclusive o que nunca foi sincronizado. Dava para clicar
          num "3" e encontrar lista vazia, que foi exatamente o que aconteceu
          com "006 - NAMBEI": 3 no Gmail, 0 aqui.

          O ponto ao lado sinaliza que há mensagem por ler, sem trocar o número
          por uma segunda grandeza. */}
      {naoLidas > 0 && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          title={`${naoLidas} por ler`}
        />
      )}
      {total > 0 && (
        <span className="shrink-0 text-xs tabular-nums opacity-70">{total}</span>
      )}
    </button>
  );
}

/**
 * Coluna de pastas e marcadores da caixa, no formato do Gmail/Bitrix.
 *
 * Mostra a organização que a pessoa JÁ TEM no provedor: primeiro as pastas de
 * sistema que fazem sentido como filtro (Spam e Lixeira), depois os marcadores
 * que ela mesma criou.
 *
 * Nada aqui interpreta o NOME da pasta. A organização é de quem tem a caixa;
 * tentar casar com o cadastro do CRM funcionaria numa empresa e quebraria na
 * seguinte, que usa outro critério.
 */
export function BarraPastas({
  pastas,
  carregando,
  selecionada,
  onSelecionar,
  totalSemFiltro,
  contagens,
}: Props) {
  const [buscaMarcador, setBuscaMarcador] = useState('');
  const [mostrarTodosMarcadores, setMostrarTodosMarcadores] = useState(false);

  const marcadores = pastas.filter((p) => !p.ehSistema);
  const contagem = (id: string) => contagens.get(id) ?? { total: 0, naoLidas: 0 };

  const marcadoresFiltrados = useMemo(() => {
    const termo = buscaMarcador.trim().toLowerCase();
    if (!termo) return marcadores;
    return marcadores.filter((p) => p.nome.toLowerCase().includes(termo));
  }, [marcadores, buscaMarcador]);

  const marcadoresVisiveis = mostrarTodosMarcadores
    ? marcadoresFiltrados
    : marcadoresFiltrados.slice(0, LIMITE_MARCADORES_VISIVEIS);
  const restantes = marcadoresFiltrados.length - marcadoresVisiveis.length;

  // Spam e Lixeira só aparecem se a caixa realmente as tem espelhadas —
  // provedor sem lixeira não ganha um item morto na barra.
  const temSpam = pastas.some((p) => p.pastaId === PASTA_SPAM);
  const temLixeira = pastas.some((p) => p.pastaId === PASTA_LIXEIRA);

  // Some inteira quando não há nada além de "Todas": uma coluna com um item só
  // rouba largura da lista de mensagens sem dar nada em troca.
  if (!carregando && marcadores.length === 0 && !temSpam && !temLixeira) return null;

  return (
    <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/20 md:flex">
      <div className="flex flex-col gap-0.5 p-2">
        <Item
          icone={<Inbox className="h-4 w-4" />}
          rotulo="Todas"
          ativo={selecionada === null}
          onClick={() => onSelecionar(null)}
          total={totalSemFiltro}
          naoLidas={0}
        />

        {temSpam && (
          <Item
            icone={<ShieldAlert className="h-4 w-4" />}
            rotulo="Spam"
            ativo={selecionada === PASTA_SPAM}
            onClick={() => onSelecionar(PASTA_SPAM)}
            {...contagem(PASTA_SPAM)}
          />
        )}
        {temLixeira && (
          <Item
            icone={<Trash2 className="h-4 w-4" />}
            rotulo="Lixeira"
            ativo={selecionada === PASTA_LIXEIRA}
            onClick={() => onSelecionar(PASTA_LIXEIRA)}
            {...contagem(PASTA_LIXEIRA)}
          />
        )}
      </div>

      {(marcadores.length > 0 || carregando) && (
        <div className="flex flex-col gap-0.5 border-t p-2">
          <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Marcadores
          </p>

          {/* Só compensa numa caixa com muitos marcadores — abaixo disso a
              lista inteira já cabe na tela e um campo de busca só ocuparia
              espaço para filtrar 3 itens. */}
          {marcadores.length > 8 && (
            <div className="relative px-1 pb-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buscaMarcador}
                onChange={(e) => setBuscaMarcador(e.target.value)}
                placeholder="Buscar marcador..."
                className="h-8 border-transparent bg-muted/50 pl-8 text-xs focus-visible:bg-background focus-visible:ring-1"
              />
            </div>
          )}

          {carregando && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando…
            </div>
          )}

          {!carregando && buscaMarcador && marcadoresFiltrados.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nenhum marcador encontrado para "{buscaMarcador}".
            </p>
          )}

          {marcadoresVisiveis.map((p) => (
            <Item
              key={p.id}
              icone={<Tag className="h-4 w-4" />}
              rotulo={p.nome}
              ativo={selecionada === p.pastaId}
              onClick={() => onSelecionar(p.pastaId)}
              {...contagem(p.pastaId)}
            />
          ))}

          {restantes > 0 && (
            <button
              onClick={() => setMostrarTodosMarcadores(true)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <ChevronDown className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Ver todos os marcadores</span>
              <span className="shrink-0 tabular-nums opacity-70">+{restantes}</span>
            </button>
          )}

          {/* Só some se a lista TODA continuar cabendo depois de recolher —
              senão sumiria o próprio caminho de volta ao estado compacto. */}
          {mostrarTodosMarcadores && marcadoresFiltrados.length > LIMITE_MARCADORES_VISIVEIS && (
            <button
              onClick={() => setMostrarTodosMarcadores(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Ver menos</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
