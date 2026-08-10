import { Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NomeNegocioFieldProps {
  nome: string;
  onNomeChange: (nome: string) => void;
  automatico: boolean;
  onAutomaticoChange: (automatico: boolean) => void;
  /** Prévia do nome automático ("empresa + fabricante") para exibir como placeholder/dica. */
  nomeAutomaticoPreview: string;
}

export function NomeNegocioField({
  nome,
  onNomeChange,
  automatico,
  onAutomaticoChange,
  nomeAutomaticoPreview,
}: NomeNegocioFieldProps) {
  return (
    <div className="space-y-2">
      <Label>Nome do Negócio</Label>
      <Input
        value={automatico ? nomeAutomaticoPreview : nome}
        onChange={(e) => onNomeChange(e.target.value)}
        disabled={automatico}
        placeholder="Nome do negócio"
      />
      <div className="flex items-center gap-1.5">
        <Checkbox
          id="nome-negocio-automatico"
          checked={automatico}
          onCheckedChange={(checked) => onAutomaticoChange(checked === true)}
        />
        <Label htmlFor="nome-negocio-automatico" className="text-xs font-normal text-muted-foreground cursor-pointer">
          Usar nome automático (Empresa + Fabricante)
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[260px]">
            <p className="text-xs">
              Quando marcado, o nome do negócio é preenchido automaticamente no formato "Empresa + Fabricante" e
              acompanha qualquer troca de cliente ou fabricante. Desmarque para definir um nome próprio.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
