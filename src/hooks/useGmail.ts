import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { toast } from 'sonner';

export function useGmail() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tokenData, isLoading } = useQuery({
    queryKey: ['gmail_status', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('gmail_tokens')
        .select('email')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const connectGmail = async () => {
    try {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase.functions.invoke('gmail-auth-url', {
        body: { userId: user.id, timestamp: new Date().getTime() },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Erro ao conectar Gmail:', error);
      toast.error('Não foi possível iniciar a conexão com o Gmail');
    }
  };

  const disconnectGmailMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from('gmail_tokens')
        .delete()
        .eq('user_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmail_status'] });
      toast.success('Gmail desconectado com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao desconectar Gmail: ' + error.message);
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase.functions.invoke('gmail-send', {
        body: { userId: user.id, to, subject, body },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('E-mail enviado via Gmail');
    },
    onError: (error: any) => {
      toast.error('Erro ao enviar e-mail: ' + error.message);
    },
  });

  return {
    connectGmail,
    disconnectGmail: () => disconnectGmailMutation.mutate(),
    sendEmail: (to: string, subject: string, body: string) => 
      sendEmailMutation.mutateAsync({ to, subject, body }),
    isConnected: !!tokenData,
    connectedEmail: tokenData?.email || null,
    isLoading,
    isSending: sendEmailMutation.isPending,
  };
}
