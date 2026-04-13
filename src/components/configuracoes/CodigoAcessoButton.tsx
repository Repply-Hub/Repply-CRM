import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function CodigoAcessoButton() {
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
