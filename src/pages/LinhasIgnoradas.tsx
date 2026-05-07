import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, Trash2, RefreshCcw, Eye, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function LinhasIgnoradas() {
  const queryClient = useQueryClient();
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const { data: linhas, isLoading } = useQuery({
    queryKey: ['linhas_ignoradas_importacao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linhas_ignoradas_importacao')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('linhas_ignoradas_importacao')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linhas_ignoradas_importacao'] });
      toast.success('Linha removida');
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user.id) return;

      const { error } = await supabase
        .from('linhas_ignoradas_importacao')
        .delete()
        .eq('usuario_id', session.session.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linhas_ignoradas_importacao'] });
      toast.success('Todas as linhas foram removidas');
    },
  });

  const handleShowDetails = (linha: any) => {
    setSelectedRow(linha);
    setIsDetailsOpen(true);
  };

  return (
    <AppLayout 
      title="Linhas Ignoradas na Importação" 
      subtitle="Revise e ajuste dados que não puderam ser importados automaticamente"
    >
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <span>{linhas?.length || 0} linhas pendentes de revisão</span>
          </div>
          {linhas && linhas.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm('Tem certeza que deseja limpar todas as linhas ignoradas?')) {
                  clearAllMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar tudo
            </Button>
          )}
        </div>

        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Resumo dos Dados</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10">Carregando...</TableCell>
                </TableRow>
              ) : linhas?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Nenhuma linha ignorada encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                linhas?.map((linha) => (
                  <TableRow key={linha.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(linha.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {linha.tipo_importacao}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={linha.motivo_ignorado}>
                      {linha.motivo_ignorado || '—'}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-muted-foreground text-xs">
                      {JSON.stringify(linha.dados_originais)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleShowDetails(linha)}
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteMutation.mutate(linha.id)}
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Detalhes da Linha Ignorada</DialogTitle>
            <DialogDescription>
              Dados originais da planilha que não foram importados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto py-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Tipo de Importação</span>
                  <p className="capitalize">{selectedRow?.tipo_importacao}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Motivo</span>
                  <p className="text-destructive font-medium">{selectedRow?.motivo_ignorado || 'Campo obrigatório ausente'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground">Dados da Linha</span>
                <div className="bg-muted p-4 rounded-md font-mono text-xs space-y-2 border">
                  {selectedRow?.dados_originais && Object.entries(selectedRow.dados_originais).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex border-b border-muted-foreground/10 pb-1 last:border-0">
                      <span className="font-bold w-1/3 shrink-0">{key}:</span>
                      <span className="break-all">{String(value ?? '—')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Como resolver:</strong> Atualmente você pode copiar estes dados e adicioná-los manualmente através do botão "Novo" na página correspondente ({selectedRow?.tipo_importacao}). 
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
