import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useClientes } from '@/hooks/use-clientes';
import { useCreateCliente } from '@/hooks/use-mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Building2, Store, User, MapPin, Loader2, CheckCircle2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ColumnSettings, type ColumnDefinition } from '@/components/ColumnSettings';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData } from '@/lib/cnpj';
import { EnderecoForm } from '@/components/EnderecoForm';
import { emptyEndereco, enderecoToString, type EnderecoFields } from '@/lib/cep';

const CLIENTE_FIELDS: ColumnDefinition[] = [
  { id: 'empresa', label: 'Nome/Empresa', locked: true },
  { id: 'tipo', label: 'Tipo' },
  { id: 'cnpj', label: 'CPF/CNPJ' },
  { id: 'email', label: 'E-mail' },
  { id: 'endereco', label: 'Endereço' },
  { id: 'obras_count', label: 'Qtd. Obras' },
];

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User };
const tipoLabels: Record<string, string> = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física' };

type ViewTab = 'empresas' | 'contatos';

const Clientes = () => {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClientes();
  const createCliente = useCreateCliente();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [activeTab, setActiveTab] = useState<ViewTab>('empresas');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipo, setTipo] = useState('construtora');
  const [cnpj, setCnpj] = useState('');
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [empresa, setEmpresa] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [endereco, setEndereco] = useState<EnderecoFields>(emptyEndereco);
  const [telefone, setTelefone] = useState('');

  const [visibleFields, setVisibleFields] = useState<string[]>(() => {
    const saved = localStorage.getItem('clientes_fields');
    return saved ? JSON.parse(saved) : CLIENTE_FIELDS.map(c => c.id);
  });

  const handleFieldChange = (newFields: string[]) => {
    setVisibleFields(newFields);
    localStorage.setItem('clientes_fields', JSON.stringify(newFields));
  };

  // Split clients by tab
  // All clients show in Empresas; Contatos is for future contact-specific records
  const allClients = clients ?? [];
  const empresas = allClients;
  const contatos: typeof allClients = [];
  const activeList = activeTab === 'empresas' ? empresas : contatos;

  const filtered = activeList.filter(c => {
    const matchSearch = c.empresa.toLowerCase().includes(search.toLowerCase()) ||
      (c.nome_contato && c.nome_contato.toLowerCase().includes(search.toLowerCase())) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()));
    const matchTipo = tipoFilter === 'todos' || c.tipo === tipoFilter;
    return matchSearch && matchTipo;
  });

  const tipoFilterOptions = [
    { value: 'todos', label: 'Todos os tipos' },
    { value: 'construtora', label: 'Construtora' },
    { value: 'loja', label: 'Loja' },
    { value: 'pessoa_fisica', label: 'Pessoa Física' },
  ];

  const handleCnpjChange = (value: string) => {
    setCnpj(maskCnpj(value));
    setCnpjStatus('idle');
  };

  const handleCnpjBlur = async () => {
    const digits = unmaskCnpj(cnpj);
    if (digits.length !== 14) return;
    if (!isValidCnpjDigits(digits)) {
      setCnpjStatus('invalid');
      toast.error('CNPJ inválido (dígitos verificadores incorretos)');
      return;
    }
    setCnpjStatus('loading');
    try {
      const data = await fetchCnpjData(digits);
      setCnpjStatus('valid');
      if (data.razao_social && !empresa) setEmpresa(data.razao_social);
      if (data.razao_social && !razaoSocial) setRazaoSocial(data.razao_social);
      if (!endereco.logradouro) {
        setEndereco(prev => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          numero: data.numero || prev.numero,
          bairro: data.bairro || prev.bairro,
          cidade: data.municipio || prev.cidade,
          uf: data.uf || prev.uf,
          cep: data.cep || prev.cep,
        }));
      }
      if (data.ddd_telefone_1 && !telefone) setTelefone(data.ddd_telefone_1);
      toast.success('CNPJ validado! Dados preenchidos automaticamente.');
    } catch {
      setCnpjStatus('invalid');
      toast.error('CNPJ não encontrado na Receita Federal');
    }
  };

  const resetForm = () => {
    setCnpj(''); setEmpresa(''); setRazaoSocial(''); setEndereco(emptyEndereco); setTelefone(''); setCnpjStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (tipo !== 'pessoa_fisica' && unmaskCnpj(cnpj).length === 14 && !isValidCnpjDigits(unmaskCnpj(cnpj))) {
      toast.error('CNPJ inválido');
      return;
    }
    const enderecoStr = enderecoToString(endereco);
    try {
      await createCliente.mutateAsync({
        empresa: empresa || (form.get('empresa') as string),
        razao_social: razaoSocial || undefined,
        tipo,
        cnpj: cnpj || undefined,
        email: (form.get('email') as string) || undefined,
        telefone: telefone || undefined,
        endereco: enderecoStr || undefined,
      });
      toast.success('Cliente cadastrado com sucesso!');
      resetForm();
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Sync tipo when switching tabs
  const handleTabChange = (tab: string) => {
    if (tab === 'contatos') setTipo('pessoa_fisica');
    else if (tipo === 'pessoa_fisica') setTipo('construtora');
    setActiveTab(tab as ViewTab);
    setTipoFilter('todos');
    setSearch('');
  };

  return (
    <AppLayout title="Clientes" subtitle={`${clients?.length ?? 0} cadastrados`}>
      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-4">
          <TabsList>
            <TabsTrigger value="empresas" className="gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
              <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{empresas.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="contatos" className="gap-2">
              <Users className="h-4 w-4" />
              Contatos
              <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{contatos.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={activeTab === 'empresas' ? 'Buscar empresas...' : 'Buscar contatos...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {activeTab === 'empresas' && (
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
              <SelectContent>
                {tipoFilterOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ColumnSettings
            columns={CLIENTE_FIELDS}
            visibleColumns={visibleFields}
            onChange={handleFieldChange}
          />
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> {activeTab === 'empresas' ? 'Nova Empresa' : 'Novo Contato'}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{activeTab === 'empresas' ? 'Cadastrar Empresa' : 'Cadastrar Contato'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                {activeTab === 'empresas' ? (
                  <div>
                    <Label>Tipo</Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="construtora">Construtora</SelectItem>
                        <SelectItem value="loja">Loja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div>
                  <Label>{activeTab === 'contatos' ? 'CPF' : 'CNPJ'}</Label>
                  <div className="relative">
                    <Input
                      value={cnpj}
                      onChange={(e) => handleCnpjChange(e.target.value)}
                      onBlur={activeTab === 'empresas' ? handleCnpjBlur : undefined}
                      placeholder={activeTab === 'contatos' ? '000.000.000-00' : '00.000.000/0000-00'}
                      className={cnpjStatus === 'invalid' ? 'border-destructive' : cnpjStatus === 'valid' ? 'border-green-500' : ''}
                    />
                    {cnpjStatus === 'loading' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                    {cnpjStatus === 'valid' && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                  </div>
                  {activeTab === 'empresas' && <p className="text-[10px] text-muted-foreground mt-1">Ao sair do campo, o CNPJ será validado e os dados preenchidos automaticamente</p>}
                </div>
                <div><Label>{activeTab === 'contatos' ? 'Nome completo' : 'Nome'}</Label><Input value={empresa} onChange={e => setEmpresa(e.target.value)} required placeholder={activeTab === 'contatos' ? 'Nome completo' : 'Nome fantasia ou nome'} /></div>
                {activeTab === 'empresas' && (
                  <div><Label>Razão Social</Label><Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} placeholder="Razão social da empresa" /></div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input name="email" type="email" placeholder="email@exemplo.com" /></div>
                  <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000" /></div>
                </div>
                <EnderecoForm value={endereco} onChange={setEndereco} />
                <Button type="submit" className="w-full" disabled={createCliente.isPending}>
                  {createCliente.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            {activeTab === 'empresas' ? <Building2 className="h-12 w-12 mb-3 opacity-30" /> : <Users className="h-12 w-12 mb-3 opacity-30" />}
            <p className="text-sm font-medium">Nenhum {activeTab === 'empresas' ? 'empresa' : 'contato'} encontrado</p>
            <p className="text-xs mt-1">Tente ajustar os filtros ou cadastre um novo</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(client => {
              const Icon = tipoIcons[client.tipo] ?? Building2;
              return (
                <Card key={client.id} className="shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer border-border/60 group" onClick={() => navigate(`/clientes/${client.id}`)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm truncate font-bold">{client.empresa}</CardTitle>
                        {visibleFields.includes('tipo') && (
                          <Badge variant="secondary" className="text-[10px] mt-1 font-medium">{tipoLabels[client.tipo] ?? client.tipo}</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1 text-muted-foreground">
                    {activeTab === 'contatos' && client.nome_contato && (
                      <p className="font-medium text-foreground">{client.nome_contato}</p>
                    )}
                    {visibleFields.includes('cnpj') && client.cnpj && <p>{client.cnpj}</p>}
                    {visibleFields.includes('email') && client.email && <p>{client.email}</p>}
                    {visibleFields.includes('endereco') && client.endereco && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{client.endereco}</p>}
                    {visibleFields.includes('obras_count') && client.obras && client.obras.length > 0 && (
                      <p className="text-primary font-medium">{client.obras.length} obra(s) vinculada(s)</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Clientes;
