import { useMemo, useState } from 'react';
import { Star, X, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * O campo ÚNICO de responsáveis de um negócio, com a estrela marcando quem leva o valor.
 *
 * 🔴 UM CAMPO SÓ, e essa foi a correção de rumo do Lucas em 31/08/2026. O plano original
 * previa dois campos ("Responsável" e "Participantes"); ele pediu todos no mesmo campo, com
 * uma estrela dizendo quem é o principal. É mais honesto: a pessoa pensa "quem toca este
 * negócio", não "quem é titular e quem é coadjuvante".
 *
 * 🔴 A ESTRELA PRECISA APARECER porque o valor do negócio conta para UMA pessoa só (decisão do
 * dono). Sem a marca, alguém acrescenta um colega e move a comissão sem perceber — e o erro só
 * apareceria no Dashboard, semanas depois.
 *
 * COMPONENTE CONTROLADO E PURO. Ele não fala com o banco: recebe a lista e emite mudanças. É o
 * que o deixa servir os três lugares com regras de gravação diferentes — o cadastro (grava só
 * ao salvar), a edição (diferença ao salvar) e o painel de detalhe (grava na hora). Cada um
 * decide como persistir o `onChange`.
 *
 * 🔴 ACESSIBILIDADE: a estrela e o "×" são `<button>` IRMÃOS, nunca aninhados dentro de outro
 * elemento clicável — botão dentro de botão é HTML inválido e o clique vira loteria. A linha
 * da pessoa não é clicável; só os dois botões dela são.
 */

export interface PessoaDisponivel {
  id: string;
  nome: string;
  avatarUrl?: string | null;
}

export interface ResponsavelSelecionado {
  usuarioId: string;
  principal: boolean;
}

interface Props {
  /** Todas as pessoas da empresa que podem ser responsáveis. */
  pessoas: PessoaDisponivel[];
  value: ResponsavelSelecionado[];
  onChange: (proximo: ResponsavelSelecionado[]) => void;
  disabled?: boolean;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function CampoDeResponsaveis({ pessoas, value, onChange, disabled }: Props) {
  const [aberto, setAberto] = useState(false);

  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

  // O principal primeiro; o resto em ordem alfabética — a ordem de entrada não diz nada, e uma
  // lista que se reordena sozinha confunde. Mesma ordem que o hook de leitura usa.
  const ordenados = useMemo(() => {
    return [...value].sort((a, b) => {
      if (a.principal !== b.principal) return Number(b.principal) - Number(a.principal);
      const na = porId.get(a.usuarioId)?.nome ?? '';
      const nb = porId.get(b.usuarioId)?.nome ?? '';
      return na.localeCompare(nb, 'pt-BR');
    });
  }, [value, porId]);

  const disponiveis = useMemo(
    () => pessoas.filter((p) => !value.some((r) => r.usuarioId === p.id)),
    [pessoas, value],
  );

  const acrescentar = (usuarioId: string) => {
    // 🔴 O PRIMEIRO A ENTRAR JÁ É O PRINCIPAL. O negócio precisa sempre de um principal; se a
    // lista está vazia, quem chega leva a estrela. Os seguintes entram como participantes.
    const primeiro = value.length === 0;
    onChange([...value, { usuarioId, principal: primeiro }]);
    setAberto(false);
  };

  const remover = (usuarioId: string) => {
    const alvo = value.find((r) => r.usuarioId === usuarioId);
    // 🔴 NÃO SE REMOVE O PRINCIPAL. Ele leva o valor do negócio, e sair deixaria o negócio sem
    // dono. Passe a estrela para outro antes — a mesma regra que o banco impõe do outro lado.
    if (alvo?.principal) return;
    onChange(value.filter((r) => r.usuarioId !== usuarioId));
  };

  const tornarPrincipal = (usuarioId: string) => {
    onChange(value.map((r) => ({ ...r, principal: r.usuarioId === usuarioId })));
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {ordenados.map((r) => {
          const pessoa = porId.get(r.usuarioId);
          const nome = pessoa?.nome ?? 'Sem nome';
          return (
            <li
              key={r.usuarioId}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2 py-1.5',
                r.principal ? 'border-primary/40 bg-primary/5' : 'border-border',
              )}
            >
              <Avatar className="h-7 w-7 shrink-0">
                {pessoa?.avatarUrl && (
                  <img src={pessoa.avatarUrl} alt="" className="h-full w-full object-cover" />
                )}
                <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
                  {iniciais(nome)}
                </AvatarFallback>
              </Avatar>

              <span className="min-w-0 flex-1 truncate text-sm">{nome}</span>

              {/* A estrela: cheia e laranja no principal, vazia e clicável nos demais. */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => tornarPrincipal(r.usuarioId)}
                aria-pressed={r.principal}
                title={r.principal ? 'Leva o valor deste negócio' : 'Tornar quem leva o valor'}
                className={cn(
                  'shrink-0 rounded p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                  r.principal
                    ? 'text-primary'
                    : 'text-muted-foreground/50 hover:text-primary disabled:hover:text-muted-foreground/50',
                )}
              >
                <Star className={cn('h-4 w-4', r.principal && 'fill-primary')} aria-hidden />
                <span className="sr-only">
                  {r.principal ? `${nome} leva o valor` : `Tornar ${nome} quem leva o valor`}
                </span>
              </button>

              {/* Remover: some no principal — não há como removê-lo sem antes passar a estrela. */}
              {!r.principal && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remover(r.usuarioId)}
                  title="Remover"
                  className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                >
                  <X className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Remover {nome}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || disponiveis.length === 0}
            className="h-auto min-h-9 gap-1.5 text-muted-foreground"
          >
            <UserPlus className="h-4 w-4" />
            Adicionar pessoa
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar pessoa..." />
            <CommandList>
              <CommandEmpty>Ninguém mais para adicionar.</CommandEmpty>
              <CommandGroup>
                {disponiveis.map((p) => (
                  <CommandItem key={p.id} value={p.nome} onSelect={() => acrescentar(p.id)}>
                    <Avatar className="mr-2 h-6 w-6">
                      {p.avatarUrl && (
                        <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                      )}
                      <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                        {iniciais(p.nome)}
                      </AvatarFallback>
                    </Avatar>
                    {p.nome}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* A frase que fecha o laço da decisão do dono: quem leva o dinheiro está sempre à vista. */}
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          A estrela marca quem leva o valor do negócio.
        </p>
      )}
    </div>
  );
}
