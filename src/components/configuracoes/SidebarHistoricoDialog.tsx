import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, History, RotateCcw, UserCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useVendedores } from '@/hooks/use-clientes';
import {
  useSidebarEmpresaPadraoHistorico,
  useSaveSidebarEmpresaPadrao,
} from '@/hooks/use-sidebar-empresa-padrao';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId?: string;
}

export function SidebarHistoricoDialog({ open, onOpenChange, empresaId }: Props) {
  const { data: historico = [], isLoading } = useSidebarEmpresaPadraoHistorico(empresaId);
  const { data: vendedores = [] } = useVendedores();
  const restaurar = useSaveSidebarEmpresaPadrao();

  const getNome = (userId: string | null) => {
    if (!userId) return 'Desconhecido';
    return vendedores.find(v => v.user_id === userId)?.nome ?? 'Usuário removido';
  };

  const handleRestaurar = (items: typeof historico[number]['items']) => {
    restaurar.mutate(items, {
      onSuccess: () => toast.success('Versão restaurada como padrão da empresa!'),
      onError: () => toast.error('Erro ao restaurar versão'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Histórico da sidebar padrão
          </DialogTitle>
          <DialogDescription>
            Versões salvas como padrão da empresa, da mais recente para a mais antiga.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : historico.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <History className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum padrão salvo ainda.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {historico.map((entry, index) => {
              const visibleCount = entry.items.filter(i => i.visible).length;
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 flex items-start gap-2.5">
                    <UserCircle className="h-8 w-8 text-primary/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{getNome(entry.salvo_por)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {visibleCount} item(ns) visível(is)
                        {index === 0 && ' · versão atual'}
                      </p>
                    </div>
                  </div>
                  {index !== 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 shrink-0"
                      disabled={restaurar.isPending}
                      onClick={() => handleRestaurar(entry.items)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
