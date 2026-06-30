import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useClientes, useContatos } from '@/hooks/use-clientes';
import { usePedidos } from '@/hooks/use-pedidos';
import { useUpdateCliente, useDeleteCliente, useCreateContato, useDeleteContato, useCreateObra, useUpdateContato } from '@/hooks/use-mutations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Building2, Store, User, MapPin, Mail, Phone, Plus, Loader2, Pencil, Trash2, ChevronDown, Users, X, HardHat } from 'lucide-react';
import { KANBAN_STAGES } from '@/data/mockData';
import { toast } from 'sonner';
import { EnderecoForm } from '@/components/EnderecoForm';
import { emptyEndereco, enderecoToString, stringToEndereco, type EnderecoFields } from '@/lib/cep';
import { ListPagination } from '@/components/ListPagination';
import { slugify } from '@/lib/utils';

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User, condominio: Building2, hospital: Building2, distribuidor: Store, hotel: Building2, escola: Building2, instalador: User };
const tipoLabels: Record<string, string> = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física', condominio: 'Condomínio', hospital: 'Hospital', distribuidor: 'Distribuidor', hotel: 'Hotel', escola: 'Escola', instalador: 'Instalador' };

const stageColors: Record<string, string> = {
  novo_lead: 'bg-kanban-new text-white',
  elaboracao: 'bg-kanban-budget text-white',
  enviado: 'bg-kanban-sent text-white',
  negociacao: 'bg-kanban-negotiation text-white',
  fechamento: 'bg-kanban-closed text-white',
};

