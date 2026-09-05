import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  contatosComMesmoTelefone,
  contatosComNomeParecido,
  chaveDeTelefone,
} from '@/lib/contato-da-conversa';

/**
 * Reconhecer, pelo telefone, quem já está no CRM — e amarrar a conversa a essa ficha.
 *
 * 🔴 O DEFEITO QUE ISTO FECHA. Medido em produção em 28/08/2026:
 *
 *   conversas de pessoa (sem grupo) ..................... 757
 *   delas, ligadas a um contato do CRM ..................   0
 *   delas cujo telefone JÁ ESTÁ em `contatos` ...........  54
 *
 * O painel do lead decide o que mostrar por `conversa.contato_id`, e essa coluna só é escrita
 * quando alguém cadastra pela tela nova. **Ninguém nunca comparou o número da conversa com o
 * telefone dos contatos** — então, para 54 pessoas que ESTÃO cadastradas, o painel afirma
 * "Esta pessoa não está no CRM" e oferece cadastrar de novo. Quem aceitar cria um contato
 * repetido, com o histórico da pessoa rachado entre as duas fichas.
 *
 * Caso relatado pelo dono do produto e confirmado no banco: a ficha diz
 * "Lucas Dutra - Macam Empreendimentos", o WhatsApp mostra "Lucas - Macam Engenharia",
 * mesmo telefone. Repare que os NOMES divergem — casar por nome não resolveria; o telefone é
 * a única chave confiável.
 */

export interface ContatoReconhecido {
  id: string;
  nome_contato: string | null;
  telefone: string | null;
  cargo: string | null;
  cliente_id: string | null;
  /** Nome da empresa, para a pessoa conferir que é mesmo quem ela pensa antes de amarrar. */
  empresa: string | null;
}

/**
 * Só as colunas necessárias para reconhecer e mostrar — de propósito.
 *
 * `useContatos()` de `use-clientes.ts` também traria todos os contatos, mas com três junções
 * (cliente, quem criou, vínculos de obra) que a caixa do WhatsApp não usa para nada. Esta
 * consulta é a mesma varredura com uma fração do peso, e fica em cache por meia hora: o
 * telefone de um contato praticamente não muda, e a lista é relida sempre que alguém cadastra
 * (a chave `contatos` é invalidada pelas mutações de contato).
 *
 * 🔴 PAGINA ATÉ O FIM. O PostgREST corta em 1.000 linhas sem avisar, e esta base já tem 1.092
 * contatos — parar na primeira página deixaria ~92 pessoas invisíveis para o reconhecimento,
 * que é exatamente o tipo de "some em silêncio" que este arquivo existe para evitar.
 *
 * 🔴 O RECORTE POR EMPRESA É DO BANCO. A política de `contatos` só devolve os da empresa de
 * quem está logado. Medido: sem esse recorte, 2 conversas casariam com contato de OUTRA
 * empresa assinante.
 */
async function buscarContatosParaReconhecimento(): Promise<ContatoReconhecido[]> {
  const TAMANHO_DA_PAGINA = 1000;
  const todos: ContatoReconhecido[] = [];
  let de = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('contatos')
      .select('id, nome_contato, telefone, cargo, cliente_id, empresa, cliente:clientes!cliente_id(empresa)')
      .not('telefone', 'is', null)
      .range(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) throw error;

    const pagina = (data ?? []) as Record<string, unknown>[];
    todos.push(
      ...pagina.map((c) => ({
        id: String(c.id),
        nome_contato: (c.nome_contato as string) ?? null,
        telefone: (c.telefone as string) ?? null,
        cargo: (c.cargo as string) ?? null,
        cliente_id: (c.cliente_id as string) ?? null,
        // 🔴 O nome da empresa tem DUAS moradas — mesma armadilha do seletor de contatos da
        // obra: quem tem cliente amarrado traz pelo vínculo, o cadastro antigo tem só o texto
        // solto em `contatos.empresa`. Ler uma só deixaria metade sem empresa na tela, e a
        // pessoa amarraria sem saber de quem é o contato.
        empresa:
          ((c.cliente as { empresa?: string } | null)?.empresa) ?? ((c.empresa as string) ?? null),
      })),
    );

    if (pagina.length < TAMANHO_DA_PAGINA) break;
    de += TAMANHO_DA_PAGINA;
  }

  return todos;
}

/**
 * Quem, no CRM, tem este telefone.
 *
 * Devolve LISTA: 44 telefones desta base aparecem em mais de um contato (a mesma pessoa
 * cadastrada duas vezes, ou o telefone da recepção repetido entre funcionários). Ver
 * `contatosComMesmoTelefone`.
 */
export function useContatosComEsteTelefone(
  telefone: string | null | undefined,
  habilitado: boolean,
) {
  // Sem chave válida (grupo, estrangeiro, número curto) nem vale consultar.
  const temChave = chaveDeTelefone(telefone) !== null;

  const consulta = useQuery({
    queryKey: ['contatos_para_reconhecimento'],
    queryFn: buscarContatosParaReconhecimento,
    enabled: habilitado && temChave,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });

  const encontrados = useMemo(
    () => contatosComMesmoTelefone(telefone, consulta.data),
    [telefone, consulta.data],
  );

  return { encontrados, carregando: consulta.isLoading, temChave };
}

