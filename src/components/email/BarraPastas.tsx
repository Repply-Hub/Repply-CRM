import { Inbox, Tag, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PastaEmail } from '@/hooks/use-email-pastas';

/** `null` = sem filtro de pasta (a aba Recebidos/Enviados manda). */
export type PastaSelecionada = string | null;

/** Ids das pastas de sistema que a barra oferece como filtro próprio. */
export const PASTA_SPAM = 'SPAM';
export const PASTA_LIXEIRA = 'TRASH';

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
        'flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
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
  const marcadores = pastas.filter((p) => !p.ehSistema);
  const contagem = (id: string) => contagens.get(id) ?? { total: 0, naoLidas: 0 };

  // Spam e Lixeira só aparecem se a caixa realmente as tem espelhadas —
  // provedor sem lixeira não ganha um item morto na barra.
  const temSpam = pastas.some((p) => p.pastaId === PASTA_SPAM);
  const temLixeira = pastas.some((p) => p.pastaId === PASTA_LIXEIRA);

  // Some inteira quando não há nada além de "Todas": uma coluna com um item só
  // rouba largura da lista de mensagens sem dar nada em troca.
  if (!carregando && marcadores.length === 0 && !temSpam && !temLixeira) return null;

  return (
    <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/20 md:flex">
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

      {marcadores.length > 0 && (
        <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Marcadores
        </p>
      )}

      {carregando && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Carregando…
        </div>
      )}

      {marcadores.map((p) => (
        <Item
          key={p.id}
          icone={<Tag className="h-4 w-4" />}
          rotulo={p.nome}
          ativo={selecionada === p.pastaId}
          onClick={() => onSelecionar(p.pastaId)}
          {...contagem(p.pastaId)}
        />
      ))}
    </aside>
  );
}
