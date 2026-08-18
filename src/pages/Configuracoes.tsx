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
import { Sun, Moon, Monitor, Loader2, Trash2, Users, UserCircle, Lock, AlertTriangle, Building2, Pencil, Camera, Crop, Globe, Mail, Smartphone, History, ListChecks, Upload } from 'lucide-react';
import { SidebarHistoricoDialog } from '@/components/configuracoes/SidebarHistoricoDialog';
import { AvatarCropDialog } from '@/components/configuracoes/AvatarCropDialog';
import { CamposTab } from '@/components/configuracoes/CamposTab';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { UsuariosTab } from '@/components/configuracoes/UsuariosTab';
import { DominioTab } from '@/components/configuracoes/DominioTab';
import { WhatsAppInstanciasTab } from '@/components/configuracoes/WhatsAppInstanciasTab';
import { EmpresasTab } from '@/components/configuracoes/EmpresasTab';
import { AssinaturaEmailEditor } from '@/components/configuracoes/AssinaturaEmailEditor';
import {
  LOGO_EMAIL_URL,
  montarRodapeEmailHtml,
  normalizarAssinaturaAntiga,
  sanitizarAssinaturaEmail,
} from '@/lib/assinatura-email';
import { validateFile } from '@/lib/file-validation';

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
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [assinaturaHtml, setAssinaturaHtml] = useState('');
  const [assinaturaModo, setAssinaturaModo] = useState<'texto' | 'imagem'>('texto');
  // Começa em Date.now() (não 0): o path no Storage é fixo, então um "?v=0"
  // reaproveitado em toda visita faria o navegador servir do cache HTTP a
  // logo de uma sessão anterior em vez de buscar a atual após um F5.
  const [logoVersion, setLogoVersion] = useState(() => Date.now());
  const [logoDragAtivo, setLogoDragAtivo] = useState(false);
  const [logoExiste, setLogoExiste] = useState(true);

  const { data: perfil, isLoading } = useQuery({
    queryKey: ['meu_perfil', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, telefone, role, avatar_url, assinatura_email')
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
    if (perfil) setAssinaturaHtml(normalizarAssinaturaAntiga(perfil.assinatura_email));
  }, [perfil?.id]);

  const updatePerfil = useMutation({
    mutationFn: async (dados: { nome?: string; telefone?: string; avatar_url?: string | null; assinatura_email?: string }) => {
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
      // Sanitiza antes de gravar, não só antes de enviar: mantém o que fica
      // salvo em `usuarios.assinatura_email` já limpo, em vez de confiar que
      // todo consumidor futuro desse campo (só o envio de e-mail sanitiza de
      // novo hoje) vá lembrar de tratar como HTML não confiável.
      assinatura_email: sanitizarAssinaturaEmail(form.get('assinatura_email') as string),
    });
  };

  const uploadEmailLogo = async (file: File) => {
    if (!validateFile(file, {
      allowedMimePrefixes: ['image/'],
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
      maxBytes: 5 * 1024 * 1024, // 5 MB
    })) return;

    try {
      setIsUploading(true);
      const filePath = `logo-email.png`;

      // upsert: true para substituir a logo existente — o path é fixo de
      // propósito (uma logo por empresa hoje), então o mesmo arquivo é
      // sobrescrito a cada troca.
      const { error: uploadError } = await supabase.storage
        .from('email-assets')
        .upload(filePath, file, { upsert: true, contentType: file.type || 'image/png' });

      if (uploadError) throw uploadError;

      // O path no Storage não muda, então o browser (e um eventual CDN)
      // continuariam servindo a imagem antiga do cache sem isto.
      setLogoVersion(Date.now());
      setLogoExiste(true);
      toast.success('Logo da empresa atualizada com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao carregar logo: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const removerLogoEmail = async () => {
    try {
      setIsUploading(true);
      const { error } = await supabase.storage.from('email-assets').remove(['logo-email.png']);
      if (error) throw error;
      setLogoVersion(Date.now());
      setLogoExiste(false);
      toast.success('Logo removida.');
    } catch (error: any) {
      toast.error('Erro ao remover logo: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const selecionarLogoPorInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) uploadEmailLogo(file);
  };

  const arrastarLogo = (ativo: boolean) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setLogoDragAtivo(ativo);
  };

  const soltarLogo = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setLogoDragAtivo(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadEmailLogo(file);
  };

  // Área precisa de `tabIndex` (aplicado no elemento) pra ser focável: evento
  // `paste` só chega em elementos com foco (ou em inputs/textareas).
  const colarLogo = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    uploadEmailLogo(file);
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
            <CardDescription>Atualize seu nome, telefone e assinatura de e-mail</CardDescription>
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
              <div>
                {/* Badge de cargo junto do nome (é identidade, não ação) —
                    separado da linha de baixo, que fica só com as ações
                    sobre a foto (trocar/editar/remover), em vez de misturar
                    os dois tipos de coisa na mesma linha. */}
                <p className="font-semibold flex items-center gap-2">
                  {perfil.nome}
                  <Badge variant={perfil.role === 'admin' ? 'destructive' : perfil.role === 'gestor' || perfil.role === 'empresa' ? 'default' : 'secondary'} className="text-[10px]">
                    {{ admin: 'Admin', empresa: 'Empresa', gestor: 'Gestor', vendedor: 'Vendedor' }[perfil.role] || perfil.role}
                  </Badge>
                </p>
                <p className="text-sm text-muted-foreground">{perfil.email}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
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
            </div>
            <form onSubmit={handleSalvarPerfil} className="space-y-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input name="nome" defaultValue={perfil.nome} placeholder="Seu nome completo" className="h-10" /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input name="telefone" defaultValue={perfil.telefone ?? ''} placeholder="(00) 00000-0000" className="h-10" /></div>
              <div className="space-y-1.5">
                <Label>Assinatura de E-mail</Label>
                <AssinaturaEmailEditor
                  name="assinatura_email"
                  value={assinaturaHtml}
                  onChange={setAssinaturaHtml}
                  userId={user!.id}
                  onModoChange={setAssinaturaModo}
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
                          logoUrl: `${LOGO_EMAIL_URL}?v=${logoVersion}`,
                          mostrarLogo: assinaturaModo === 'texto',
                          logoCarregou: logoExiste,
                          isolado: true,
                        }),
                      }}
                    />
                  </div>
                </div>
              )}
              {/* Logotipo da empresa: dentro do mesmo form, mas discreto de
                  propósito — é uma configuração da empresa (exclusiva de
                  gestores/admin), não um dado pessoal, então não compete em
                  destaque com os campos acima. Os botões aqui são
                  `type="button"` com upload próprio (instantâneo, fora do
                  submit do form) — só ficam dentro do form pra "Salvar
                  alterações" poder vir depois deles no layout.
                  Some quando a aba "Imagem" está selecionada — mesmo antes de
                  um arquivo ser enviado: é exclusivo do modo texto, já que o
                  rodapé some com a logo nesse caso (`mostrarLogo` acima) e
                  oferecer o upload aqui seria uma configuração sem efeito
                  nenhum. Usa `assinaturaModo` (a aba selecionada no editor),
                  não o formato do `assinaturaHtml`: o valor só vira `<img>`
                  depois que uma imagem é de fato enviada, e antes disso os
                  dois modos ficam com o mesmo valor `''`. */}
              {(perfil.role === 'admin' || perfil.role === 'gestor' || perfil.role === 'empresa') && assinaturaModo === 'texto' && (
                <div
                  tabIndex={0}
                  className={cn(
                    'flex items-center gap-3 rounded-md border border-dashed px-3 py-2 outline-none transition-colors',
                    logoDragAtivo && 'border-primary bg-primary/5',
                  )}
                  onDragOver={arrastarLogo(true)}
                  onDragEnter={arrastarLogo(true)}
                  onDragLeave={arrastarLogo(false)}
                  onDrop={soltarLogo}
                  onPaste={colarLogo}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted/50 overflow-hidden">
                    {logoExiste ? (
                      <img
                        key={logoVersion}
                        src={`${LOGO_EMAIL_URL}?v=${logoVersion}`}
                        alt="Logo da Empresa"
                        className="max-h-9 max-w-9 object-contain"
                        onLoad={() => setLogoExiste(true)}
                        onError={() => setLogoExiste(false)}
                      />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">Logotipo da empresa</p>
                    <p className="truncate text-[10px] text-muted-foreground/70">Aparece no rodapé dos e-mails enviados</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" asChild disabled={isUploading} className="h-7 gap-1.5 text-xs">
                      <label className="cursor-pointer">
                        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {logoExiste ? 'Trocar' : 'Enviar'}
                        <input type="file" accept="image/*" onChange={selecionarLogoPorInput} disabled={isUploading} className="hidden" />
                      </label>
                    </Button>
                    {logoExiste && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={removerLogoEmail}
                        disabled={isUploading}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
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
  const activeTab = abaDaUrl;
  const setActiveTab = (aba: string) => setSearchParams({ tab: aba }, { replace: true });
  // A aba de Usuários usa layout de altura fixa (scroll interno nos cards); as demais rolam a página normalmente.
  const noPageScroll = activeTab === 'vendedores';
  const [alertDays, setAlertDays] = useState('5');
  const { profile } = useAuth();
  const isEmpresaRole = profile?.role === 'empresa';

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
            {isGestor && (
              <TabsTrigger value="whatsapp" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><Smartphone className="h-4 w-4" /> WhatsApp</TabsTrigger>
            )}
            {isGestor && (
              <TabsTrigger value="automacao" className={TOGGLE_TRIGGER_CLASS}>Automação</TabsTrigger>
            )}
            {isGestor && (
              <TabsTrigger value="campos" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><ListChecks className="h-4 w-4" /> Campos</TabsTrigger>
            )}
            {(isAdmin || isEmpresaRole) && (
              <TabsTrigger value="empresas" className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}><Building2 className="h-4 w-4" /> Empresa</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="perfil" className="mt-4"><ProfileTab /></TabsContent>

          {isGestor && (
            <TabsContent value="vendedores" className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden data-[state=inactive]:hidden">
              <UsuariosTab />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="whatsapp" className="mt-4">
              <WhatsAppInstanciasTab />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="campos" className="mt-4">
              <CamposTab />
            </TabsContent>
          )}


          {isGestor && (
            <TabsContent value="automacao" className="mt-4">
              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Alertas de Inatividade</CardTitle>
                    <CardDescription>Configure o tempo máximo que um negócio pode ficar parado</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Label>Dias para alerta:</Label>
                      <Input type="number" value={alertDays} onChange={e => setAlertDays(e.target.value)} className="w-20" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-card-foreground">Notificação por email</p>
                        <p className="text-xs text-muted-foreground">Enviar email quando o negócio ficar parado</p>
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
          )}
          {(isAdmin || isEmpresaRole) && (
            <TabsContent value="empresas" className="mt-4">
              <EmpresasTab mode={isAdmin ? 'admin' : 'empresa'} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Configuracoes;
