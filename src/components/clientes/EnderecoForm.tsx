import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { maskCep, unmaskCep, fetchCepData, type EnderecoFields } from '@/lib/cep';

interface EnderecoFormProps {
  value: EnderecoFields;
  onChange: (v: EnderecoFields) => void;
  required?: boolean;
}

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    pedestrian?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
    house_number?: string;
  };
}

const UF_MAP: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amazonas': 'AM', 'Amapá': 'AP', 'Bahia': 'BA',
  'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES', 'Goiás': 'GO',
  'Maranhão': 'MA', 'Minas Gerais': 'MG', 'Mato Grosso do Sul': 'MS', 'Mato Grosso': 'MT',
  'Pará': 'PA', 'Paraíba': 'PB', 'Pernambuco': 'PE', 'Piauí': 'PI', 'Paraná': 'PR',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rondônia': 'RO', 'Roraima': 'RR',
  'Rio Grande do Sul': 'RS', 'Santa Catarina': 'SC', 'Sergipe': 'SE', 'São Paulo': 'SP',
  'Tocantins': 'TO',
};

export function EnderecoForm({ value, onChange, required }: EnderecoFormProps) {
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const skipNextSearchRef = useRef(false);

  const set = (field: keyof EnderecoFields, v: string) => {
    onChange({ ...value, [field]: v });
  };

  const handleCepChange = (raw: string) => {
    set('cep', maskCep(raw));
    setCepStatus('idle');
  };

  const handleCepBlur = async () => {
    const digits = unmaskCep(value.cep);
    if (digits.length !== 8) return;
    setCepStatus('loading');
    try {
      const data = await fetchCepData(digits);
      setCepStatus('valid');
      onChange({
        ...value,
        cep: maskCep(digits),
        logradouro: data.street || value.logradouro,
        bairro: data.neighborhood || value.bairro,
        cidade: data.city || value.cidade,
        uf: data.state || value.uf,
      });
      toast.success('CEP encontrado! Endereço preenchido.');
    } catch {
      setCepStatus('invalid');
      toast.error('CEP não encontrado');
    }
  };

  // Busca de sugestões de endereço via Nominatim com debounce
  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const query = value.logradouro.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        // Inclui cidade/uf na busca quando preenchidos para refinar resultados
        const contexto = [value.cidade, value.uf].filter(Boolean).join(', ');
        const q = contexto ? `${query}, ${contexto}, Brasil` : `${query}, Brasil`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&countrycodes=br&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
        if (!res.ok) throw new Error('Falha na busca');
        const data: AddressSuggestion[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.logradouro]);

  // Fecha sugestões ao clicar fora
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectSuggestion = (s: AddressSuggestion) => {
    const a = s.address ?? {};
    const logradouro = a.road || a.pedestrian || value.logradouro;
    const bairro = a.suburb || a.neighbourhood || value.bairro;
    const cidade = a.city || a.town || a.village || a.municipality || value.cidade;
    const uf = a.state ? (UF_MAP[a.state] ?? value.uf) : value.uf;
    const cep = a.postcode ? maskCep(a.postcode) : value.cep;
    const numero = a.house_number || value.numero;

    skipNextSearchRef.current = true;
    onChange({
      ...value,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      cep,
    });
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço</p>
      {/* Três colunas fixas dentro de um modal davam ~100px por campo no celular — logradouro
          cabia umas 8 letras. Empilha até o `sm` e só então volta a ser lado a lado. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>CEP</Label>
          <div className="relative">
            <Input
              value={value.cep}
              onChange={e => handleCepChange(e.target.value)}
              onBlur={handleCepBlur}
              placeholder="00000-000"
              maxLength={9}
              className={cepStatus === 'invalid' ? 'border-destructive' : cepStatus === 'valid' ? 'border-green-500' : ''}
            />
            {cepStatus === 'loading' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            {cepStatus === 'valid' && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Auto-preenche ao sair</p>
        </div>
        <div className="sm:col-span-2 relative" ref={containerRef}>
          <Label>Logradouro{required && ' *'}</Label>
          <div className="relative">
            <Input
              value={value.logradouro}
              onChange={e => set('logradouro', e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Digite para buscar (ex: Rua Guaramiranga)"
              autoComplete="off"
              required={required}
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              {suggestions.map((s, idx) => (
                <button
                  key={`${s.lat}-${s.lon}-${idx}`}
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-start gap-2 border-b border-border last:border-b-0"
                >
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <span className="leading-tight">{s.display_name}</span>
                </button>
              ))}
            </div>
          )}
          {showSuggestions && !searching && suggestions.length === 0 && value.logradouro.length >= 3 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg px-3 py-2 text-xs text-muted-foreground">
              Nenhum endereço encontrado.
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">Sugestões a partir de 3 caracteres</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>Número{required && ' *'}</Label>
          <Input value={value.numero} onChange={e => set('numero', e.target.value)} placeholder="Nº" required={required} />
        </div>
        <div className="sm:col-span-2">
          <Label>Complemento</Label>
          <Input value={value.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Sala, Bloco..." />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>Bairro</Label>
          <Input value={value.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
        </div>
        <div>
          <Label>Cidade</Label>
          <Input value={value.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
        </div>
        <div>
          <Label>UF</Label>
          <Input value={value.uf} onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" maxLength={2} />
        </div>
      </div>
    </div>
  );
}
