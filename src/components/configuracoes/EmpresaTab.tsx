import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Trash2, Building2, Palette, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export function EmpresaTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: usuario } = useQuery({
    queryKey: ['usuario-empresa', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: empresa, isLoading } = useQuery({
    queryKey: ['dados-empresa', usuario?.empresa_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', usuario!.empresa_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!usuario?.empresa_id,
  });

  const updateEmpresa = useMutation({
    mutationFn: async (dados: any) => {
      const { error } = await supabase
        .from('empresas')
        .update(dados)
        .eq('id', usuario!.empresa_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dados-empresa', usuario?.empresa_id] });
      toast.success('Configurações da empresa atualizadas!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!e.target.files || e.target.files.length === 0) return;
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${user?.id}/logo-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('branding')
        .getPublicUrl(filePath);

      updateEmpresa.mutate({ logo_url: publicUrl });
    } catch (error: any) {
      toast.error('Erro ao fazer upload: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSalvar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    updateEmpresa.mutate({
      nome_fantasia: form.get('nome_fantasia'),
      subtitulo_header: form.get('subtitulo_header'),
      cor_primaria: form.get('cor_primaria'),
    });
  };

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!empresa) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Identidade Visual
            </CardTitle>
            <CardDescription>Personalize como sua empresa aparece no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvar} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome Fantasia</Label>
                <Input name="nome_fantasia" defaultValue={empresa.nome_fantasia || empresa.nome} placeholder="Ex: Minha Empresa" />
              </div>
              <div className="space-y-1.5">
                <Label>Slogan / Subtítulo</Label>
                <Input name="subtitulo_header" defaultValue={empresa.subtitulo_header} placeholder="Ex: Gestão Comercial" />
              </div>
              <div className="space-y-1.5">
                <Label>Cor Primária (Header/Sidebar)</Label>
                <div className="flex gap-2">
                  <Input name="cor_primaria" type="color" defaultValue={empresa.cor_primaria || '#0f172a'} className="w-12 h-10 p-1" />
                  <Input type="text" value={empresa.cor_primaria || '#0f172a'} readOnly className="flex-1" />
                </div>
              </div>
              <Button type="submit" disabled={updateEmpresa.isPending}>
                {updateEmpresa.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar Alterações
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" /> Logotipo
            </CardTitle>
            <CardDescription>Upload da logo para o cabeçalho e sidebar</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="w-32 h-32 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted/50">
              {empresa.logo_url ? (
                <img src={empresa.logo_url} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Building2 className="h-12 w-12 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="relative cursor-pointer" disabled={uploading}>
                <input
                  type="file"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  accept="image/*"
                  onChange={handleUploadLogo}
                  disabled={uploading}
                />
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload Logo
              </Button>
              {empresa.logo_url && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateEmpresa.mutate({ logo_url: null })}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
