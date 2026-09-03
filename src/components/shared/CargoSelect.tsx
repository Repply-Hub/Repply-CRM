import { useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useCargosContato } from '@/hooks/use-cargos-contato';
import { CentralDeCargosDialog } from '@/components/shared/CentralDeCargosDialog';

// Lista usada só como rede enquanto a consulta de `cargos_contato` não volta (ou antes
// da migration 20260903140000 rodar). Depois disso a lista vem do banco, por empresa, e
// o gestor a edita na Central de Cargos. Mantida em sincronia com a seed da migration.
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

const ABRIR_CENTRAL = '__central__';
// Radix Select não aceita item com value vazio, então "desmarcar" usa um valor
// sentinela que o onValueChange traduz de volta para '' (sem cargo).
const SEM_CARGO = '__nenhum__';

interface CargoSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function CargoSelect({ value, onValueChange, placeholder = 'Selecione o cargo' }: CargoSelectProps) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const ehGestor =
    profile?.role === 'gestor' || profile?.role === 'admin' || profile?.role === 'empresa';

  const { data: cargosDoBanco } = useCargosContato(empresaId);
  const [centralOpen, setCentralOpen] = useState(false);

  // Antes da migration / enquanto carrega, cai na lista embutida para o campo não ficar vazio.
  const nomes =
    cargosDoBanco && cargosDoBanco.length > 0
      ? cargosDoBanco.map((c) => c.nome)
      : BASE_CARGOS;

  // Cargo gravado como texto livre (antes desse campo virar lista, ou digitado por fora)
  // continua aparecendo selecionado em vez de sumir da tela.
  const isUnknownValue = value && !nomes.some((n) => n.toLowerCase() === value.toLowerCase());

  return (
    <>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === ABRIR_CENTRAL) {
            setCentralOpen(true);
            return;
          }
          onValueChange(v === SEM_CARGO ? '' : v);
        }}
      >
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {value && (
            <SelectItem value={SEM_CARGO} className="text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />
                Sem cargo
              </span>
            </SelectItem>
          )}
          {isUnknownValue && (
            <SelectItem key={value} value={value}>{value}</SelectItem>
          )}
          {nomes.map((n) => (
            <SelectItem key={n} value={n}>{n}</SelectItem>
          ))}
          {ehGestor && (
            <SelectItem value={ABRIR_CENTRAL} className="text-primary font-medium">
              <span className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Central de cargos
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {ehGestor && (
        <CentralDeCargosDialog
          open={centralOpen}
          onOpenChange={setCentralOpen}
          empresaId={empresaId}
        />
      )}
    </>
  );
}
