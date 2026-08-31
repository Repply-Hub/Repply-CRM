import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS } from '@/lib/toggle-group-styles';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sun, Moon, Monitor, Loader2, Trash2, Users, UserCircle, Lock, AlertTriangle, Building2, Pencil, Camera, Crop, Globe, Mail, Smartphone, History, ListChecks, CreditCard } from 'lucide-react';
import { PagamentosTab } from '@/components/configuracoes/PagamentosTab';
import { podeGerenciarAssinatura } from '@/lib/plano-gate';
import { SidebarHistoricoDialog } from '@/components/configuracoes/SidebarHistoricoDialog';
import { AvatarCropDialog } from '@/components/configuracoes/AvatarCropDialog';
import { CamposTab } from '@/components/configuracoes/CamposTab';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { marcaDaEmpresa } from '@/lib/marca-da-empresa';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { UsuariosTab } from '@/components/configuracoes/UsuariosTab';
import { DominioTab } from '@/components/configuracoes/DominioTab';
import { WhatsAppInstanciasTab } from '@/components/configuracoes/WhatsAppInstanciasTab';
import { EmpresasTab } from '@/components/configuracoes/EmpresasTab';
import { AutomacaoTab } from '@/components/configuracoes/AutomacaoTab';
import { AssinaturaEmailEditor } from '@/components/configuracoes/AssinaturaEmailEditor';
import {
  montarRodapeEmailHtml,
  normalizarAssinaturaAntiga,
  sanitizarAssinaturaEmail,
} from '@/lib/assinatura-email';

const themeOptions = [
  { value: 'light' as const, label: 'Claro', icon: Sun, desc: 'Tema claro padrão' },
  { value: 'dark' as const, label: 'Escuro', icon: Moon, desc: 'Reduz o brilho da tela' },
  { value: 'system' as const, label: 'Sistema', icon: Monitor, desc: 'Segue a preferência do SO' },
];

