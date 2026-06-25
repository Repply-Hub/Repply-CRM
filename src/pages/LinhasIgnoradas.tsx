import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertTriangle, Trash2, Eye, ChevronDown, ChevronUp, FileSpreadsheet, RotateCcw, Loader2 } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useBulkImport } from '@/hooks/use-bulk-import';

const FIELD_LABELS: Record<string, string> = {
  empresa: 'Empresa', razao_social: 'Razão Social', tipo: 'Tipo', cnpj: 'CNPJ',
  email: 'E-mail', telefone: 'Telefone', logradouro: 'Logradouro', numero: 'Número',
  complemento: 'Complemento', bairro: 'Bairro', cidade: 'Cidade', uf: 'UF', cep: 'CEP',
  data_criacao: 'Data de Criação', cliente: 'Cliente', fabricante: 'Fabricante',
  obra: 'Obra', valor: 'Valor', observacoes: 'Observações', status: 'Status',
  data_pedido: 'Data do Pedido',
};

const REQUIRED_FIELDS: Record<string, Set<string>> = {
  clientes: new Set(['tipo']),
  negocios: new Set(['cliente', 'fabricante', 'valor']),
};

// Fields that are internal/processed and shouldn't be shown for editing
const SKIP_FIELDS = new Set([
  'usuario_id', 'cliente_id', 'fabricante_id', 'obra_id',
  'import_hash', 'campos_extras', '__dateError',
]);

// Fallback field list per type when dados_originais has only internal fields
const FALLBACK_FIELDS: Record<string, string[]> = {
  clientes: ['empresa', 'razao_social', 'tipo', 'cnpj', 'email', 'telefone', 'cidade', 'uf'],
  negocios: ['cliente', 'fabricante', 'obra', 'valor', 'status', 'data_pedido', 'observacoes'],
};

