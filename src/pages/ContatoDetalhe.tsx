import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useContatos, useClientes } from '@/hooks/use-clientes';
import { useUpdateContato, useDeleteContato } from '@/hooks/use-mutations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, User, Mail, Phone, Loader2, Pencil, Trash2, Building2, Calendar, Clock, MessageSquare, History, Factory, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePedidos } from '@/hooks/use-pedidos';
import { useHistoricoContatos } from '@/hooks/use-pedidos';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ContatoDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contatos, isLoading } = useContatos();
  const { data: clientes } = useClientes();
  const { data: todosPedidos } = usePedidos();
  const updateContato = useUpdateContato();
  const deleteContato = useDeleteContato();
  const [editOpen, setEditOpen] = useState(false);

  const contato = contatos?.find(c => c.id === id);
  const clienteVinculado = clientes?.find(c => c.empresa === contato?.empresa);

  const pedidosRelacionados = todosPedidos?.filter(p => p.cliente_id === clienteVinculado?.id) || [];
  const { data: historico } = useHistoricoContatos(null); // Just for structure, we might need a specific filter or mock if no direct link exists yet.

  const [editData, setEditData] = useState({
    nome_contato: '',
    email: '',
    telefone: '',
    cargo: '',
    empresa: '',
  });

  const openEdit = () => {
    if (!contato) return;
    setEditData({
      nome_contato: contato.nome_contato ?? '',
      email: contato.email ?? '',
      telefone: contato.telefone ?? '',
      cargo: (contato as any).cargo ?? '',
      empresa: contato.empresa ?? '',
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await updateContato.mutateAsync({
        id,
        nome_contato: editData.nome_contato,
        email: editData.email || undefined,
        telefone: editData.telefone || undefined,
        cargo: editData.cargo || undefined,
        empresa: editData.empresa || undefined,
      });
      toast.success('Contato atualizado com sucesso!');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!contato) {
    return (
      <AppLayout>
        <div className="p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <p className="text-muted-foreground mt-8 text-center">Contato não encontrado.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      headerContent={
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <SidebarTrigger className="shrink-0 h-8 w-8 md:hidden" />
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-foreground tracking-tight truncate">
              {contato.nome_contato}
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-muted-foreground truncate">{contato.empresa || 'Sem empresa'}</span>
              {(contato as any).cargo && <Badge variant="secondary" className="text-[10px]">{(contato as any).cargo}</Badge>}
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 ml-auto" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Informações de Contato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <p className="text-sm font-medium">{contato.email || 'Não informado'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <p className="text-sm font-medium">{contato.telefone || 'Não informado'}</p>
                </div>
              </div>
              {(contato as any).cargo && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cargo</p>
                    <p className="text-sm font-medium">{(contato as any).cargo}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Empresa Vinculada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Empresa</p>
                  <p className="text-sm font-medium truncate">{contato.empresa || 'Não informada'}</p>
                </div>
                {clienteVinculado && (
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/clientes/${clienteVinculado.id}`)}>
                    Ver Detalhes
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir Contato
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. O contato "{contato.nome_contato}" será removido permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await deleteContato.mutateAsync(id!);
                      toast.success('Contato excluído com sucesso!');
                      navigate('/clientes');
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Contato</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label>Nome do Contato</Label>
                <Input 
                  value={editData.nome_contato} 
                  onChange={e => setEditData(d => ({ ...d, nome_contato: e.target.value }))} 
                  required 
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input 
                  type="email" 
                  value={editData.email} 
                  onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} 
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input 
                  value={editData.telefone} 
                  onChange={e => setEditData(d => ({ ...d, telefone: e.target.value }))} 
                />
              </div>
              <div>
                <Label>Cargo</Label>
                <Input 
                  value={editData.cargo} 
                  onChange={e => setEditData(d => ({ ...d, cargo: e.target.value }))} 
                />
              </div>
              <div>
                <Label>Empresa</Label>
                <Input 
                  value={editData.empresa} 
                  onChange={e => setEditData(d => ({ ...d, empresa: e.target.value }))} 
                />
              </div>
              <Button type="submit" className="w-full" disabled={updateContato.isPending}>
                {updateContato.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default ContatoDetalhe;
