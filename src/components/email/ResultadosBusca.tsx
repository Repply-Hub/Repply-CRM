import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, CornerUpLeft, Inbox, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type EnderecoDoEmail, quemDoResultado } from './email-enderecos';

/**
 * Um e-mail no resultado da BUSCA GLOBAL (recebidos e enviados, de qualquer
 * marcador). Carrega o que a linha mostra E o que o leitor precisa para abrir a
 * conversa.
 */
export interface ResultadoBusca {
  id: string;
  tipo: 'sent' | 'received';
  /** "Nome <email>" — remetente (recebido) ou a caixa da empresa (enviado). */
  remetente: string;
  destinatarios: EnderecoDoEmail[];
  cc: EnderecoDoEmail[];
  bcc: EnderecoDoEmail[];
  assunto: string | null;
  snippet: string;
  data: string | null;
  lido?: boolean;
  gmail_message_id: string | null;
  threadId: string | null;
  caixaOrigem: string | null;
}

interface Props {
  resultados: ResultadoBusca[];
  total: number;
  carregando: boolean;
  termo: string;
  pagina: number;
  tamanhoPagina: number;
  onPagina: (p: number) => void;
  onAbrir: (r: ResultadoBusca) => void;
}

export function ResultadosBusca({
  resultados,
  total,
  carregando,
  termo,
  pagina,
  tamanhoPagina,
  onPagina,
  onAbrir,
}: Props) {
  const temMais = (pagina + 1) * tamanhoPagina < total;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2 text-sm text-muted-foreground">
        <Search className="h-4 w-4" />
        <span className="truncate">
          {carregando
            ? 'Buscando em todos os e-mails…'
            : `${total} resultado${total === 1 ? '' : 's'} para “${termo}” em todos os e-mails`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!carregando && resultados.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <Search className="h-6 w-6 opacity-50" />
            Nenhum e-mail encontrado para “{termo}”.
          </div>
        ) : (
          resultados.map((r) => {
            const naoLida = r.tipo === 'received' && r.lido === false;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onAbrir(r)}
                className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <span
                  className="shrink-0 text-muted-foreground"
                  title={r.tipo === 'sent' ? 'Enviado' : 'Recebido'}
                >
                  {r.tipo === 'sent' ? (
                    <CornerUpLeft className="h-4 w-4" />
                  ) : (
                    <Inbox className="h-4 w-4" />
                  )}
                </span>
                <span
                  className={cn(
                    'w-40 shrink-0 truncate text-sm',
                    naoLida ? 'font-bold text-foreground' : 'font-medium text-foreground',
                  )}
                >
                  {quemDoResultado(r)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className={naoLida ? 'font-semibold text-foreground' : 'text-foreground'}>
                    {r.assunto || '(sem assunto)'}
                  </span>
                  {r.snippet && (
                    <span className="text-muted-foreground"> — {r.snippet}</span>
                  )}
                </span>
                {naoLida && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="não lida" />
                )}
                {r.data && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(r.data), 'dd/MM/yyyy')}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {(pagina > 0 || temMais) && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2 text-sm text-muted-foreground">
          {carregando && <Loader2 className="mr-auto h-3.5 w-3.5 animate-spin" />}
          <span>página {pagina + 1}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={pagina === 0}
            onClick={() => onPagina(pagina - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!temMais}
            onClick={() => onPagina(pagina + 1)}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
