import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * 🔴 O NOME DA EMPRESA VEM DE FORA, e não chumbado.
 *
 * Até 31/08/2026 o texto de relacionamento dizia "Sou da MD Representações" — para as dez
 * empresas assinantes. E este não é um texto interno: ele abre o WhatsApp já preenchido, e no
 * atalho do sino (`NotificationCenter.tsx`) vai DIRETO, sem tela de edição. Um vendedor da JHS
 * clicava e mandava, ao cliente dele, uma apresentação em nome de outra representação.
 *
 * Sem nome de empresa a frase perde a apresentação em vez de inventar uma — quem está
 * escrevendo sabe quem é.
 */
const TEMPLATES = {
  cobranca: (clienteNome: string) =>
    `Olá! Estou entrando em contato sobre o orçamento pendente da empresa ${clienteNome}. Podemos conversar sobre o andamento?`,
  relacionamento: (clienteNome: string, minhaEmpresa: string) =>
    minhaEmpresa
      ? `Olá! Tudo bem? Sou da ${minhaEmpresa} e gostaria de saber como está tudo por aí na ${clienteNome}. Estou à disposição para qualquer necessidade!`
      : `Olá! Tudo bem? Gostaria de saber como está tudo por aí na ${clienteNome}. Estou à disposição para qualquer necessidade!`,
} as const;

export type TipoMensagem = keyof typeof TEMPLATES;

function formatPhone(phone: string): string {
  const firstPhone = phone.split(',')[0] ?? phone;
  // Remove tudo que não é número
  const digits = firstPhone.replace(/\D/g, '');
  // Se não começa com 55, adiciona
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const formattedPhone = formatPhone(phone);
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}

export function getMessageTemplate(
  tipo: TipoMensagem,
  clienteNome: string,
  minhaEmpresa = '',
): string {
  return TEMPLATES[tipo](clienteNome, minhaEmpresa);
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
