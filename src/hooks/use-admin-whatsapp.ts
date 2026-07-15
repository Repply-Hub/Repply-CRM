import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WaConfig } from './use-whatsapp-inbox';

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada');
  return session;
}

async function callAdminProvision(body: Record<string, unknown>) {
  const session = await getSession();
  const res = await supabase.functions.invoke('whatsapp-admin-provision', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.error) throw res.error;
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
}

// --- Criar nova instância (independente de usuário) ---
// target_usuario_id é opcional: se fornecido, vincula imediatamente ao criar.

export function useAdminCreateInstance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { targetUsuarioId?: string } = {}) => {
      return callAdminProvision({
        action: 'create',
        target_usuario_id: params.targetUsuarioId,
      }) as Promise<{ success: boolean; instanceName: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
      toast.success('Instância criada com sucesso');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao criar instância');
    },
  });
}

// --- Vincular instância a um usuário ---

export function useAdminLinkInstance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { instanceId: string; targetUsuarioId: string }) => {
      return callAdminProvision({
        action: 'link',
        instance_id: params.instanceId,
        target_usuario_id: params.targetUsuarioId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
      toast.success('Instância vinculada ao usuário');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao vincular instância');
    },
  });
}

// --- Desvincular um usuário específico de uma instância ---

export function useAdminUnlinkInstance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { instanceId: string; targetUsuarioId: string }) => {
      return callAdminProvision({
        action: 'unlink',
        instance_id: params.instanceId,
        target_usuario_id: params.targetUsuarioId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
      toast.success('Usuário desvinculado da instância');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao desvincular usuário');
    },
  });
}

// --- Remover instância (apaga da uazapi e do banco) ---

export function useAdminDeleteInstance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      return callAdminProvision({ action: 'delete', instance_id: instanceId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
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

// --- Sincronizar status de uma instância ---

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
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
    },
  });
}

// --- Desconectar instância ---

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
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
      toast.success('WhatsApp desconectado');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao desconectar');
    },
  });
}

// --- Definir apelido de exibição da instância (identificador técnico continua o mesmo) ---

export function useAdminSetApelido() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { instanceId: string; apelido: string | null }) => {
      const { error } = await supabase
        .from('configuracoes_wapi')
        .update({ apelido: params.apelido })
        .eq('id', params.instanceId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
      qc.invalidateQueries({ queryKey: ['wa_instancias'] });
      toast.success('Apelido atualizado');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao salvar apelido');
    },
  });
}

// Mantido por compatibilidade com código legado que ainda usa useAdminProvision
/** @deprecated Use useAdminCreateInstance */
export const useAdminProvision = useAdminCreateInstance;
