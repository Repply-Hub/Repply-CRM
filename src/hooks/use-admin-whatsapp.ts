import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WaConfig } from './use-whatsapp-inbox';
import {
  corpoDoErroDaFunction,
  erroLegivelDaFunction,
  mensagemDeErroDaFunction,
} from '@/lib/erro-edge-function';
import { lerRespostaDeConexao, estaConectadoNaResposta } from '@/lib/whatsapp-instancia';

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
  // 🔴 A FRASE DO SERVIDOR MORRIA AQUI. `functions.invoke` devolve `{ data: null, error }`
  // para QUALQUER status fora de 2xx, e a mensagem desse erro é sempre a mesma frase fixa em
  // inglês — "Edge Function returned a non-2xx status code". O corpo, com a explicação em
  // português que a função escreveu, fica escondido dentro do erro e só sai por leitura
  // assíncrona. Lançar o objeto cru trocava toda recusa por essa frase genérica.
  //
  // Doía mais na ação `reconfigurar-webhook`, cujas respostas separam "nada foi mudado" de
  // "foi mudado pela metade" — e é essa diferença que diz se a pessoa pode repetir o clique.
  // Repetir depois de um envio que ACRESCENTOU endereço na operadora é o caminho para a
  // mensagem chegar em dobro.
  //
  // `erroLegivelDaFunction` lê o corpo e devolve um `Error` com a frase de verdade. Já era
  // usado três vezes neste mesmo arquivo; faltava no caminho que todas as ações atravessam.
  if (res.error) {
    // 🔴 E O `detail` PRECISA VIR JUNTO. `erroLegivelDaFunction` devolve só a frase que o
    // servidor escreveu (`error`), e descarta o `detail` — que é onde mora a resposta CRUA da
    // operadora, já sem a senha. Medido em 24/09/2026, no primeiro uso real: a tela disse "A
    // operadora recusou o novo endereço" e ninguém ficou sabendo POR QUE ela recusou. A frase
    // explica o que aconteceu do nosso lado; o detalhe é o que diz o que fazer a respeito.
    const frase = await mensagemDeErroDaFunction(res.error, 'Não foi possível completar a ação.');
    const corpo = await corpoDoErroDaFunction(res.error);
    const detalhe = typeof corpo?.detail === 'string' && corpo.detail.trim()
      ? ` — a operadora respondeu: ${corpo.detail.trim().slice(0, 300)}`
      : '';
    throw new Error(`${frase}${detalhe}`);
  }
  // Mantido por segurança: se algum dia uma ação responder 200 com `{ error }` no corpo, a
  // tela continua contando a verdade em vez de comemorar.
  if (res.data?.error) {
    const detail = res.data.detail ? `: ${res.data.detail}` : '';
    throw new Error(`${res.data.error}${detail}`);
  }
  return res.data;
}

// --- Criar nova instância (independente de usuário) ---
// target_usuario_id é opcional: se fornecido, vincula imediatamente ao criar.

