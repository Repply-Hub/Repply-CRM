import { useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useOrigensPedido } from '@/hooks/use-origens-pedido';
import { CentralDeOrigensDialog } from '@/components/shared/CentralDeOrigensDialog';

// Lista usada só como rede enquanto a consulta de `origens_pedido` não volta (ou antes
// da migration 20260903150000 rodar). Depois disso a lista vem do banco, por empresa, e
// o gestor a edita na Central de Origens. Mantida em sincronia com a seed da migration.
const BASE_ORIGENS = [
  { valor: 'recompra', nome: 'Recompra' },
  { valor: 'prospeccao_ativa', nome: 'Prospecção Ativa' },
  { valor: 'indicacao', nome: 'Indicação' },
  { valor: 'obra_nova', nome: 'Obra Nova' },
];

const ABRIR_CENTRAL = '__central__';
// Radix Select não aceita item com value vazio, então "desmarcar" usa um valor
// sentinela que o onValueChange traduz de volta para '' (sem origem).
const SEM_ORIGEM = '__nenhuma__';

/** Slug antigo/desconhecido vira algo legível ("evento_construcao" → "Evento construcao"). */
function rotularValor(valor: string): string {
  const limpo = valor.replace(/_/g, ' ').trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

interface OrigemLeadSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Campo "Origem" do negócio. A lista vive em `origens_pedido`, por empresa; o gestor a
 * gerencia pela Central de Origens (item no fim do dropdown). O valor gravado em
 * `pedidos.origem_lead` é o `valor` (slug), estável a renomeações.
 */
export function OrigemLeadSelect({
  value,
  onValueChange,
  placeholder = 'Selecionar origem',
  className,
}: OrigemLeadSelectProps) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const ehGestor =
    profile?.role === 'gestor' || profile?.role === 'admin' || profile?.role === 'empresa';

  const { data: origensDoBanco } = useOrigensPedido(empresaId);
  const [centralOpen, setCentralOpen] = useState(false);

  // Antes da migration / enquanto carrega, cai na lista embutida para o campo não ficar vazio.
  const opcoes =
    origensDoBanco && origensDoBanco.length > 0
      ? origensDoBanco.map((o) => ({ valor: o.valor, nome: o.nome }))
      : BASE_ORIGENS;

  // Origem gravada como slug fora da lista (custom antigo do localStorage, ou importação)
  // continua aparecendo selecionada em vez de sumir da tela.
  const isUnknownValue = value && !opcoes.some((o) => o.valor === value);

  return (
    <>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === ABRIR_CENTRAL) {
            setCentralOpen(true);
            return;
          }
          onValueChange(v === SEM_ORIGEM ? '' : v);
        }}
      >
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {value && (
            <SelectItem value={SEM_ORIGEM} className="text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />
                Sem origem
              </span>
            </SelectItem>
          )}
          {isUnknownValue && (
            <SelectItem key={value} value={value}>{rotularValor(value)}</SelectItem>
          )}
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>{o.nome}</SelectItem>
          ))}
          {ehGestor && (
            <SelectItem value={ABRIR_CENTRAL} className="text-primary font-medium">
              <span className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Central de origens
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {ehGestor && (
        <CentralDeOrigensDialog
          open={centralOpen}
          onOpenChange={setCentralOpen}
          empresaId={empresaId}
        />
      )}
    </>
  );
}
