import { useState, useMemo } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmpresaSelector } from '@/components/EmpresaSelector';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, User, Mail, Phone, Loader2, Pencil, Trash2, Building2, Calendar, Clock, MessageSquare, History, Factory, DollarSign, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { slugify } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePedidos } from '@/hooks/use-pedidos';
import { useHistoricoContatos } from '@/hooks/use-pedidos';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ContatoDetalhe = () => {
  const { slug } = useParams<{ slug: string }>();
  const id = useMemo(() => {
    if (!slug) return null;
    
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = slug.match(uuidRegex);
    
    if (match) return match[0];
    return slug;
  }, [slug]);

  const navigate = useNavigate();
  const { data: contatos, isLoading } = useContatos();

  // Debug log
  console.log('ContatoDetalhe - slug:', slug, 'extracted id:', id);
  if (contatos) {
    const found = contatos.find(c => c.id === id);
    console.log('ContatoDetalhe - contato encontrado:', !!found);
  }
  const { data: clientes } = useClientes();
  const { data: todosPedidosResult } = usePedidos(undefined, 0, 500);
  const todosPedidos = todosPedidosResult?.data ?? [];
  const updateContato = useUpdateContato();
  const deleteContato = useDeleteContato();
  const [editOpen, setEditOpen] = useState(false);

  const contato = contatos?.find(c => c.id === id);
  const clienteVinculado = clientes?.find(c => c.empresa === contato?.empresa);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');

  const pedidosRelacionados = todosPedidos?.filter(p => p.cliente_id === clienteVinculado?.id) || [];
  const { data: historico } = useHistoricoContatos(null); // Just for structure, we might need a specific filter or mock if no direct link exists yet.
  
  const copyInfo = async (label: string, value?: string | null) => {
    if (!value?.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      toast.success(`${label} copiado!`);
    } catch {
      toast.error('Não foi possível copiar a informação.');
    }
  };

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
            <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">
              {contato.nome_contato}
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-muted-foreground truncate">{contato.empresa || 'Sem empresa'}</span>
              {(contato as any).cargo && <Badge variant="secondary" className="text-[10px]">{(contato as any).cargo}</Badge>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 ml-auto">
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
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
        </div>
      }
    >
      <div className="p-4 sm:p-6 space-y-6 w-full">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Card: Perfil e Empresa */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Vínculo Corporativo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-xs text-muted-foreground mb-1">Empresa</p>
                <p className="text-base font-bold text-foreground truncate">{contato.empresa || 'Não informada'}</p>
                {clienteVinculado ? (
                  <Button 
                    variant="link" 
                    className="p-0 h-auto text-xs text-primary font-semibold mt-2 hover:no-underline"
                    onClick={() => {
                      const slug = slugify(clienteVinculado.empresa || 'cliente');
                      navigate(`/clientes/${slug}-${clienteVinculado.id}`);
                    }}
                  >
                    Ver perfil da empresa →
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2 w-full text-xs gap-1.5"
                    onClick={() => setVincularOpen(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Vincular Empresa
                  </Button>
                )}
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cargo</span>
                  <span className="font-medium">{(contato as any).cargo || '—'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Criado em</span>
                  <span className="font-medium">
                    {contato.created_at ? format(new Date(contato.created_at), "dd/MM/yyyy", { locale: ptBR }) : '—'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Contato Direto */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Canais de Comunicação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-muted/30 flex items-start gap-3 group hover:border-primary/30 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center border shadow-sm shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">E-mail Corporativo</p>
                    <p className="text-sm font-semibold text-foreground truncate">{contato.email || 'Não informado'}</p>
                    {contato.email && (
                      <Button 
                        variant="link" 
                        className="p-0 h-auto text-[11px] mt-1" 
                        onClick={() => navigate(`/emails?to=${encodeURIComponent(contato.email)}`)}
                      >
                        Enviar e-mail
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-xl border bg-muted/30 flex items-start gap-3 group hover:border-primary/30 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center border shadow-sm shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">Telefone / WhatsApp</p>
                    <p className="text-sm font-semibold text-foreground truncate">{contato.telefone || 'Não informado'}</p>
                    {contato.telefone && (
                      <Button variant="link" className="p-0 h-auto text-[11px] mt-1" onClick={() => copyInfo('Telefone', contato.telefone)}>
                        Copiar número
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Card: Resumo de Negócios */}
          <Card className="md:col-span-3">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <History className="h-4 w-4" /> Histórico de Negócios (Via Empresa)
              </CardTitle>
              <Badge variant="outline">{pedidosRelacionados.length} Registros</Badge>
            </CardHeader>
            <CardContent>
              {pedidosRelacionados.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed rounded-xl">
                  <p className="text-sm text-muted-foreground">Nenhum pedido vinculado a esta empresa.</p>
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Fabricante</TableHead>
                        <TableHead className="text-xs">Valor</TableHead>
                        <TableHead className="text-xs">Etapa</TableHead>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-right text-xs">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pedidosRelacionados.slice(0, 5).map(p => (
                        <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="font-medium text-sm">{(p as any).fabricante?.nome || '—'}</TableCell>
                          <TableCell className="text-sm font-semibold text-primary">
                            {(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] capitalize">{p.status.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(p.data_pedido), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/`)} className="h-8 text-xs">
                              Ver Negócio
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {pedidosRelacionados.length > 5 && (
                    <div className="p-3 bg-muted/10 text-center border-t">
                      <Button variant="link" className="text-xs h-auto p-0" onClick={() => clienteVinculado && navigate(`/clientes/${clienteVinculado.id}`)}>
                        Ver todos os {pedidosRelacionados.length} pedidos na página da empresa
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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

        <Dialog open={vincularOpen} onOpenChange={setVincularOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Vincular Empresa</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Selecione a Empresa</Label>
                <EmpresaSelector 
                  value={selectedEmpresaId} 
                  onValueChange={setSelectedEmpresaId} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVincularOpen(false)}>Cancelar</Button>
              <Button 
                onClick={async () => {
                  const emp = clientes?.find(c => c.id === selectedEmpresaId);
                  if (emp && id) {
                    try {
                      await updateContato.mutateAsync({
                        id,
                        empresa: emp.empresa
                      });
                      toast.success('Empresa vinculada com sucesso!');
                      setVincularOpen(false);
                    } catch (err: any) {
                      toast.error('Erro ao vincular: ' + err.message);
                    }
                  }
                }}
                disabled={!selectedEmpresaId || updateContato.isPending}
              >
                {updateContato.isPending ? 'Vinculando...' : 'Vincular'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
