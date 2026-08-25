import { useNavigate } from 'react-router-dom';
import { Loader2, User, Mail, Phone } from 'lucide-react';
import { slugify } from '@/lib/utils';
import { useContatosDaObra } from '@/hooks/use-obra-contatos';

/**
 * Contatos da construtora vinculados especificamente a esta obra — não os da
 * empresa cliente inteira, só quem foi marcado como responsável por este
 * canteiro (`contatos.obra_id`, ver migration `20260825180000_contato_vinculado_a_obra.sql`).
 */
export function ContatosDaObra({ obraId }: { obraId: string }) {
  const navigate = useNavigate();
  const { data: contatos, isLoading } = useContatosDaObra(obraId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando os contatos...
      </div>
    );
  }

  if (!contatos || contatos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Nenhum contato vinculado a esta obra</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Ao cadastrar ou editar um contato da empresa cliente, escolha esta obra no campo
          <strong> Obra</strong> para ele aparecer aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {contatos.map((c) => (
        <button
          key={c.id}
          onClick={() => navigate(`/contatos/${slugify(c.nomeContato || 'contato')}-${c.id}`)}
          className="w-full rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-sm font-medium">{c.nomeContato || 'Contato sem nome'}</span>
            {c.cargo && <span className="shrink-0 text-xs text-muted-foreground">· {c.cargo}</span>}
          </div>
          {(c.email || c.telefone) && (
            <div className="mt-1 flex flex-wrap items-center gap-3 pl-5 text-xs text-muted-foreground">
              {c.email && (
                <span className="flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3 shrink-0" /> {c.email}
                </span>
              )}
              {c.telefone && (
                <span className="flex items-center gap-1 truncate">
                  <Phone className="h-3 w-3 shrink-0" /> {c.telefone}
                </span>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
