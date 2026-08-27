import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

/**
 * Abrir um contato no CRM a partir de uma conversa de WhatsApp, e amarrar os dois.
 *
 * 🔴 O BURACO QUE ISTO FECHA. Medido em produção em 27/08/2026: das 779 conversas de WhatsApp
 * da MD, ZERO estão ligadas a um contato ou a um cliente do cadastro. Não é descuido da equipe —
 * **não existia tela que gravasse esse vínculo**. As colunas `contato_id` e `cliente_id` da
 * conversa eram lidas em três lugares do painel do lead e nunca escritas em lugar nenhum, então
 * o painel "Dados do lead" nunca aparecia: ele só é desenhado quando há um dos dois.
 *
 * O gesto tem duas partes, e a ordem importa.
 */
export interface NovoContatoDaConversa {
  conversaId: string;
  nome: string;
  telefone: string;
  email?: string | null;
  cargo?: string | null;
  /** Cliente a que a pessoa pertence. Opcional — dá para cadastrar e amarrar depois. */
  clienteId?: string | null;
  /** Nome da empresa, quando não há cliente cadastrado ainda. */
  empresa?: string | null;
}

export function useCriarContatoDaConversa() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (dados: NovoContatoDaConversa) => {
      const nome = dados.nome?.trim();
      if (!nome) throw new Error('Escreva o nome do contato.');
      if (!dados.telefone?.trim()) throw new Error('O contato precisa de um telefone.');

      // ── 1. Criar o contato ────────────────────────────────────────────────
      //
      // 🔴 `usuario_id` é `usuarios.id` (a linha da nossa tabela), NÃO `usuarios.user_id` (o
      // login). São identificadores diferentes da mesma pessoa e o nome da coluna não diz qual
      // é qual — mandar o errado faz a chave estrangeira recusar a gravação inteira, e a tela
      // mostra uma frase genérica sem nada explicando (CLAUDE.md §4.5).
      const { data: contato, error: erroDoContato } = await supabase
        .from('contatos')
        .insert({
          nome_contato: nome,
          telefone: dados.telefone.trim(),
          email: dados.email?.trim() || null,
          cargo: dados.cargo?.trim() || null,
          cliente_id: dados.clienteId || null,
          empresa: dados.empresa?.trim() || null,
          data_criacao: new Date().toISOString(),
          usuario_id: profile?.id ?? null,
          criado_por_usuario_id: profile?.id ?? null,
        })
        .select('id')
        .single();
      if (erroDoContato) throw erroDoContato;

      // ── 2. Amarrar a conversa ao contato ──────────────────────────────────
      //
      // 🔴 DEPOIS de criar, e com a falha tratada à parte. Se esta segunda gravação falhar, o
      // contato JÁ EXISTE e está correto — o que se perde é só o atalho entre a conversa e a
      // ficha. Derrubar tudo com um erro faria a pessoa cadastrar de novo e criar um contato
      // repetido, que é bem pior que um vínculo faltando.
      const { error: erroDoVinculo } = await supabase
        .from('whatsapp_conversas')
        .update({
          contato_id: contato.id,
          ...(dados.clienteId ? { cliente_id: dados.clienteId } : {}),
        })
        .eq('id', dados.conversaId);

      return {
        contatoId: contato.id as string,
        vinculou: !erroDoVinculo,
      };
    },
    onSuccess: () => {
      // A conversa mudou (ganhou vínculo) e o cadastro ganhou gente nova.
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
      qc.invalidateQueries({ queryKey: ['wa_lead_contato'] });
      qc.invalidateQueries({ queryKey: ['wa_lead_cliente'] });
      qc.invalidateQueries({ queryKey: ['contatos'] });
      qc.invalidateQueries({ queryKey: ['contatos_do_cliente'] });
      qc.invalidateQueries({ queryKey: ['destinos-whatsapp'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}
