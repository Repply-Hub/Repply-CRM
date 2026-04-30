import { useState, useEffect, useRef } from 'react';
import { Search, Clock, X, Loader2, MapPin } from 'lucide-react';
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

  const selectSuggestion = (s: AddressSuggestion) => {
    skipNextRef.current = true;
    onValueChange(s.display_name);
    saveRecent(s.display_name);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className={cn("relative flex-1", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Popover open={open && (recent.length > 0 || suggestions.length > 0 || searching)} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Input
              placeholder={placeholder}
              value={value}
              onChange={(e) => {
                onValueChange(e.target.value);
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveRecent(value);
                  setOpen(false);
                }
              }}
              onFocus={() => {
                setOpen(true);
              }}
              className="pl-9 h-10 w-full"
            />
          </PopoverTrigger>
          <PopoverContent 
            className="p-1 w-[var(--radix-popover-trigger-width)] max-h-[350px] overflow-y-auto" 
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {suggestions.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-bold text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
                  Sugestões de endereços
                </div>
                <div className="flex flex-col">
                  {suggestions.map((s, idx) => (
                    <button
                      key={`s-${idx}`}
                      onClick={() => selectSuggestion(s)}
                      className="flex items-start gap-2 px-2 py-2 text-sm hover:bg-muted rounded-md transition-colors text-left"
                    >
                      <MapPin className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                      <span className="truncate leading-tight">{s.display_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recent.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
                  Buscas recentes
                </div>
                <div className="flex flex-col">
                  {recent.map((term, i) => (
                    <button
                      key={`r-${i}`}
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
              </div>
            )}

            {!searching && suggestions.length === 0 && recent.length === 0 && (
               <div className="px-2 py-3 text-xs text-muted-foreground text-center italic">
                 Nenhuma sugestão ou busca recente
               </div>
            )}
          </PopoverContent>
        </Popover>
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground z-10" />
        )}
      </div>
    </div>
  );
}
