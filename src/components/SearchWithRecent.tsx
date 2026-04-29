import { useState, useEffect, useRef } from 'react';
import { Search, Clock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface SearchWithRecentProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  storageKey: string;
  className?: string;
  showAddressSuggestions?: boolean;
}

export function SearchWithRecent({
  value,
  onValueChange,
  placeholder = "Buscar...",
  storageKey,
  className,
  showAddressSuggestions = false,
}: SearchWithRecentProps) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const skipNextRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setRecent(JSON.parse(saved));
      } catch (e) {
        console.error('Error parsing recent searches', e);
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (!showAddressSuggestions) return;
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&countrycodes=br&q=${encodeURIComponent(
          query + ', Brasil',
        )}`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
        if (!res.ok) throw new Error('Falha');
        const data: AddressSuggestion[] = await res.json();
        setSuggestions(data);
        if (data.length > 0) setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, showAddressSuggestions]);

  const saveRecent = (term: string) => {
    if (!term.trim()) return;
    const termLower = term.trim().toLowerCase();
    const updated = [
      term.trim(),
      ...recent.filter(r => r.toLowerCase() !== termLower)
    ].slice(0, 5);
    setRecent(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const removeRecent = (e: React.MouseEvent, term: string) => {
    e.stopPropagation();
    const updated = recent.filter(r => r !== term);
    setRecent(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  return (
    <div className={cn("relative flex-1", className)}>
      <Popover open={open && recent.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={value}
              onChange={(e) => {
                onValueChange(e.target.value);
                if (!open) setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveRecent(value);
                  setOpen(false);
                }
              }}
              onBlur={() => {
                // Pequeno delay para permitir o clique nas sugestões
                setTimeout(() => {
                  if (value.trim()) saveRecent(value);
                }, 200);
              }}
              className="pl-9 h-10 w-full"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent 
          className="p-1 w-[var(--radix-popover-trigger-width)]" 
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="text-[10px] font-bold text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
            Buscas recentes
          </div>
          <div className="flex flex-col">
            {recent.map((term, i) => (
              <button
                key={i}
                onClick={() => {
                  onValueChange(term);
                  saveRecent(term);
                  setOpen(false);
                }}
                className="flex items-center justify-between gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{term}</span>
                </div>
                <X 
                  className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all shrink-0" 
                  onClick={(e) => removeRecent(e, term)}
                />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
