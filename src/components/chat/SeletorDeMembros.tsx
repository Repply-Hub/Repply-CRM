import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users2, Search } from 'lucide-react';

export interface MembroSelecionavel {
  id: string;
  nome: string;
  email?: string;
  role: string;
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

const COLORS = ['bg-primary', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500'];
function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function SeletorDeMembros({
  titulo, membros, meuId, selecionados, onChange, altura = 'h-[220px]',
}: {
  titulo: string;
  membros: MembroSelecionavel[];
  meuId: string | null;
  selecionados: string[];
  onChange: (ids: string[]) => void;
  altura?: string;
}) {
  const [busca, setBusca] = useState('');
  const outros = membros.filter((m) => m.id !== meuId);
  const todosMarcados = outros.length > 0 && outros.every((m) => selecionados.includes(m.id));
  const filtrados = outros.filter((m) => m.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  const alternar = (id: string) =>
    onChange(selecionados.includes(id) ? selecionados.filter((m) => m !== id) : [...selecionados, id]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{titulo}</Label>
        {outros.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(todosMarcados ? [] : outros.map((m) => m.id))}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            {todosMarcados ? 'Remover todos' : 'Selecionar todos'}
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Buscar membro..." value={busca} onChange={(e) => setBusca(e.target.value)} className="h-8 pl-8 text-xs" />
      </div>
      <ScrollArea className={`${altura} border rounded-lg p-2`}>
        <div className="space-y-1">
          {outros.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
              <Users2 className="h-8 w-8 opacity-30" />
              <p className="text-xs text-center">Nenhum outro membro na sua empresa. Cadastre funcionários primeiro.</p>
            </div>
          )}
          {outros.length > 0 && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
              <Search className="h-8 w-8 opacity-30" />
              <p className="text-xs text-center">Nenhum membro encontrado para "{busca}".</p>
            </div>
          )}
          {filtrados.map((m) => (
            <label key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors">
              <Checkbox checked={selecionados.includes(m.id)} onCheckedChange={() => alternar(m.id)} />
              <Avatar className="h-7 w-7">
                <AvatarFallback className={`${colorForId(m.id)} text-white text-[9px] font-semibold`}>
                  {getInitials(m.nome)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{m.nome}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
              </div>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
