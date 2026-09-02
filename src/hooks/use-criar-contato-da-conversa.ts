import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (dados: NovoContatoDaConversa) => {
      const nome = dados.nome?.trim();
      if (!nome) throw new Error('Escreva o nome do contato.');
      if (!dados.telefone?.trim()) throw new Error('O contato precisa de um telefone.');

      // ── 1. Descobrir quem é o dono, NO SERVIDOR ───────────────────────────
      //
      // 🔴 Antes isto vinha de `profile?.id ?? null`, o estado do React. Numa sessão meio
      // carregada `profile` é nulo, e o `?? null` gravava um contato SEM dono — que a regra
      // de leitura de `contatos` mostrava para todas as empresas (docs/divida-tecnica.md §58).
      // `get_my_vendedor_id()` lê o login (`auth.uid()`) no banco e devolve `usuarios.id`;
      // se voltar vazio, a sessão não serve para gravar — mesmo padrão de `use-tarefas.ts`.
      const { data: usuarioId, error: erroUsuario } = await supabase.rpc('get_my_vendedor_id');
      if (erroUsuario || !usuarioId) {
        throw new Error('Usuário não encontrado. Faça login novamente.');
      }

      // ── 2. Criar o contato ────────────────────────────────────────────────
      //
      // `empresa_id` não vai no payload de propósito: um trigger no banco o preenche a
      // partir do login (get_my_empresa_id()), para o cliente nunca escolher a empresa.
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
          usuario_id: usuarioId,
          criado_por_usuario_id: usuarioId,
        })
        .select('id')
        .single();
      if (erroDoContato) throw erroDoContato;

      // ── 3. Amarrar a conversa ao contato ──────────────────────────────────
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