export default function LinhasIgnoradas() {
  const queryClient = useQueryClient();
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [retryRow, setRetryRow] = useState<any>(null);
  const [retryFields, setRetryFields] = useState<Record<string, string>>({});
  const [isRetrying, setIsRetrying] = useState(false);

  const { importClientes, importNegocios } = useBulkImport();

  const { data: linhas, isLoading } = useQuery({
    queryKey: ['linhas_ignoradas_importacao'],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('linhas_ignoradas_importacao')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { data, count };
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

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShowDetails = (linha: any) => {
    setSelectedRow(linha);
    setIsDetailsOpen(true);
  };

  const handleOpenRetry = (linha: any) => {
    const dados = linha.dados_originais ?? {};
    const visibleKeys = Object.keys(dados).filter(k => !SKIP_FIELDS.has(k));

    // If dados_originais only has internal fields, fall back to the standard field list
    const keys = visibleKeys.length > 0
      ? visibleKeys
      : (FALLBACK_FIELDS[linha.tipo_importacao] ?? []);

    const fields: Record<string, string> = {};
    keys.forEach(k => { fields[k] = String(dados[k] ?? ''); });
    setRetryFields(fields);
    setRetryRow(linha);
  };

  const handleRetrySubmit = async () => {
    if (!retryRow || isRetrying) return;
    setIsRetrying(true);
    try {
      // Delete the original row first — if it fails again the hook creates a fresh one
      await supabase.from('linhas_ignoradas_importacao').delete().eq('id', retryRow.id);

      const payload = [retryFields as Record<string, unknown>];
      const summary = retryRow.tipo_importacao === 'clientes'
        ? await importClientes(payload, retryRow.nome_arquivo)
        : await importNegocios(payload, retryRow.nome_arquivo);

      if (summary.inserted > 0) {
        toast.success('Linha importada com sucesso!');
        setRetryRow(null);
      }
      queryClient.invalidateQueries({ queryKey: ['linhas_ignoradas_importacao'] });
    } catch (err) {
      toast.error('Erro ao tentar importar: ' + (err as Error).message);
    } finally {
      setIsRetrying(false);
    }
  };

  const requiredForType = (tipo: string) => REQUIRED_FIELDS[tipo] ?? new Set<string>();

  return (
    <AppLayout
      title="Linhas Ignoradas na Importação"
      subtitle="Revise e ajuste dados que não puderam ser importados automaticamente"
    >
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <span>{linhas?.count ?? 0} linhas pendentes de revisão</span>
          </div>
          {linhas?.data && linhas.data.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar tudo
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Carregando...</div>
        ) : linhas?.data?.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border rounded-lg bg-card">
            Nenhuma linha ignorada encontrada.
          </div>
        ) : (
          <div className="space-y-3">
            {linhas?.data?.map((linha) => {
              const isExpanded = expandedIds.has(linha.id);
              const entries = Object.entries(linha.dados_originais ?? {});
              const preview = entries.slice(0, 3);

              return (
                <div key={linha.id} className="border rounded-lg bg-card overflow-hidden">
                  <div className="flex items-start justify-between gap-4 p-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="capitalize text-xs">
                            {linha.tipo_importacao}
                          </Badge>
                          {linha.nome_arquivo && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <FileSpreadsheet className="h-3 w-3 shrink-0" />
                              {linha.nome_arquivo}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(linha.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm text-destructive font-medium">
                          {linha.motivo_ignorado || 'Campo obrigatório ausente'}
                        </p>
                        <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                          {preview.map(([key, value]) => (
                            <div key={key} className="truncate">
                              <span className="font-semibold text-foreground/70">{key}:</span>{' '}
                              {String(value ?? '—')}
                            </div>
                          ))}
                          {entries.length > 3 && !isExpanded && (
                            <span className="text-muted-foreground/60">
                              +{entries.length - 3} campo(s) oculto(s)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(linha.id)}
                        title={isExpanded ? 'Recolher' : 'Expandir dados'}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => handleOpenRetry(linha)}
                        title="Tentar importar novamente"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleShowDetails(linha)}
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(linha.id)}
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-muted/40 px-4 py-3">
                      <div className="font-mono text-xs space-y-1.5">
                        {entries.map(([key, value]) => (
                          <div key={key} className="flex gap-2 border-b border-muted-foreground/10 pb-1 last:border-0">
                            <span className="font-bold text-foreground/70 w-1/3 shrink-0">{key}:</span>
                            <span className="break-all text-foreground/90">{String(value ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Retry dialog */}
      <Dialog open={!!retryRow} onOpenChange={(o) => !o && !isRetrying && setRetryRow(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Tentar importar novamente
            </DialogTitle>
            <DialogDescription>
              Edite os campos abaixo e confirme para tentar a importação.
              {retryRow?.motivo_ignorado && (
                <span className="block mt-1 text-destructive font-medium">
                  Motivo anterior: {retryRow.motivo_ignorado}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto py-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {Object.entries(retryFields).map(([key, value]) => {
                const isRequired = requiredForType(retryRow?.tipo_importacao).has(key);
                return (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`retry-${key}`} className="text-xs font-semibold">
                      {FIELD_LABELS[key] ?? key}
                      {isRequired && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Input
                      id={`retry-${key}`}
                      value={value}
                      onChange={(e) =>
                        setRetryFields(prev => ({ ...prev, [key]: e.target.value }))
                      }
                      className="h-8 text-sm"
                      disabled={isRetrying}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setRetryRow(null)} disabled={isRetrying}>
              Cancelar
            </Button>
            <Button onClick={handleRetrySubmit} disabled={isRetrying}>
              {isRetrying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isRetrying ? 'Importando...' : 'Confirmar e Importar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todas as linhas ignoradas?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as {linhas?.count ?? 0} linhas ignoradas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearAllMutation.mutate()}
              disabled={clearAllMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Limpar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                {selectedRow?.nome_arquivo && (
                  <div className="space-y-1 col-span-2">
                    <span className="text-xs font-semibold text-muted-foreground">Arquivo de Origem</span>
                    <p className="flex items-center gap-1.5 text-sm">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      {selectedRow.nome_arquivo}
                    </p>
                  </div>
                )}
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
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsDetailsOpen(false);
                handleOpenRetry(selectedRow);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Tentar importar
            </Button>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