/**
 * Quem, no CRM, tem NOME parecido com o desta conversa — a segunda camada de reconhecimento.
 *
 * 🔴 O CASO QUE ISTO ATENDE, levantado pelo dono do produto em 04/09/2026: a pessoa fala do
 * celular pessoal e o cadastro tem o fixo da empresa. O telefone nunca casa, a tela afirma "esta
 * pessoa não está no CRM", e nasce a ficha repetida.
 *
 * 🔴 É PALPITE, e a tela precisa dizer isso. Aferido à mão: acerta ~2 em cada 3, e o terço que
 * erra costuma apontar um COLEGA DA MESMA CONSTRUTORA — o engano mais fácil de aceitar sem
 * perceber. Ver `contatosComNomeParecido` para a régua e os números.
 *
 * Reaproveita EXATAMENTE a mesma busca do reconhecimento por telefone (mesma `queryKey`), então
 * não custa consulta nenhuma a mais: o TanStack devolve o que já está em cache.
 *
 * Diferente do de telefone, este não exige chave de telefone válida — é justamente quando o
 * número é estranho que o nome é a única pista que sobra.
 */
export function useContatosParecidos(
  nomeDaConversa: string | null | undefined,
  habilitado: boolean,
) {
  const consulta = useQuery({
    queryKey: ['contatos_para_reconhecimento'],
    queryFn: buscarContatosParaReconhecimento,
    enabled: habilitado,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });

  const parecidos = useMemo(
    () => contatosComNomeParecido(nomeDaConversa, consulta.data),
    [nomeDaConversa, consulta.data],
  );

  return { parecidos, carregando: consulta.isLoading };
}

/**
 * Amarra a conversa a um contato que JÁ EXISTE.
 *
 * 🔴 NUNCA amarra sozinho. O vínculo é gravado por um clique da pessoa, e não pelo simples
 * reconhecimento, por três razões medidas:
 *
 *   1. o mesmo telefone pode pertencer a mais de um contato (44 casos), e escolher no escuro
 *      grava o vínculo errado — que é pior que vínculo nenhum, porque some da vista;
 *   2. telefone de recepção ou de escritório é compartilhado por gente diferente;
 *   3. escrever sozinho em 757 conversas, a partir de uma comparação aproximada, é uma
 *      correção em massa disfarçada de conveniência — e não teria como ser desfeita em bloco.
 *
 * O cliente vem junto quando o contato tem um: é o que faz o bloco "Dados do lead" aparecer
 * completo. Quando o contato não tem cliente, `cliente_id` fica como está — não inventamos.
 */
export function useVincularContatoExistente() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversaId,
      contatoId,
      clienteId,
    }: {
      conversaId: string;
      contatoId: string;
      clienteId?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .update({
          contato_id: contatoId,
          ...(clienteId ? { cliente_id: clienteId } : {}),
        })
        .eq('id', conversaId)
        // 🔴 `.select` para saber se a regra do banco DEIXOU gravar. Um update que não casa
        // nenhuma linha NÃO devolve erro no PostgREST — sem isto a tela diria "vinculado" e
        // nada teria mudado, que é o defeito repetido em quatro telas deste sistema.
        .select('id');
      if (error) throw error;
      if (!data?.length) {
        throw new Error('A regra de segurança do banco recusou a alteração desta conversa.');
      }
      return data[0];
    },
    onSuccess: () => {
      // As mesmas chaves que `useCriarContatoDaConversa` invalida — o efeito na tela é igual.
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
      qc.invalidateQueries({ queryKey: ['wa_lead_contato'] });
      qc.invalidateQueries({ queryKey: ['wa_lead_cliente'] });
    },
  });
}

/**
 * Desfaz o vínculo de uma conversa com o contato e a empresa.
 *
 * 🔴 POR QUE ISTO PRECISOU EXISTIR ANTES DE QUALQUER MUTIRÃO. Até 04/09/2026 **nenhum ponto do
 * sistema gravava `contato_id: null`**: dava para amarrar uma conversa a uma pessoa, nunca para
 * desamarrar. E o estrago de um vínculo errado é pior do que parece — o bloco de reconhecimento
 * (`CadastroDoLead`) só é desenhado quando NÃO há vínculo, então, assim que alguém clicava em
 * "Vincular" no contato errado, o convite sumia da tela e o painel passava a apontar para a ficha
 * errada sem nenhum caminho de volta.
 *
 * Era o cenário que o comentário de `useVincularContatoExistente` já descrevia — "o vínculo errado
 * é pior que vínculo nenhum, porque some da vista" — só que sem conserto.
 *
 * 🔴 APAGA OS DOIS, empresa e pessoa, de propósito. Limpar só a pessoa deixaria a conversa com
 * empresa e sem contato, e nesse estado o bloco de reconhecimento continua escondido — ou seja, o
 * "desvincular" não devolveria a conversa ao estado de onde ela veio, que é o único ponto de fazer
 * isto existir.
 */
export function useDesvincularConversa() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversaId }: { conversaId: string }) => {
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .update({ contato_id: null, cliente_id: null })
        .eq('id', conversaId)
        // Mesma guarda do vincular: update que não casa linha nenhuma NÃO devolve erro no
        // PostgREST. Sem isto a tela diria "desvinculado" sobre coisa que continua vinculada.
        .select('id');
      if (error) throw error;
      if (!data?.length) {
        throw new Error('A regra de segurança do banco recusou a alteração desta conversa.');
      }
      return data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa_conversas'] });
      qc.invalidateQueries({ queryKey: ['wa_lead_contato'] });
      qc.invalidateQueries({ queryKey: ['wa_lead_cliente'] });
    },
  });
}