function CustomizeTab() {
  const { theme, setTheme } = useTheme();
  const { profile } = useAuth();
  const isGestor = profile?.role === 'admin' || profile?.role === 'gestor' || profile?.role === 'empresa';
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const [historicoOpen, setHistoricoOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Pencil className="h-4 w-4 text-primary" /> Personalizar
        </CardTitle>
        <CardDescription>Gerencie a aparência e o menu lateral do sistema</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Sun className="h-3.5 w-3.5" /> Aparência
          </Label>
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
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5" /> Menu Lateral
              </Label>
              <p className="text-xs text-muted-foreground">
                Reorganize, oculte ou adicione itens à sidebar
                {isGestor && ' — ao salvar, você pode escolher entre salvar só para você ou como padrão para todos os funcionários da empresa'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {isGestor && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHistoricoOpen(true)}
                  className="gap-2 h-8"
                >
                  <History className="h-3.5 w-3.5" />
                  Histórico
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.dispatchEvent(new Event('sidebar-enter-edit'))}
                className="gap-2 h-8"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            </div>
          </div>

          {isGestor && (
            <SidebarHistoricoDialog open={historicoOpen} onOpenChange={setHistoricoOpen} empresaId={empresaId} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileTab() {
  const { user, profile, signOut } = useAuth();
  // A mesma marca que vai no topo dos PDFs exportados. Uma logo só, um lugar só para trocar
  // (a aba "Empresa") — antes esta tela tinha um upload próprio, num caminho global que uma
  // empresa sobrescrevia da outra.
  const marcaDaMinhaEmpresa = marcaDaEmpresa(profile);
  // A assinatura (e a logo do rodapé) só existem para serem anexadas ao e-mail
  // que o módulo de E-mail envia. Sem o módulo, é configuração sem efeito.
  const { ligada: temEmails } = useSecaoLigada('emails');
  const qc = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [assinaturaHtml, setAssinaturaHtml] = useState('');
  const [assinaturaModo, setAssinaturaModo] = useState<'texto' | 'imagem'>('texto');
  const [mostrarNomeImagem, setMostrarNomeImagem] = useState(true);
  const [mostrarEmpresaImagem, setMostrarEmpresaImagem] = useState(true);

  const { data: perfil, isLoading } = useQuery({
    queryKey: ['meu_perfil', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, telefone, role, avatar_url, assinatura_email, assinatura_imagem_mostrar_nome, assinatura_imagem_mostrar_empresa')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Seed uma vez por usuário (chave `perfil.id`, não `assinatura_email`): os
  // outros campos deste form (Nome, Telefone) também são não-controlados via
  // `defaultValue` e por isso também não voltam a sincronizar depois do
  // primeiro carregamento — isto mantém o editor de assinatura consistente
  // com esse mesmo comportamento, em vez de "piscar" pro valor recém-salvo a
  // cada `invalidateQueries` de `updatePerfil`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (perfil) {
      setAssinaturaHtml(normalizarAssinaturaAntiga(perfil.assinatura_email));
      setMostrarNomeImagem(perfil.assinatura_imagem_mostrar_nome ?? true);
      setMostrarEmpresaImagem(perfil.assinatura_imagem_mostrar_empresa ?? true);
    }
  }, [perfil?.id]);

  const updatePerfil = useMutation({
    mutationFn: async (dados: {
      nome?: string;
      telefone?: string;
      avatar_url?: string | null;
      assinatura_email?: string;
      assinatura_imagem_mostrar_nome?: boolean;
      assinatura_imagem_mostrar_empresa?: boolean;
    }) => {
      const { error } = await supabase.from('usuarios').update(dados).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meu_perfil'] });
      toast.success('Perfil atualizado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const editCurrentAvatar = () => {
    if (!perfil?.avatar_url) return;
    setCropImageSrc(perfil.avatar_url);
    setCropDialogOpen(true);
  };

  const uploadAvatar = async (blob: Blob) => {
    try {
      setIsUploading(true);
      const filePath = `${user!.id}/${Math.random()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      updatePerfil.mutate({ avatar_url: publicUrl });
    } catch (error: any) {
      toast.error('Erro ao fazer upload da imagem: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const updateEmail = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      await supabase.from('usuarios').update({ email }).eq('user_id', user!.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meu_perfil'] });
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
      // A linha em `usuarios` já foi apagada pelo RPC. Se o signOut falhar por
      // rede, o SDK mantém a sessão local e não emite SIGNED_OUT — a pessoa
      // ficaria numa tela logada com a conta inexistente. O replace garante a
      // saída de qualquer jeito; o token restante deixa de valer no servidor.
      try {
        await signOut();
      } finally {
        window.location.replace('/');
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSalvarPerfil = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    updatePerfil.mutate({
      nome: form.get('nome') as string,
      telefone: form.get('telefone') as string,
      // Com a seção de E-mails desligada o editor sai do DOM, e aí
      // `form.get('assinatura_email')` devolve null — que `sanitizarAssinaturaEmail`
      // transforma em string vazia. Mandar o campo assim APAGARIA a assinatura já
      // gravada a cada clique em "Salvar alterações", por uma mudança que era só
      // de tela, e ela não voltaria quando a seção fosse religada. Por isso o
      // campo é OMITIDO em vez de enviado vazio: some da tela, fica no banco.
      ...(temEmails === true
        ? {
            // Sanitiza antes de gravar, não só antes de enviar: mantém o que fica
            // salvo em `usuarios.assinatura_email` já limpo, em vez de confiar que
            // todo consumidor futuro desse campo (só o envio de e-mail sanitiza de
            // novo hoje) vá lembrar de tratar como HTML não confiável.
            assinatura_email: sanitizarAssinaturaEmail(form.get('assinatura_email') as string),
            // Mesmos hidden inputs de `AssinaturaEmailEditor` — presentes mesmo
            // quando os checkboxes não estão visíveis na tela (sem imagem
            // enviada ainda), por isso omitidos junto com `assinatura_email`
            // quando a seção de E-mails está desligada, e nunca por conta própria.
            assinatura_imagem_mostrar_nome: form.get('assinatura_imagem_mostrar_nome') === 'true',
            assinatura_imagem_mostrar_empresa: form.get('assinatura_imagem_mostrar_empresa') === 'true',
          }
        : {}),
    });
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

  const iniciais = (perfil.nome || 'Usuário').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-4 w-4 text-primary" /> Informações Pessoais</CardTitle>
            {/* A descrição acompanha o que o card de fato mostra: prometer
                "assinatura de e-mail" para quem não tem a seção manda a pessoa
                procurar um campo que não existe. */}
            <CardDescription>
              {temEmails === true
                ? 'Atualize seu nome, telefone e assinatura de e-mail'
                : 'Atualize seu nome e telefone'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-5">
              <div className="relative group">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden border border-border">
                  {perfil.avatar_url ? (
                    <img src={perfil.avatar_url} alt={perfil.nome} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{iniciais}</span>
                  )}
                </div>
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  <input type="file" accept="image/*" onChange={selectAvatarFile} disabled={isUploading} className="hidden" />
                </label>
              </div>
              <div className="min-w-0 flex-1">
                {/* Badge de cargo junto do nome (é identidade, não ação) —
                    separado das ações (trocar/editar/remover foto), que agora
                    ficam num bloco à parte, alinhado à direita do card. */}
                <p className="font-semibold flex flex-nowrap items-center gap-2 whitespace-nowrap">
                  {perfil.nome}
                  <Badge variant={perfil.role === 'admin' ? 'destructive' : perfil.role === 'gestor' || perfil.role === 'empresa' ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                    {{ admin: 'Admin', empresa: 'Empresa', gestor: 'Gestor', vendedor: 'Vendedor' }[perfil.role] || perfil.role}
                  </Badge>
                </p>
                <p className="whitespace-nowrap text-sm text-muted-foreground">{perfil.email}</p>
              </div>
              {/* `ml-auto` empurra este bloco para o espaço à direita do card
                  — o pai é `items-center`, então fica na mesma linha da foto
                  e do nome/e-mail, em vez de embaixo deles. */}
              <div className="ml-auto flex flex-nowrap items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 gap-1.5 text-xs"
                  disabled={isUploading}
                >
                  <label className="cursor-pointer">
                    {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    {perfil.avatar_url ? 'Alterar foto' : 'Adicionar foto'}
                    <input type="file" accept="image/*" onChange={selectAvatarFile} disabled={isUploading} className="hidden" />
                  </label>
                </Button>
                {perfil.avatar_url && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      disabled={isUploading}
                      onClick={editCurrentAvatar}
                    >
                      <Crop className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => updatePerfil.mutate({ avatar_url: null })}
                      disabled={updatePerfil.isPending}
                      title="Remover imagem"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <form onSubmit={handleSalvarPerfil} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nome</Label><Input name="nome" defaultValue={perfil.nome} placeholder="Seu nome completo" className="h-10" /></div>
                <div className="space-y-1.5"><Label>Telefone</Label><Input name="telefone" defaultValue={perfil.telefone ?? ''} placeholder="(00) 00000-0000" className="h-10" /></div>
              </div>
              {/* `=== true` (e não `!== false`) porque enquanto a resposta não
                  chega o certo é esconder: um editor que aparece e some no meio
                  do formulário é pior de usar que um que demora a aparecer. */}
              {temEmails === true && (
                <>
                  <div className="space-y-1.5">
                    <Label>Assinatura de E-mail</Label>
                    <AssinaturaEmailEditor
                      name="assinatura_email"
                      value={assinaturaHtml}
                      onChange={setAssinaturaHtml}
                      userId={user!.id}
                      onModoChange={setAssinaturaModo}
                      mostrarNomeImagem={mostrarNomeImagem}
                      onMostrarNomeImagemChange={setMostrarNomeImagem}
                      mostrarEmpresaImagem={mostrarEmpresaImagem}
                      onMostrarEmpresaImagemChange={setMostrarEmpresaImagem}
                    />
                  </div>
                  {(assinaturaHtml || perfil.nome) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-normal text-muted-foreground">
                        Como fica no rodapé do e-mail
                      </Label>
                      {/* Moldura própria (header + borda) em vez do branco solto de
                          antes: o CORPO precisa continuar branco fixo — é
                          exatamente o fundo sobre o qual o rodapé é composto no
                          envio real — mas sem um header em volta, esse branco
                          cru destoava muito do resto da tela no tema escuro,
                          como se tivesse quebrado. O header (no tom do próprio
                          tema, claro ou escuro) deixa claro que é uma
                          pré-visualização emoldurada, não um componente solto. */}
                      <div className="overflow-hidden rounded-md border">
                        <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Pré-visualização do e-mail
                          </span>
                        </div>
                        <div
                          className="bg-white p-3"
                          style={{ colorScheme: 'light' }}
                          dangerouslySetInnerHTML={{
                            __html: montarRodapeEmailHtml({
                              nome: perfil.nome ?? '',
                              assinaturaHtml,
                              logoUrl: marcaDaMinhaEmpresa.logoUrl,
                              nomeDaEmpresa: marcaDaMinhaEmpresa.nome,
                              mostrarLogo: assinaturaModo === 'texto',
                              isolado: true,
                              mostrarNome: assinaturaModo === 'texto' || mostrarNomeImagem,
                              mostrarNomeEmpresa: assinaturaModo === 'texto' || mostrarEmpresaImagem,
                            }),
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
              {/* 🔴 O UPLOAD DE LOGO SAIU DAQUI em 31/08/2026, e não sumiu: virou um campo
                  só, na aba "Empresa". Antes eram DOIS conceitos de logo — esta, do e-mail, e
                  nenhuma para o PDF — e esta gravava num caminho fixo, `logo-email.png`, o
                  MESMO para as dez empresas assinantes: uma sobrescrevia e APAGAVA a da outra,
                  e a regra do balde permitia isso a qualquer pessoa logada.
                  Agora a assinatura usa a mesma logo do cabeçalho dos PDFs. */}
              {temEmails === true && assinaturaModo === 'texto' && !marcaDaMinhaEmpresa.logoUrl && (
                <p className="text-xs text-muted-foreground">
                  Sua empresa ainda não tem logo. Quem for gestor pode enviá-la em
                  Configurações › Empresa — ela aparece aqui no rodapé e no topo dos PDFs
                  exportados.
                </p>
              )}

              <div className="flex justify-end pt-2">
                <Button type="submit" size="sm" disabled={updatePerfil.isPending}>
                  {updatePerfil.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Salvar alterações
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <CustomizeTab />
        {/* GmailSettings sai daqui: a conexão de e-mail passou a ser da EMPRESA,
            via Nylas, e mora na própria aba de E-mails. Deixar os dois caminhos
            visíveis daria duas portas para conectar e-mail fazendo coisas
            diferentes — e esta liga uma conta por usuário, que não é mais o
            modelo. O componente e as functions do Gmail continuam no repo até o
            Nylas provar estabilidade; só não têm mais entrada na interface. */}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Conta e Segurança
            </CardTitle>
            <CardDescription>Gerencie seu acesso e configurações de segurança</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-6">
            <div className="space-y-4 pb-6 border-b">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">E-mail</h3>
              </div>
              <form onSubmit={handleSalvarEmail} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>E-mail atual</Label>
                  <Input readOnly disabled value={perfil.email || user?.email || ''} className="h-10 bg-muted/50 cursor-not-allowed" />
                </div>
                <div className="space-y-1.5">
                  <Label>Novo e-mail</Label>
                  <Input name="email" type="email" required placeholder="Digite o novo e-mail" className="h-10" />
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" size="sm" disabled={updateEmail.isPending}>
                    {updateEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Atualizar e-mail
                  </Button>
                </div>
              </form>
            </div>

            <div className="space-y-4 pb-6 border-b">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Alterar Senha</h3>
              </div>
              <form onSubmit={handleSalvarSenha} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nova senha</Label>
                  <Input name="nova_senha" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirmar nova senha</Label>
                  <Input name="confirmar_senha" type="password" required minLength={6} placeholder="Repita a senha" className="h-10" />
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" size="sm" disabled={updateSenha.isPending}>
                    {updateSenha.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Alterar senha
                  </Button>
                </div>
              </form>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <h3 className="text-sm font-semibold uppercase tracking-wider">Zona de Perigo</h3>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Excluir conta</p>
                  <p className="text-xs text-muted-foreground max-w-[200px]">Remove permanentemente seus dados e acesso</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" /> Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação é <strong>permanente e irreversível</strong>. Todos os seus dados — clientes, negócios e obras associados — serão perdidos.
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    <AvatarCropDialog
      imageSrc={cropImageSrc}
      open={cropDialogOpen}
      onOpenChange={setCropDialogOpen}
      onConfirm={uploadAvatar}
    />
    </>
  );
}

const Configuracoes = () => {
  // A URL é a ÚNICA fonte da verdade da aba — não há estado local espelhando.
  //
  // Antes, `?tab=` era lido só na primeira montagem: estando já em
  // /configuracoes, clicar no avatar do topo (`?tab=perfil`) ou no item
  // "Usuários" da sidebar mudava a URL e não mudava a aba, porque a rota é a
  // mesma e a página não remonta. Só um F5 resolvia.
  //
  // A primeira tentativa de correção foi um useEffect sincronizando URL -> estado,
  // e ela era incompleta: como o clique numa aba mudava só o estado, os dois
  // saíam de sincronia, e daí em diante clicar num link cujo `?tab=` fosse igual
  // ao valor JÁ derivado não disparava o efeito (a dependência é uma string e
  // não mudava). Na prática: abrir Configurações, clicar em "Usuários" e depois
  // clicar no avatar não voltava para o Perfil — exatamente o caso que a
  // correção dizia resolver.
  //
  // Sem estado espelhado não há como divergir: trocar de aba escreve na URL, e
  // a aba mostrada sempre sai de lá. `replace` para não encher o histórico com
  // uma entrada por clique de aba.
  const [searchParams, setSearchParams] = useSearchParams();
  const abaDaUrl = searchParams.get('tab') === 'usuarios' ? 'vendedores' : (searchParams.get('tab') || 'perfil');
  // A aba WhatsApp some quando a empresa não tem a seção, e quem tiver
  // `?tab=whatsapp` nos favoritos cairia numa tela com a tira de abas e NADA
  // embaixo — sem erro, sem explicação. Cai no Perfil nesse caso.
  //
  // Aqui é `=== false` e não `!== true`, ao contrário do resto da cascata, e de
  // propósito: enquanto a resposta não chega, trocar a aba faria a tela de
  // Perfil aparecer inteira e sumir logo depois para quem TEM a seção — toda
  // vez que abrisse o favorito. Esconder o conteúdo enquanto carrega já é o que
  // as guardas abaixo fazem; trocar de aba é decisão que só se toma sabendo.
  const { ligada: temWhatsapp } = useSecaoLigada('whatsapp');
  // A aba Automação segue a MESMA regra, pela mesma razão: tudo o que ela configura é a
  // pauta da seção "Hoje" — dias parados, quantos itens, e o resumo por e-mail. Sem a
  // seção, cada controle ali grava um valor que nada lê. Era o que acontecia até
  // 26/08/2026: a empresa via a aba inteira com um aviso de que nada tinha efeito, o que
  // é a mesma armadilha que esta tela acabou de perder (ver o cabeçalho de AutomacaoTab).
  //
  // Some a aba, não o recurso: no dia em que a seção for ligada para a empresa, a aba
  // reaparece sozinha, já com tudo funcionando.
  const { ligada: temHoje } = useSecaoLigada('hoje');
  const abaDeSecaoDesligada =
    (abaDaUrl === 'whatsapp' && temWhatsapp === false) ||
    (abaDaUrl === 'automacao' && temHoje === false);
  const activeTab = abaDeSecaoDesligada ? 'perfil' : abaDaUrl;
  const setActiveTab = (aba: string) => setSearchParams({ tab: aba }, { replace: true });
  // A aba de Usuários usa layout de altura fixa (scroll interno nos cards); as demais rolam a página normalmente.
  const noPageScroll = activeTab === 'vendedores';
  const { profile, session } = useAuth();

  // Quem responde pela assinatura: o dono registrado da empresa ou qualquer gestor dela.
  // 🔴 Mesmo critério que a função `stripe-portal` já exige por baixo — esconder a aba com
  // uma regra DIFERENTE da que o servidor aplica é como o botão que só recusa no clique.
  const podeVerPagamentos = podeGerenciarAssinatura(profile, session);

  const { data: isGestor } = useQuery({
    queryKey: ['is_gestor'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_gestor');
      if (error) throw error;
      return data as boolean;
    },
  });

  const { data: isAdmin } = useQuery({
    queryKey: ['is_admin'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin');
      if (error) throw error;
      return data as boolean;
    },
  });

  /**
   * A aba "Empresa" segue `is_gestor()`, como TODAS as outras abas desta tela.
   *
   * 🔴 ELA ERA A ÚNICA FORA DO PADRÃO, e isso escondia a aba de quem o banco já autorizava.
   * Até 31/08/2026 a condição aqui era `role === 'empresa'` — só o papel de dono. Mas:
   *
   *   · a política `empresas_update` do banco libera `is_gestor() AND id = get_my_empresa_id()`
   *     desde 22/07/2026, criada justamente para o gestor poder regerar o código de acesso;
   *   · `is_gestor()` no banco cobre os papéis 'gestor', 'admin' E 'empresa';
   *   · o gestor JÁ grava nessa mesma tabela pela aba ao lado (o botão de código de acesso,
   *     em Usuários), e já configura campos, automação e menu da empresa inteira.
   *
   * Ou seja, a tela era mais restritiva que o banco sem nenhuma razão registrada — e o efeito
   * apareceu na MD Representações, a única das 10 empresas SEM ninguém de papel 'empresa': lá
   * nem o dono registrado via a aba, porque ele também é 'gestor'.
   *
   * Espera o `isAdmin` responder antes de mostrar. Sem isso, o admin global (que também passa
   * no `is_gestor`) veria por um instante a visão de empresa — e ele não tem empresa, então a
   * tela piscaria "Nenhuma empresa vinculada" antes de virar a lista.
   */
  const abaEmpresaLiberada = isGestor === true && isAdmin !== undefined;

  return (
    <AppLayout
      title="Configurações"
      subtitle={isGestor ? "Gerencie usuários, permissões e automações" : "Gerencie vendedores, permissões e automações"}
      mainClassName={noPageScroll ? "flex-1 overflow-hidden flex flex-col" : "flex-1 overflow-auto"}
    >
      <div className={cn("p-6", noPageScroll && "flex-1 flex flex-col min-h-0")}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className={cn(noPageScroll && "flex-1 flex flex-col min-h-0")}>
          <TabsList className={cn(TOGGLE_LIST_CLASS, noPageScroll && "flex-none self-start")}>
            <TabsTrigger value="perfil" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><UserCircle className="h-4 w-4" /> Perfil</TabsTrigger>
            {isGestor && (
              <TabsTrigger value="vendedores" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><Users className="h-4 w-4" /> Usuários</TabsTrigger>
            )}
            {isGestor && temWhatsapp === true && (
              <TabsTrigger value="whatsapp" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><Smartphone className="h-4 w-4" /> WhatsApp</TabsTrigger>
            )}
            {isGestor && temHoje === true && (
              <TabsTrigger value="automacao" className={TOGGLE_TRIGGER_CLASS}>Automação</TabsTrigger>
            )}
            {isGestor && (
              <TabsTrigger value="campos" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><ListChecks className="h-4 w-4" /> Campos</TabsTrigger>
            )}
            {abaEmpresaLiberada && (
              <TabsTrigger value="empresas" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><Building2 className="h-4 w-4" /> Empresa</TabsTrigger>
            )}
            {podeVerPagamentos && (
              <TabsTrigger value="pagamentos" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><CreditCard className="h-4 w-4" /> Pagamentos</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="perfil" className="mt-4"><ProfileTab /></TabsContent>

          {isGestor && (
            <TabsContent value="vendedores" className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden data-[state=inactive]:hidden">
              <UsuariosTab />
            </TabsContent>
          )}

          {/* O conteúdo some junto com o gatilho: sem isto, a URL direta ainda
              renderizaria o provisionamento de instâncias de uma seção que a
              empresa não contratou. */}
          {isGestor && temWhatsapp === true && (
            <TabsContent value="whatsapp" className="mt-4">
              <WhatsAppInstanciasTab />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="campos" className="mt-4">
              <CamposTab />
            </TabsContent>
          )}

          {/* O conteúdo some junto com o gatilho, pelo mesmo motivo do WhatsApp acima. */}
          {isGestor && temHoje === true && (
            <TabsContent value="automacao" className="mt-4">
              <AutomacaoTab empresaId={profile?.empresa_id ?? profile?.empresas?.id ?? undefined} />
            </TabsContent>
          )}
          {abaEmpresaLiberada && (
            <TabsContent value="empresas" className="mt-4">
              <EmpresasTab mode={isAdmin ? 'admin' : 'empresa'} />
            </TabsContent>
          )}
          {/* O conteúdo some junto com o gatilho: sem isto, a URL direta
              `/configuracoes?tab=pagamentos` mostraria preço e botão de assinar para um
              vendedor comum — que a função do servidor recusaria depois, no clique. */}
          {podeVerPagamentos && (
            <TabsContent value="pagamentos" className="mt-4">
              <PagamentosTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Configuracoes;