export function useAdminCreateInstance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { targetUsuarioId?: string; targetUsuarioIds?: string[] } = {}) => {
      return callAdminProvision({
        action: 'create',
        target_usuario_id: params.targetUsuarioId,
        target_usuario_ids: params.targetUsuarioIds,
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
    mutationFn: async (params: { instanceId: string; targetUsuarioId?: string; targetUsuarioIds?: string[] }) => {
      return callAdminProvision({
        action: 'link',
        instance_id: params.instanceId,
        target_usuario_id: params.targetUsuarioId,
        target_usuario_ids: params.targetUsuarioIds,
      });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
      toast.success((variables.targetUsuarioIds?.length ?? 0) > 1 ? 'Instância vinculada a todos os usuários' : 'Instância vinculada ao usuário');
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

// --- Pôr o segredo no endereço do webhook (item 16 da dívida técnica) ---
//
// 🔴 POR QUE É UM BOTÃO, E NÃO UM SCRIPT. Esta ação fala com a operadora sobre o número de
// WhatsApp de um cliente pagante. Feita errada, as mensagens param de chegar EM SILÊNCIO, com
// a instância ainda aparecendo "conectada" na tela — já aconteceu neste sistema (`0715119`).
// Ser um botão, uma instância por vez, deixa o gesto deliberado e o resultado visível na hora.
//
// A função de servidor lê a configuração atual, devolve a MESMA com o endereço trocado, relê
// para conferir, e só então grava o segredo. Enquanto a conferência não for ligada (a etapa
// seguinte do plano), isto não muda nada para quem usa: o webhook continua aceitando todos.

export function useAdminReconfigurarWebhook() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      return callAdminProvision({
        action: 'reconfigurar-webhook',
        instance_id: instanceId,
      }) as Promise<{ ok: boolean; instance_name: string; conferido: boolean }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
      qc.invalidateQueries({ queryKey: ['wa_webhook_origem'] });
      toast.success(`Endereço do webhook protegido em ${data?.instance_name ?? 'a instância'}.`);
    },
    onError: (err: unknown) => {
      // A frase do servidor já diz o que aconteceu E se algo foi mudado. Não a substitua por
      // uma genérica: aqui a diferença entre "nada foi mudado" e "foi mudado pela metade" é o
      // que a pessoa precisa saber para decidir se repete.
      //
      // O `instanceof Error` é seguro AQUI (e não é o anti-padrão do CLAUDE.md §4.6): quem
      // lança é `erroLegivelDaFunction`, que já leu o corpo da resposta e devolve um `Error`
      // de verdade. O anti-padrão é usar isso em cima do objeto cru do Supabase.
      toast.error(err instanceof Error ? err.message : 'Não foi possível proteger o endereço do webhook.');
    },
  });
}

// --- Conectar instância (gera QR) via config direta ---

export function useAdminConnect() {
  return useMutation({
    mutationFn: async (config: WaConfig) => {
      // 🔴 A chamada sai do SERVIDOR (item 74, passo 2) — a chave da operadora não chega mais
      // ao navegador, nem ao do admin. A leitura da resposta é a mesma da caixa de entrada,
      // agora numa função só (antes esta lógica vivia duplicada nos dois arquivos).
      const res = await supabase.functions.invoke('whatsapp-instancia', {
        body: { acao: 'conectar', instancia_id: config.id },
      });
      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao gerar o QR code');

      const data = res.data?.payload ?? {};
      const { qr, jaConectado: alreadyConnected } = lerRespostaDeConexao(data);

      return { qr, alreadyConnected, data };
    },
  });
}

// --- Sincronizar status de uma instância ---

export function useAdminSyncStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (config: WaConfig) => {
      const res = await supabase.functions.invoke('whatsapp-instancia', {
        body: { acao: 'status', instancia_id: config.id },
      });
      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao conferir a conexão');
      const isConnected = estaConectadoNaResposta(res.data?.payload);
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
      const res = await supabase.functions.invoke('whatsapp-instancia', {
        body: { acao: 'desconectar', instancia_id: config.id },
      });
      if (res.error) throw await erroLegivelDaFunction(res.error, 'Erro ao desconectar');

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

// --- Definir cor de identificação da instância (badge na caixa de entrada) ---

export function useAdminSetCor() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { instanceId: string; cor: string | null }) => {
      const { error } = await supabase
        .from('configuracoes_wapi')
        .update({ cor: params.cor })
        .eq('id', params.instanceId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_wa_instancias'] });
      qc.invalidateQueries({ queryKey: ['wa_instancias'] });
      qc.invalidateQueries({ queryKey: ['empresa_wa_instancias'] });
      toast.success('Cor da instância atualizada');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar cor da instância');
    },
  });
}

// Mantido por compatibilidade com código legado que ainda usa useAdminProvision
/** @deprecated Use useAdminCreateInstance */
export const useAdminProvision = useAdminCreateInstance;
