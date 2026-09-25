import { useMemo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { iniciais } from '@/lib/iniciais';
import { fotoDoResponsavel } from '@/lib/foto-do-responsavel';
import { useVendedores } from '@/hooks/use-clientes';
import { cn } from '@/lib/utils';

const DIM = { xs: 'h-5 w-5', sm: 'h-6 w-6' } as const;
const TXT = { xs: 'text-[8px]', sm: 'text-[9px]' } as const;

/**
 * Foto (ou iniciais) do responsável ao lado do nome — para os cards e listas de Tarefa e de
 * Negócio, onde antes aparecia só o nome em texto. É o mesmo círculo que a tabela do time da
 * tela "Hoje" já mostra; virou peça para não repetir o `Avatar`/`iniciais` em cada tela.
 *
 * A foto vem de `avatarUrl` quando quem chama já a tem (ex.: o objeto do vendedor no negócio);
 * senão é procurada por NOME em `useVendedores()` — é como o `UserProfilePopover` já resolve
 * hoje. Nome de membro da equipe raramente repete, então casar por nome é suficiente aqui.
 */
export function ResponsavelComFoto({
  nome,
  avatarUrl,
  mostrarNome = true,
  tamanho = 'sm',
  className,
}: {
  nome: string | null | undefined;
  avatarUrl?: string | null;
  mostrarNome?: boolean;
  tamanho?: 'xs' | 'sm';
  className?: string;
}) {
  const { data: vendedores = [] } = useVendedores();
  const url = useMemo(
    () => fotoDoResponsavel(nome, avatarUrl, vendedores),
    [avatarUrl, nome, vendedores],
  );

  if (!nome) return null;

  return (
    <span className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
      <Avatar className={cn('shrink-0', DIM[tamanho])}>
        {url && <AvatarImage src={url} alt="" className="h-full w-full object-cover" />}
        <AvatarFallback className={cn('bg-muted font-medium text-muted-foreground', TXT[tamanho])}>
          {iniciais(nome)}
        </AvatarFallback>
      </Avatar>
      {mostrarNome && <span className="truncate">{nome}</span>}
    </span>
  );
}