const ClienteDetalhe = () => {
  const { slug } = useParams<{ slug: string }>();
  const id = useMemo(() => {
    if (!slug) return null;
    
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = slug.match(uuidRegex);
    
    if (match) return match[0];
    return slug;
  }, [slug]);

  const navigate = useNavigate();
  const { data: clientes, isLoading: loadingClientes } = useClientes();
  const { data: pedidosResult, isLoading: loadingPedidos } = usePedidos(undefined, 0, 500);
  const pedidos = pedidosResult?.data ?? [];
  
  // Debug log
  console.log('ClienteDetalhe - slug:', slug, 'extracted id:', id);
  if (clientes) {
    const found = clientes.find(c => c.id === id);
    console.log('ClienteDetalhe - cliente encontrado:', !!found);
  }
  const updateCliente = useUpdateCliente();
  const deleteCliente = useDeleteCliente();
  const createContato = useCreateContato();
  const deleteContato = useDeleteContato();
  const { data: contatos } = useContatos();
  const [editOpen, setEditOpen] = useState(false);
  const [enderecoOpen, setEnderecoOpen] = useState(true);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [addContatoOpen, setAddContatoOpen] = useState(false);
  const [addObraOpen, setAddObraOpen] = useState(false);
  const [vincularContatoOpen, setVincularContatoOpen] = useState(false);
  const [selectedContatoId, setSelectedContatoId] = useState('');
  const updateContato = useUpdateContato();
  const createObra = useCreateObra();
  const [novaObra, setNovaObra] = useState({ nome_obra: '', endereco_entrega: '', status: 'ativa', spe_cnpj: '' });
  const [pedidosPage, setPedidosPage] = useState(1);
  const PEDIDOS_PAGE_SIZE = 5;

  const copyInfo = async (label: string, value?: string | null) => {
    if (!value?.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      toast.success(`${label} copiado!`);
    } catch {
      toast.error('Não foi possível copiar a informação.');
    }
  };

  const cliente = clientes?.find(c => c.id === id);
  const pedidosCliente = useMemo(() => (pedidos ?? []).filter(p => p.cliente_id === id), [pedidos, id]);
  const totalPedidosPages = Math.max(1, Math.ceil(pedidosCliente.length / PEDIDOS_PAGE_SIZE));
  const paginatedPedidos = useMemo(() => 
    pedidosCliente.slice((pedidosPage - 1) * PEDIDOS_PAGE_SIZE, pedidosPage * PEDIDOS_PAGE_SIZE),
    [pedidosCliente, pedidosPage]
  );
  const contatosExtras = (contatos ?? []).filter((c: any) => cliente && c.empresa === cliente.empresa);

  // Edit form state
  const [editData, setEditData] = useState({
    empresa: '', razao_social: '', tipo: '', cnpj: '', email: '', telefone: '', nome_contato: '',
  });
  const [editEndereco, setEditEndereco] = useState<EnderecoFields>(emptyEndereco);

  // Novo contato extra
  const [novoContato, setNovoContato] = useState({ nome_contato: '', cargo: '', email: '', telefone: '' });
  const handleAddContato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente) return;
    if (!novoContato.nome_contato.trim()) {
      toast.error('Informe o nome do contato.');
      return;
    }
    try {
      await createContato.mutateAsync({
        empresa: cliente.empresa,
        nome_contato: novoContato.nome_contato.trim(),
        cargo: novoContato.cargo.trim() || undefined,
        email: novoContato.email.trim() || undefined,
        telefone: novoContato.telefone.trim() || undefined,
      });
      toast.success('Contato adicionado!');
      setNovoContato({ nome_contato: '', cargo: '', email: '', telefone: '' });
      setAddContatoOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openEdit = () => {
    if (!cliente) return;
    setEditData({
      empresa: cliente.empresa ?? '',
      razao_social: (cliente as any).razao_social ?? '',
      tipo: cliente.tipo ?? 'construtora',
      cnpj: cliente.cnpj ?? '',
      email: cliente.email ?? '',
      telefone: cliente.telefone ?? '',
      nome_contato: cliente.nome_contato ?? '',
    });
    setEditEndereco(cliente.endereco ? stringToEndereco(cliente.endereco) : emptyEndereco);
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const enderecoStr = enderecoToString(editEndereco);
    try {
      await updateCliente.mutateAsync({
        id,
        empresa: editData.empresa,
        razao_social: editData.razao_social || undefined,
        tipo: editData.tipo,
        cnpj: editData.cnpj || undefined,
        email: editData.email || undefined,
        telefone: editData.telefone || undefined,
        endereco: enderecoStr || undefined,
        nome_contato: editData.nome_contato || undefined,
      });
      toast.success('Cliente atualizado com sucesso!');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loadingClientes) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!cliente) {
    return (
      <AppLayout>
        <div className="p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <p className="text-muted-foreground mt-8 text-center">Cliente não encontrado.</p>
        </div>
      </AppLayout>
    );
  }

  const Icon = tipoIcons[cliente.tipo] ?? Building2;
  const stageLabel = (key: string) => KANBAN_STAGES.find(s => s.key === key)?.label || key;

  const selectedViewOrder = useMemo(() => 
    (pedidos ?? []).find(p => p.id === viewOrderId),
  [pedidos, viewOrderId]);

  const viewOrderSheet = (
    <Dialog open={!!viewOrderId} onOpenChange={(open) => !open && setViewOrderId(null)}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-6 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-foreground font-bold text-lg">
                {selectedViewOrder?.cliente?.empresa ?? 'Detalhes do Negócio'}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {selectedViewOrder?.obra?.nome_obra ?? 'Sem obra vinculada'}
              </p>
            </div>
          </div>
        </DialogHeader>

        {selectedViewOrder ? (
          <div className="py-6 space-y-8">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fabricante</p>
                <p className="text-sm font-medium">{(selectedViewOrder as any).fabricante?.nome ?? '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Valor Total</p>
                <p className="text-sm font-bold text-primary">
                  {(selectedViewOrder.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Data do Pedido</p>
                <p className="text-sm font-medium">
                  {new Date(selectedViewOrder.data_pedido).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</p>
                <Badge className={stageColors[selectedViewOrder.status] ?? ''}>
                  {stageLabel(selectedViewOrder.status)}
                </Badge>
              </div>
            </div>
            
            {selectedViewOrder.observacoes && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Observações</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap italic">"{selectedViewOrder.observacoes}"</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-6 border-t mt-4">
          <Button variant="outline" onClick={() => navigate(`/pedidos/${viewOrderId}/editar`)}>
            <Pencil className="h-4 w-4 mr-2" /> Editar Negócio
          </Button>
          <Button variant="secondary" onClick={() => setViewOrderId(null)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <AppLayout
      headerContent={
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <SidebarTrigger className="shrink-0 h-8 w-8 md:hidden" />
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">{(cliente as any).razao_social || cliente.empresa}</h1>
            <div className="flex items-center gap-2">
              {(cliente as any).razao_social && (cliente as any).razao_social !== cliente.empresa && (
                <span className="text-xs sm:text-sm text-muted-foreground truncate">{cliente.empresa}</span>
              )}
              <Badge variant="secondary" className="text-[10px]">{tipoLabels[cliente.tipo] ?? cliente.tipo}</Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 ml-auto" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        </div>
      }
    >
      {viewOrderSheet}
      <div className="p-6 space-y-6">

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
              <div>
                <Label>Tipo</Label>
                <Select value={editData.tipo} onValueChange={v => setEditData(d => ({ ...d, tipo: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="construtora">Construtora</SelectItem>
                    <SelectItem value="loja">Loja</SelectItem>
                    <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{editData.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label>
                <Input value={editData.cnpj} onChange={e => setEditData(d => ({ ...d, cnpj: e.target.value }))} placeholder={editData.tipo === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'} />
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={editData.empresa} onChange={e => setEditData(d => ({ ...d, empresa: e.target.value }))} required placeholder="Nome fantasia ou nome" />
              </div>
              <div>
                <Label>Razão Social</Label>
                <Input value={editData.razao_social} onChange={e => setEditData(d => ({ ...d, razao_social: e.target.value }))} placeholder="Razão social da empresa" />
              </div>
              <div>
                <Label>Nome do Contato</Label>
                <Input value={editData.nome_contato} onChange={e => setEditData(d => ({ ...d, nome_contato: e.target.value }))} placeholder="Nome da pessoa de contato" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={editData.email} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={editData.telefone} onChange={e => setEditData(d => ({ ...d, telefone: e.target.value }))} />
                </div>
              </div>
              <EnderecoForm value={editEndereco} onChange={setEditEndereco} />
              <Button type="submit" className="w-full" disabled={updateCliente.isPending}>
                {updateCliente.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {cliente.cnpj && (
            <Card
              role="button"
              tabIndex={0}
              className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => copyInfo(cliente.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ', cliente.cnpj)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyInfo(cliente.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ', cliente.cnpj);
                }
              }}
            >
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">{cliente.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</p>
                   <p className="text-sm font-medium text-foreground break-all">{cliente.cnpj}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          <Card
            role={cliente.email ? 'button' : undefined}
            tabIndex={cliente.email ? 0 : undefined}
            className={`border-border/40 ${cliente.email ? 'cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''}`}
            onClick={() => {
              if (cliente.email) {
                navigate(`/emails?to=${encodeURIComponent(cliente.email)}`);
              }
            }}
            onKeyDown={e => {
              if (cliente.email && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                navigate(`/emails?to=${encodeURIComponent(cliente.email)}`);
              }
            }}
          >
             <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
               <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
               <div className="min-w-0">
                 <p className="text-xs text-muted-foreground">Email</p>
                 <p className={`text-sm font-medium ${cliente.email ? 'text-foreground' : 'text-muted-foreground italic'} truncate`}>
                   {cliente.email || 'Não informado'}
                 </p>
               </div>
            </CardContent>
          </Card>
          {cliente.telefone && (
            <Card
              role="button"
              tabIndex={0}
              className="border-border/40 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => copyInfo('Telefone', cliente.telefone)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyInfo('Telefone', cliente.telefone);
                }
              }}
            >
               <CardContent className="pt-4 flex items-center gap-3 overflow-hidden">
                 <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs text-muted-foreground">Telefone</p>
                   <p className="text-sm font-medium text-foreground break-all">{cliente.telefone}</p>
                 </div>
              </CardContent>
            </Card>
          )}
          {cliente.endereco && (() => {
            // Parse "logradouro, numero, complemento, bairro, cidade - UF, CEP" format
            const parts = cliente.endereco.split(',').map(s => s.trim());
            const logradouro = parts[0] || '';
            const numero = parts[1] || '';
            const bairro = parts.length > 3 ? parts[2] : '';
            const cidadeUfRaw = parts.length > 3 ? parts[3] : parts[2] || '';
            const cep = parts.length > 4 ? parts[4] : '';
            const cidadeUfMatch = cidadeUfRaw.match(/^(.+?)\s*-\s*(.+)$/);
            const cidade = cidadeUfMatch ? cidadeUfMatch[1].trim() : cidadeUfRaw;
            const uf = cidadeUfMatch ? cidadeUfMatch[2].trim() : '';
            
            const fields = [
              { label: 'Logradouro', value: logradouro },
              { label: 'Número', value: numero },
              { label: 'Bairro', value: bairro },
              { label: 'Cidade', value: cidade },
              { label: 'UF', value: uf },
              { label: 'CEP', value: cep },
            ].filter(f => f.value);

            return (
              <Card className="md:col-span-3 border-border/40">
                <CardContent className="pt-4">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full gap-2 mb-0 cursor-pointer"
                    onClick={() => setEnderecoOpen(o => !o)}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${enderecoOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {enderecoOpen && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                      {fields.map(f => (
                        <div key={f.label}>
                          <p className="text-xs text-muted-foreground">{f.label}</p>
                          <p className="text-sm font-medium text-foreground">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Obras */}
        <Card className="border-border/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <HardHat className="h-4 w-4 text-primary" />
              Obras Vinculadas
              {cliente.obras && cliente.obras.length > 0 && (
                <Badge variant="secondary" className="ml-1">{cliente.obras.length}</Badge>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setAddObraOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nova Obra
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {cliente.obras && cliente.obras.map((obra: any) => (
                <div 
                  key={obra.id} 
                  className="rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 hover:border-primary/30 transition-all"
                  onClick={() => navigate('/obras', { state: { selectedObraId: obra.id, activeTab: 'mapa' } })}
                >
                  <p className="text-sm font-medium text-foreground">{obra.nome_obra}</p>
                  {obra.endereco_entrega && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {obra.endereco_entrega}
                    </p>
                  )}
                  <Badge variant="outline" className="mt-2 text-[10px]">{obra.status}</Badge>
                </div>
              ))}
              
              <button
                onClick={() => setAddObraOpen(true)}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 hover:border-primary/50 hover:bg-primary/5 transition-all group"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-muted-foreground group-hover:text-primary">Cadastrar Nova Obra</span>
              </button>
            </div>

              <Dialog open={addObraOpen} onOpenChange={setAddObraOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Nova Obra</DialogTitle>
                  </DialogHeader>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!novaObra.nome_obra.trim()) {
                        toast.error('O nome da obra é obrigatório');
                        return;
                      }
                      try {
                        // Verificar se já existe obra com este nome (evitar duplicados)
                        const normalizedNewName = novaObra.nome_obra.trim().toLowerCase();
                        const existingObra = (cliente.obras || []).find((o: any) => o.nome_obra.trim().toLowerCase() === normalizedNewName);

                        if (existingObra) {
                          toast.info('Esta obra já existe para este cliente.');
                          setAddObraOpen(false);
                          setNovaObra({ nome_obra: '', endereco_entrega: '', status: 'ativa', spe_cnpj: '' });
                          return;
                        }

                        await createObra.mutateAsync({
                          ...novaObra,
                          cliente_id: id!
                        });
                        toast.success('Obra cadastrada com sucesso!');
                        setNovaObra({ nome_obra: '', endereco_entrega: '', status: 'ativa', spe_cnpj: '' });
                        setAddObraOpen(false);
                      } catch (err: any) {
                        toast.error('Erro ao cadastrar obra: ' + err.message);
                      }
                    }} 
                    className="space-y-4 pt-4"
                  >
                    <div className="space-y-2">
                      <Label>Nome da Obra *</Label>
                      <Input
                        value={novaObra.nome_obra}
                        onChange={e => setNovaObra(o => ({ ...o, nome_obra: e.target.value }))}
                        placeholder="Ex: Edifício Horizonte"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Endereço de Entrega</Label>
                      <Input
                        value={novaObra.endereco_entrega}
                        onChange={e => setNovaObra(o => ({ ...o, endereco_entrega: e.target.value }))}
                        placeholder="Rua, número, bairro..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={novaObra.status} onValueChange={v => setNovaObra(o => ({ ...o, status: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativa">Ativa</SelectItem>
                          <SelectItem value="em_andamento">Em andamento</SelectItem>
                          <SelectItem value="parada">Parada</SelectItem>
                          <SelectItem value="concluida">Concluída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>CNPJ / SPE</Label>
                      <Input
                        value={novaObra.spe_cnpj}
                        onChange={e => setNovaObra(o => ({ ...o, spe_cnpj: e.target.value }))}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setAddObraOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createObra.isPending}>
                        {createObra.isPending ? 'Cadastrando...' : 'Adicionar Obra'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        {/* Removed extra closing brace */}

        {/* Contatos extras (apenas para empresas, não pessoa física) */}
        {cliente.tipo !== 'pessoa_fisica' && (
          <Card className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Contatos Adicionais
                {contatosExtras.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{contatosExtras.length}</Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setVincularContatoOpen(true)} className="gap-1.5">
                  <Users className="h-4 w-4" />
                  Vincular Existente
                </Button>
                <Button size="sm" onClick={() => setAddContatoOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border overflow-hidden mb-4">
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo / Cargo</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contatosExtras.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Nenhum contato adicional cadastrado.
                          </TableCell>
                        </TableRow>
                      ) : contatosExtras.map((c: any) => (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => {
                          const slug = slugify(c.nome_contato || 'contato');
                          navigate(`/contatos/${slug}-${c.id}`);
                        }}>
                          <TableCell className="font-medium">{c.nome_contato || '-'}</TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            {c.cargo ? <Badge variant="outline">{c.cargo}</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm" onClick={e => e.stopPropagation()}>{c.email || '-'}</TableCell>
                          <TableCell className="text-muted-foreground text-sm" onClick={e => e.stopPropagation()}>{c.telefone || '-'}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={async () => {
                                try {
                                  await deleteContato.mutateAsync(c.id);
                                  toast.success('Contato removido!');
                                } catch (err: any) {
                                  toast.error(err.message);
                                }
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                </div>

              <Dialog open={addContatoOpen} onOpenChange={setAddContatoOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Novo Contato</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddContato} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Nome do contato *</Label>
                      <Input
                        value={novoContato.nome_contato}
                        onChange={e => setNovoContato(c => ({ ...c, nome_contato: e.target.value }))}
                        placeholder="Ex: João Silva"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo / Cargo</Label>
                      <Input
                        value={novoContato.cargo}
                        onChange={e => setNovoContato(c => ({ ...c, cargo: e.target.value }))}
                        placeholder="Ex: Comprador, Engenheiro"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={novoContato.email}
                        onChange={e => setNovoContato(c => ({ ...c, email: e.target.value }))}
                        placeholder="email@exemplo.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input
                        value={novoContato.telefone}
                        onChange={e => setNovoContato(c => ({ ...c, telefone: e.target.value }))}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setAddContatoOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createContato.isPending}>
                        {createContato.isPending ? 'Adicionando...' : 'Adicionar Contato'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={vincularContatoOpen} onOpenChange={setVincularContatoOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Vincular Contato Existente</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Selecione o Contato</Label>
                      <Select value={selectedContatoId} onValueChange={setSelectedContatoId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um contato..." />
                        </SelectTrigger>
                        <SelectContent>
                          {contatos?.filter(c => c.empresa !== cliente.empresa).map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome_contato} {c.empresa ? `(${c.empresa})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setVincularContatoOpen(false)}>Cancelar</Button>
                    <Button 
                      onClick={async () => {
                        const contact = contatos?.find(c => c.id === selectedContatoId);
                        if (contact && id) {
                          try {
                            await updateContato.mutateAsync({
                              id: selectedContatoId,
                              empresa: cliente.empresa
                            });
                            toast.success('Contato vinculado com sucesso!');
                            setVincularContatoOpen(false);
                            setSelectedContatoId('');
                          } catch (err: any) {
                            toast.error('Erro ao vincular: ' + err.message);
                          }
                        }
                      }}
                      disabled={!selectedContatoId || updateContato.isPending}
                    >
                      {updateContato.isPending ? 'Vinculando...' : 'Vincular ao Cliente'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}

        {/* Pedidos */}
        <Card className="border-border/40">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Pedidos</CardTitle>
            <Button size="sm" onClick={() => navigate('/pedidos')}>
              <Plus className="h-4 w-4 mr-1" /> Novo Pedido
            </Button>
          </CardHeader>
          <CardContent>
            {loadingPedidos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Fabricante</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedidosCliente.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum pedido encontrado para este cliente.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedPedidos.map(p => (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setViewOrderId(p.id)}>
                          <TableCell className="font-medium">{(p as any).fabricante?.nome ?? '-'}</TableCell>
                          <TableCell>{(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                          <TableCell>
                            <Badge className={stageColors[p.status] ?? ''}>{stageLabel(p.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{new Date(p.data_pedido).toLocaleDateString('pt-BR')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            {pedidosCliente.length > PEDIDOS_PAGE_SIZE && (
              <ListPagination
                page={pedidosPage}
                totalPages={totalPedidosPages}
                totalItems={pedidosCliente.length}
                pageSize={PEDIDOS_PAGE_SIZE}
                onPageChange={setPedidosPage}
                onPageSizeChange={() => {}}
                itemLabel="pedido"
                className="mt-4 border-t pt-4"
              />
            )}
          </CardContent>
        </Card>

        {/* Excluir cliente */}
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir Cliente
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. O cliente "{cliente.empresa}" será removido permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await deleteCliente.mutateAsync(id!);
                      toast.success('Cliente excluído com sucesso!');
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
    </AppLayout>
  );
};

export default ClienteDetalhe;
