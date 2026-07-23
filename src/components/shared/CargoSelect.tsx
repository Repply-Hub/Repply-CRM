import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const BASE_CARGOS = [
  'Comprador',
  'Engenheiro',
  'Arquiteto',
  'Mestre de Obras',
  'Gerente de Obras',
  'Diretor',
  'Sócio/Proprietário',
  'Financeiro',
  'Almoxarife',
];

const CUSTOM_CARGOS_KEY = 'contatos_custom_cargos';

interface CargoSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function CargoSelect({ value, onValueChange, placeholder = 'Selecione o cargo' }: CargoSelectProps) {
  const [customCargos, setCustomCargos] = useState<string[]>(() => {
    const saved = localStorage.getItem(CUSTOM_CARGOS_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [newCargoOpen, setNewCargoOpen] = useState(false);
  const [newCargoName, setNewCargoName] = useState('');

  // Cargos cadastrados como texto livre antes desse campo virar uma lista (ou digitados
  // por fora dos presets) continuam aparecendo selecionados em vez de sumir da tela.
  const allCargos = [...BASE_CARGOS, ...customCargos];
  const isUnknownValue = value && !allCargos.some(c => c.toLowerCase() === value.toLowerCase());

  const handleCreate = () => {
    const label = newCargoName.trim();
    if (!label) {
      toast.error('Informe um nome para o cargo');
      return;
    }
    if (allCargos.some(c => c.toLowerCase() === label.toLowerCase())) {
      toast.error('Esse cargo já existe');
      return;
    }
    const next = [...customCargos, label];
    setCustomCargos(next);
    localStorage.setItem(CUSTOM_CARGOS_KEY, JSON.stringify(next));
    onValueChange(label);
    setNewCargoName('');
    setNewCargoOpen(false);
    toast.success(`Cargo "${label}" criado`);
  };

  return (
    <>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === '__new__') {
            setNewCargoOpen(true);
            return;
          }
          onValueChange(v);
        }}
      >
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {isUnknownValue && (
            <SelectItem key={value} value={value}>{value}</SelectItem>
          )}
          {BASE_CARGOS.map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
          {customCargos.map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
          <SelectItem value="__new__" className="text-primary font-medium">+ Criar novo cargo…</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={newCargoOpen} onOpenChange={setNewCargoOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Novo Cargo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome do cargo</Label>
            <Input
              value={newCargoName}
              onChange={e => setNewCargoName(e.target.value)}
              placeholder="Ex: Comprador Técnico"
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCargoOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
