import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const TEMPLATES = {
  cobranca: (clienteNome: string) =>
    `Olá! Estou entrando em contato sobre o orçamento pendente da empresa ${clienteNome}. Podemos conversar sobre o andamento?`,
  relacionamento: (clienteNome: string) =>
    `Olá! Tudo bem? Sou da MD Representações e gostaria de saber como está tudo por aí na ${clienteNome}. Estou à disposição para qualquer necessidade!`,
} as const;

export type TipoMensagem = keyof typeof TEMPLATES;

function formatPhone(phone: string): string {
  // Remove tudo que não é número
  const digits = phone.replace(/\D/g, '');
  // Se não começa com 55, adiciona
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const formattedPhone = formatPhone(phone);
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}

export function getMessageTemplate(tipo: TipoMensagem, clienteNome: string): string {
  return TEMPLATES[tipo](clienteNome);
}

export function useSendWhatsApp() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      usuario_id: string;
      pedido_id?: string;
      cliente_id?: string;
      telefone: string;
      tipo: TipoMensagem;
      clienteNome: string;
    }) => {
      const conteudo = getMessageTemplate(params.tipo, params.clienteNome);
      const url = buildWhatsAppUrl(params.telefone, conteudo);

      // Registrar no banco antes de abrir
      const { error } = await supabase.from('mensagens_whatsapp').insert({
        usuario_id: params.usuario_id,
        pedido_id: params.pedido_id || null,
        cliente_id: params.cliente_id || null,
        telefone_destino: params.telefone,
        tipo_mensagem: params.tipo,
        conteudo,
        metodo: 'wa_me_link',
      });

      if (error) throw error;

      // Abrir WhatsApp em nova aba
      window.open(url, '_blank');

      return { url };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mensagens_whatsapp'] });
    },
  });
}
