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
import { Plus, Search, Building2, Store, User, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData } from '@/lib/cnpj';
import { EnderecoForm } from '@/components/EnderecoForm';
import { emptyEndereco, enderecoToString, type EnderecoFields } from '@/lib/cep';

const tipoIcons: Record<string, typeof Building2> = { construtora: Building2, loja: Store, pessoa_fisica: User };
const tipoLabels: Record<string, string> = { construtora: 'Construtora', loja: 'Loja', pessoa_fisica: 'Pessoa Física' };

const Clientes = () => {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClientes();
  const createCliente = useCreateCliente();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipo, setTipo] = useState('construtora');
  const [cnpj, setCnpj] = useState('');
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [empresa, setEmpresa] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [endereco, setEndereco] = useState<EnderecoFields>(emptyEndereco);
  const [telefone, setTelefone] = useState('');

  const filtered = (clients ?? []).filter(c =>
    c.empresa.toLowerCase().includes(search.toLowerCase()) &&
    (tipoFilter === 'todos' || c.tipo === tipoFilter)
  );

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

  return (
    <AppLayout title="Clientes" subtitle={`${clients?.length ?? 0} cadastrados`}>
      <div className="p-6 max-w-[1400px]">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar clientes..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="construtora">Construtora</SelectItem>
              <SelectItem value="loja">Loja</SelectItem>
              <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Cadastrar Cliente</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <div>
                  <Label>Tipo</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="construtora">Construtora</SelectItem>
                      <SelectItem value="loja">Loja</SelectItem>
                      <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label>
                  <div className="relative">
                    <Input
                      value={cnpj}
                      onChange={(e) => handleCnpjChange(e.target.value)}
                      onBlur={tipo !== 'pessoa_fisica' ? handleCnpjBlur : undefined}
                      placeholder={tipo === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'}
                      className={cnpjStatus === 'invalid' ? 'border-destructive' : cnpjStatus === 'valid' ? 'border-green-500' : ''}
                    />
                    {cnpjStatus === 'loading' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                    {cnpjStatus === 'valid' && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                  </div>
                  {tipo !== 'pessoa_fisica' && <p className="text-[10px] text-muted-foreground mt-1">Ao sair do campo, o CNPJ será validado e os dados preenchidos automaticamente</p>}
                </div>
                <div><Label>Nome</Label><Input value={empresa} onChange={e => setEmpresa(e.target.value)} required placeholder="Nome fantasia ou nome" /></div>
                <div><Label>Razão Social</Label><Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} placeholder="Razão social da empresa" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input name="email" type="email" placeholder="email@exemplo.com" /></div>
                  <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 0000-0000" /></div>
                </div>
                <EnderecoForm value={endereco} onChange={setEndereco} />
                <Button type="submit" className="w-full" disabled={createCliente.isPending}>
                  {createCliente.isPending ? 'Salvando...' : 'Salvar Cliente'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>


        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
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
                        <Badge variant="secondary" className="text-[10px] mt-1 font-medium">{tipoLabels[client.tipo] ?? client.tipo}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1 text-muted-foreground">
                    {client.cnpj && <p>{client.cnpj}</p>}
                    {client.email && <p>{client.email}</p>}
                    {client.endereco && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{client.endereco}</p>}
                    {client.obras && client.obras.length > 0 && (
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
