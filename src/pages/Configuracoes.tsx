import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sun, Moon, Monitor, Loader2, Trash2, Users, UserCircle, Lock, AlertTriangle, Building2 } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { UsuariosTab } from '@/components/configuracoes/UsuariosTab';

const themeOptions = [
  { value: 'light' as const, label: 'Claro', icon: Sun, desc: 'Tema claro padrão' },
  { value: 'dark' as const, label: 'Escuro', icon: Moon, desc: 'Reduz o brilho da tela' },
  { value: 'system' as const, label: 'Sistema', icon: Monitor, desc: 'Segue a preferência do SO' },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sun className="h-4 w-4 text-primary" /> Aparência
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex bg-muted/30 p-1 rounded-md border border-border">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-sm text-xs font-medium transition-all',
                theme === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <opt.icon className={cn('h-3.5 w-3.5', theme === opt.value ? 'text-primary' : 'text-muted-foreground')} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CodigoAcessoButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();
  const { data: empresa, isLoading } = useQuery({
    queryKey: ['minha_empresa', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('empresas')
        .select('id, nome, codigo_acesso, cnpj')
        .eq('owner_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; nome: string; codigo_acesso: string; cnpj: string | null } | null;
    },
    enabled: !!user,
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { error } = await (supabase as any)
        .from('empresas')
        .update({ codigo_acesso: newCode })
        .eq('owner_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minha_empresa', user?.id] });
      toast.success('Código regenerado!');
    },
  });

  if (isLoading || !empresa) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(empresa.codigo_acesso);
    setCopied(true);
    toast.success('Código copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Building2 className="h-4 w-4" /> Código de Acesso
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Código de Acesso
            </DialogTitle>
            <DialogDescription>
              Compartilhe este código com seus funcionários para que eles possam se cadastrar na sua empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 border border-border rounded-lg px-4 py-4 text-center">
              <span className="text-2xl font-mono font-bold tracking-[0.3em] text-foreground">{empresa.codigo_acesso}</span>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Empresa: <span className="font-medium text-foreground">{empresa.nome}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
                {copied ? '✓ Copiado' : 'Copiar código'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-muted-foreground">
                    Gerar novo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Gerar novo código?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O código atual será invalidado. Funcionários que ainda não se cadastraram precisarão do novo código.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => regenerate.mutate()}>
                      Gerar novo código
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProfileTab() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();

  const { data: perfil, isLoading } = useQuery({
    queryKey: ['meu_perfil', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedores')
        .select('id, nome, email, telefone, role')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updatePerfil = useMutation({
    mutationFn: async (dados: { nome: string; telefone: string }) => {
      const { error } = await supabase.from('vendedores').update(dados).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meu_perfil', user?.id] });
      toast.success('Perfil atualizado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateEmail = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      await supabase.from('vendedores').update({ email }).eq('user_id', user!.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meu_perfil', user?.id] });
      toast.success('Email atualizado! Verifique sua caixa de entrada para confirmar.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSenha = useMutation({
    mutationFn: async ({ novaSenha }: { novaSenha: string }) => {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Senha alterada com sucesso!'),
    onError: (e: any) => toast.error(e.message),
  });

  const deletarConta = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_current_user' as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Conta excluída.');
      await signOut();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSalvarPerfil = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    updatePerfil.mutate({ nome: form.get('nome') as string, telefone: form.get('telefone') as string });
  };

  const handleSalvarEmail = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    updateEmail.mutate(form.get('email') as string);
  };

  const handleSalvarSenha = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nova = form.get('nova_senha') as string;
    const confirmar = form.get('confirmar_senha') as string;
    if (nova !== confirmar) { toast.error('As senhas não coincidem.'); return; }
    if (nova.length < 6) { toast.error('A senha deve ter no mínimo 6 caracteres.'); return; }
    updateSenha.mutate({ novaSenha: nova });
    e.currentTarget.reset();
  };

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!perfil) return null;

  const iniciais = perfil.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-4 w-4 text-primary" /> Informações Pessoais</CardTitle>
            <CardDescription>Atualize seu nome e telefone</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-5">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-primary">{iniciais}</span>
              </div>
              <div>
                <p className="font-semibold">{perfil.nome}</p>
                <p className="text-sm text-muted-foreground">{perfil.email}</p>
                <Badge variant={perfil.role === 'admin' ? 'destructive' : perfil.role === 'gestor' || perfil.role === 'empresa' ? 'default' : 'secondary'} className="text-[10px] mt-1">
                  {{ admin: 'Admin', empresa: 'Empresa', gestor: 'Gestor', vendedor: 'Vendedor' }[perfil.role] || perfil.role}
                </Badge>
              </div>
            </div>
            <form onSubmit={handleSalvarPerfil} className="space-y-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input name="nome" required defaultValue={perfil.nome} placeholder="Seu nome completo" className="h-10" /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input name="telefone" defaultValue={perfil.telefone ?? ''} placeholder="(00) 00000-0000" className="h-10" /></div>
              <Button type="submit" size="sm" disabled={updatePerfil.isPending}>
                {updatePerfil.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar alterações
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email</CardTitle>
            <CardDescription>Alterar o email requer confirmação no novo endereço</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarEmail} className="space-y-3">
              <div className="space-y-1.5"><Label>Novo email</Label><Input name="email" type="email" required defaultValue={perfil.email} className="h-10" /></div>
              <Button type="submit" size="sm" variant="outline" disabled={updateEmail.isPending}>
                {updateEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Atualizar email
              </Button>
            </form>
          </CardContent>
        </Card>

        
      </div>

      <div className="space-y-4">
        <ThemeSelector />

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /> Segurança</CardTitle>
            <CardDescription>Altere sua senha de acesso</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarSenha} className="space-y-3">
              <div className="space-y-1.5"><Label>Nova senha</Label><Input name="nova_senha" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" className="h-10" /></div>
              <div className="space-y-1.5"><Label>Confirmar nova senha</Label><Input name="confirmar_senha" type="password" required minLength={6} placeholder="Repita a senha" className="h-10" /></div>
              <Button type="submit" size="sm" variant="outline" disabled={updateSenha.isPending}>
                {updateSenha.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Alterar senha
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> Zona de Perigo</CardTitle>
            <CardDescription>Ações irreversíveis para a sua conta</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Excluir conta</p>
                <p className="text-xs text-muted-foreground">Remove permanentemente seus dados e acesso ao sistema</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-1" /> Excluir conta</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação é <strong>permanente e irreversível</strong>. Todos os seus dados — clientes, pedidos e obras associados — serão perdidos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deletarConta.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deletarConta.isPending}>
                      {deletarConta.isPending ? 'Excluindo...' : 'Sim, excluir minha conta'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const Configuracoes = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'perfil';
  const [alertDays, setAlertDays] = useState('5');

  const { data: isGestor } = useQuery({
    queryKey: ['is_gestor'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_gestor');
      if (error) throw error;
      return data as boolean;
    },
  });

  return (
    <AppLayout title="Configurações" subtitle={isGestor ? "Gerencie usuários, permissões e automações" : "Gerencie vendedores, permissões e automações"}>
      <div className="p-6">
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="perfil" className="gap-1.5"><UserCircle className="h-4 w-4" /> Perfil</TabsTrigger>
            <TabsTrigger value="vendedores" className="gap-1.5"><Users className="h-4 w-4" /> {isGestor ? 'Usuários' : 'Funcionários'}</TabsTrigger>
            <TabsTrigger value="automacao">Automação</TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="mt-4"><ProfileTab /></TabsContent>

          <TabsContent value="vendedores" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <CodigoAcessoButton />
            </div>
            <UsuariosTab />
          </TabsContent>

          <TabsContent value="automacao" className="mt-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alertas de Inatividade</CardTitle>
                  <CardDescription>Configure o tempo máximo que um pedido pode ficar parado</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label>Dias para alerta:</Label>
                    <Input type="number" value={alertDays} onChange={e => setAlertDays(e.target.value)} className="w-20" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">Notificação por email</p>
                      <p className="text-xs text-muted-foreground">Enviar email quando o pedido ficar parado</p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">Notificação no sistema</p>
                      <p className="text-xs text-muted-foreground">Mostrar alerta visual no Kanban</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Configuracoes;
