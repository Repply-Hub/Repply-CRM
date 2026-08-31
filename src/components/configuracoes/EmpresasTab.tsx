import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Building2, Loader2, Pencil, Search } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

type Empresa = {
  id: string;
  nome: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  codigo_acesso: string;
  created_at: string;
};

function maskCnpj(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatCnpj(raw: string | null) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length !== 14) return raw;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// ─── Edit form (shared between admin list and empresa self-edit) ───
function EmpresaForm({
  empresa,
  onSuccess,
  onCancel,
  showCancel = true,
}: {
  empresa: Empresa;
  onSuccess?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}) {
  const qc = useQueryClient();
  const [cnpj, setCnpj] = useState(formatCnpj(empresa.cnpj) ?? '');

  const update = useMutation({
    mutationFn: async (data: { nome: string; nome_fantasia: string; cnpj: string }) => {
      // 🔴 O `.select('id')` NÃO É ENFEITE — é o que separa "salvou" de "achou que salvou".
      //
      // Quando a regra de segurança do banco recusa um UPDATE, ela não devolve erro: ela
      // simplesmente não encontra a linha, e o Supabase responde sucesso com zero linhas
      // alteradas. Sem pedir as linhas de volta, esta tela mostrava "Empresa atualizada!"
      // por cima de uma gravação que não aconteceu — e a pessoa só descobriria ao recarregar.
      const { data: linhas, error } = await supabase
        .from('empresas')
        .update({
          nome: data.nome || null,
          nome_fantasia: data.nome_fantasia || null,
          cnpj: data.cnpj.replace(/\D/g, '') || null,
        })
        .eq('id', empresa.id)
        .select('id');
      if (error) throw error;
      if (!linhas?.length) {
        throw new Error(
          'A alteração não foi salva: o banco não autorizou. Se o acesso da empresa estiver bloqueado, é essa a causa.',
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresas_admin'] });
      qc.invalidateQueries({ queryKey: ['empresas_list'] });
      // 🔴 A CHAVE QUE A PRÓPRIA TELA LÊ, e que ficava de fora. `MinhaEmpresaView` busca por
      // ['minha_empresa', id]; sem invalidá-la, sair da aba e voltar remontava o formulário
      // com o dado ANTIGO do cache — que se lê como "não salvou", e faz digitar tudo de novo.
      // Sem o id de propósito: alcança também a empresa que o admin acabou de editar na lista.
      qc.invalidateQueries({ queryKey: ['minha_empresa'] });
      toast.success('Empresa atualizada!');
      onSuccess?.();
    },
    // Erro do Supabase não é um `Error` (ver CLAUDE.md §4.6): `e.message` sozinho perde o
    // `details`/`hint` e, principalmente, entrega em inglês a recusa das regras de acesso.
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível salvar a empresa.')),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    update.mutate({
      nome: form.get('nome') as string,
      nome_fantasia: form.get('nome_fantasia') as string,
      cnpj,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Razão Social</Label>
        <Input name="nome" defaultValue={empresa.nome ?? ''} placeholder="Razão Social" />
      </div>
      <div className="space-y-1.5">
        <Label>Nome Fantasia</Label>
        <Input name="nome_fantasia" defaultValue={empresa.nome_fantasia ?? ''} placeholder="Nome Fantasia" />
      </div>
      <div className="space-y-1.5">
        <Label>CNPJ</Label>
        <Input
          value={cnpj}
          onChange={e => setCnpj(maskCnpj(e.target.value))}
          placeholder="00.000.000/0001-00"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Código de Acesso</Label>
        <Input value={empresa.codigo_acesso} disabled className="bg-muted/50 cursor-not-allowed font-mono text-sm" />
        <p className="text-[11px] text-muted-foreground">O código de acesso não pode ser alterado aqui.</p>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        {showCancel && onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        )}
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  );
}

// ─── Admin view: full list ───
function AdminEmpresasView() {
  const [search, setSearch] = useState('');
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);

  const { data: empresas, isLoading } = useQuery({
    queryKey: ['empresas_admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome, nome_fantasia, cnpj, codigo_acesso, created_at')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });

  const filtered = (empresas ?? []).filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (e.nome ?? '').toLowerCase().includes(q) ||
      (e.nome_fantasia ?? '').toLowerCase().includes(q) ||
      (e.cnpj ?? '').includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{empresas?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground -mt-0.5">empresas cadastradas</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, nome fantasia ou CNPJ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(emp => {
                const iniciais = (emp.nome_fantasia || emp.nome || '?')
                  .split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <div key={emp.id} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{iniciais}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{emp.nome ?? '—'}</p>
                        {emp.nome_fantasia && emp.nome_fantasia !== emp.nome && (
                          <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                            {emp.nome_fantasia}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {emp.cnpj ? (
                          <span className="text-xs text-muted-foreground font-mono">{formatCnpj(emp.cnpj)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">Sem CNPJ</span>
                        )}
                        <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-muted text-muted-foreground">
                          #{emp.codigo_acesso}
                        </span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditingEmpresa(emp)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingEmpresa} onOpenChange={open => !open && setEditingEmpresa(null)}>
        {editingEmpresa && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Empresa</DialogTitle>
            </DialogHeader>
            <EmpresaForm
              empresa={editingEmpresa}
              onSuccess={() => setEditingEmpresa(null)}
              onCancel={() => setEditingEmpresa(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ─── Empresa self-edit view ───
function MinhaEmpresaView({ empresaId }: { empresaId: string }) {
  const { data: empresa, isLoading } = useQuery({
    queryKey: ['minha_empresa', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome, nome_fantasia, cnpj, codigo_acesso, created_at')
        .eq('id', empresaId)
        .single();
      if (error) throw error;
      return data as Empresa;
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!empresa) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Empresa não encontrada.</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> Dados da Empresa
        </CardTitle>
        <CardDescription>Edite as informações da sua empresa</CardDescription>
      </CardHeader>
      <CardContent>
        <EmpresaForm empresa={empresa} showCancel={false} />
      </CardContent>
    </Card>
  );
}

// ─── Public export ───
export function EmpresasTab({ mode }: { mode: 'admin' | 'empresa'; empresaId?: string }) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  if (mode === 'empresa') {
    if (!empresaId) return <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma empresa vinculada ao seu perfil.</p>;
    return <MinhaEmpresaView empresaId={empresaId} />;
  }

  return <AdminEmpresasView />;
}
