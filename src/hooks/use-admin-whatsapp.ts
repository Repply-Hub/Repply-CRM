import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WaConfig } from './use-whatsapp-inbox';

// --- Provisionar instância para qualquer usuário (admin only) ---

export function useAdminProvision() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (targetUsuarioId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-admin-provision', {
        body: { action: 'provision', target_usuario_id: targetUsuarioId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data as { success: boolean; instanceName: string; alreadyProvisioned?: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao provisionar instância');
    },
  });
}

// --- Remover instância de qualquer usuário (admin only) ---

export function useAdminDeleteInstance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (targetUsuarioId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await supabase.functions.invoke('whatsapp-admin-provision', {
        body: { action: 'delete', target_usuario_id: targetUsuarioId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
      toast.success('Instância removida');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao remover instância');
    },
  });
}

// --- Conectar instância (gera QR) via config direta ---

export function useAdminConnect() {
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: config.api_key },
        body: JSON.stringify({}),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Erro ${res.status}: ${text}`);
      let data: Record<string, any> = {};
      try { data = JSON.parse(text); } catch { /* ok */ }

      const rawQr: string | null =
        data?.instance?.qrcode ??
        data?.qrcode?.base64 ??
        (typeof data?.qrcode === 'string' ? data.qrcode : null) ??
        data?.base64 ??
        null;
      const qr = rawQr && rawQr.length > 0 ? rawQr : null;

      const alreadyConnected: boolean =
        data?.connected === true ||
        data?.status?.connected === true ||
        data?.status?.loggedIn === true ||
        data?.instance?.status === 'connected' ||
        (typeof data?.response === 'string' && data.response.toLowerCase().includes('already connected'));

      return { qr, alreadyConnected, data };
    },
  });
}

// --- Sincronizar status de uma instância (atualiza por config.id) ---

export function useAdminSyncStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/instance/status`, {
        method: 'GET',
        headers: { token: config.api_key },
      });
      if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
      const data = await res.json();
      const isConnected: boolean =
        (data?.status?.connected === true && data?.status?.loggedIn === true) ||
        data?.connected === true;
      const dbStatus = isConnected ? 'connected' : 'disconnected';

      await supabase
        .from('configuracoes_wapi')
        .update({ status: dbStatus })
        .eq('id', config.id);

      return { isConnected, dbStatus };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
    },
  });
}

// --- Desconectar instância (atualiza por config.id) ---

export function useAdminDisconnect() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const baseUrl = config.instance_url.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/instance/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: config.api_key },
        body: JSON.stringify({}),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Erro ${res.status}: ${text}`);

      await supabase
        .from('configuracoes_wapi')
        .update({ status: 'disconnected' })
        .eq('id', config.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
      toast.success('WhatsApp desconectado');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao desconectar');
    },
  });
}
