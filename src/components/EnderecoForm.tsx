import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { maskCep, unmaskCep, fetchCepData, type EnderecoFields } from '@/lib/cep';

interface EnderecoFormProps {
  value: EnderecoFields;
  onChange: (v: EnderecoFields) => void;
}

const UF_OPTIONS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

export function EnderecoForm({ value, onChange }: EnderecoFormProps) {
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');

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

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço</p>
      <div className="grid grid-cols-3 gap-3">
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
        <div className="col-span-2">
          <Label>Logradouro</Label>
          <Input value={value.logradouro} onChange={e => set('logradouro', e.target.value)} placeholder="Rua, Avenida..." />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Número</Label>
          <Input value={value.numero} onChange={e => set('numero', e.target.value)} placeholder="Nº" />
        </div>
        <div className="col-span-2">
          <Label>Complemento</Label>
          <Input value={value.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Sala, Bloco..." />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
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
