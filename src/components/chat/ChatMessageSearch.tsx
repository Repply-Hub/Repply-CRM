import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatMessageSearchItem {
  id: string;
  texto: string | null | undefined;
}

interface ChatMessageSearchProps {
  messages: ChatMessageSearchItem[];
  onNavigate: (id: string) => void;
  onClose: () => void;
  placeholder?: string;
  className?: string;
}

/**
 * Busca client-side por texto sobre uma lista de mensagens já carregadas,
 * com navegação anterior/próximo entre os resultados. Compartilhada entre
 * o chat interno e (futuramente) a busca dentro de uma conversa de WhatsApp,
 * ambos os quais já usam o padrão scrollIntoView + highlight temporário via
 * onNavigate.
 */
export function ChatMessageSearch({ messages, onNavigate, onClose, placeholder = 'Buscar nesta conversa...', className }: ChatMessageSearchProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  // `messages` chega em ordem cronológica (mais antiga primeiro) — inverte
  // para que o primeiro resultado seja sempre a ocorrência mais recente,
  // como na busca dentro de uma conversa no WhatsApp mobile.
  const matches = useMemo(() => {
    const termo = query.trim().toLowerCase();
    if (!termo) return [];
    return messages.filter((m) => m.texto?.toLowerCase().includes(termo)).reverse();
  }, [query, messages]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (matches.length === 0) return;
    const idx = Math.min(activeIndex, matches.length - 1);
    onNavigateRef.current(matches[idx].id);
  }, [activeIndex, matches]);

  function goTo(delta: number) {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev + delta + matches.length) % matches.length);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      goTo(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className={cn('flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20', className)}>
      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-8 flex-1 min-w-0 text-sm"
      />
      <span className="text-xs text-muted-foreground shrink-0 tabular-nums min-w-[5.5rem] text-center">
        {query.trim() ? (matches.length > 0 ? `${activeIndex + 1} de ${matches.length}` : 'Nenhum resultado') : ''}
      </span>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={matches.length === 0} onClick={() => goTo(-1)} title="Resultado anterior">
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={matches.length === 0} onClick={() => goTo(1)} title="Próximo resultado">
        <ChevronDown className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} title="Fechar busca">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
