import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PedidoHistoricoStatus } from '@/hooks/use-pedidos';

const LIMITE_INICIAL = 3;

interface Props {
  historico: PedidoHistoricoStatus[] | undefined;
  stageLabel: (status: string) => string;
}

function formatValor(campo: string, valor: string | null): string | null {
  if (valor === null) return null;
  if (campo === 'Valor total') {
    const num = Number(valor);
    return Number.isFinite(num) ? num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : valor;
  }
  return valor;
}

function CampoEntryDescription({ entry }: { entry: PedidoHistoricoStatus }) {
  const campo = entry.campo ?? '';
  const anterior = formatValor(campo, entry.valor_anterior_txt);
  const novo = formatValor(campo, entry.valor_novo_txt);

  if (anterior === null && novo !== null) {
    return <>Definiu <span className="font-medium">{campo}</span> como <span className="font-medium">"{novo}"</span></>;
  }
  if (anterior !== null && novo === null) {
    return <>Removeu <span className="font-medium">{campo}</span> (era "{anterior}")</>;
  }
  return (
    <>
      Alterou <span className="font-medium">{campo}</span> de "{anterior}" para{' '}
      <span className="font-medium">"{novo}"</span>
    </>
  );
}

function HistoricoTimeline({ entries, stageLabel }: { entries: PedidoHistoricoStatus[]; stageLabel: (status: string) => string }) {
  return (
    <ol className="space-y-4">
      {entries.map((entry, idx) => (
        <li key={entry.id} className="relative pl-6">
          {idx < entries.length - 1 && (
            <span className="absolute left-[5px] top-4 bottom-[-16px] w-px bg-border" />
          )}
          <span className="absolute left-0 top-1 h-2.5 w-2.5 rounded-full bg-primary" />
          <p className="text-sm">
            {entry.tipo === 'campo' ? (
              <CampoEntryDescription entry={entry} />
            ) : entry.status_anterior ? (
              <>
                Movido de <span className="font-medium">{stageLabel(entry.status_anterior)}</span>{' '}
                para <span className="font-medium">{stageLabel(entry.status_novo!)}</span>
              </>
            ) : (
              <>Negócio criado na etapa <span className="font-medium">{stageLabel(entry.status_novo!)}</span></>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            {entry.usuario?.nome && ` · ${entry.usuario.nome}`}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function HistoricoMovimentacaoNegocio({ historico, stageLabel }: Props) {
  const [modalAberto, setModalAberto] = useState(false);

  if (!historico || historico.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada ainda.</p>;
  }

  const visiveis = historico.slice(0, LIMITE_INICIAL);
  const restantes = historico.length - visiveis.length;

  return (
    <>
      <HistoricoTimeline entries={visiveis} stageLabel={stageLabel} />
      {restantes > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setModalAberto(true)}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5 mr-1" />
          Ver mais ({restantes})
        </Button>
      )}

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de Movimentação</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <HistoricoTimeline entries={historico} stageLabel={stageLabel} />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
