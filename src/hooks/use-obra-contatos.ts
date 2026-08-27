import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calcularDiffDeVinculos } from '@/lib/obra-contatos-diff';

export interface ObraContato {
  id: string;
  nomeContato: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
}

interface ContatoRow {
  id: string;
  nome_contato: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
}

/** Invalida tudo que mostra o vínculo obra↔contato, dos dois lados. */
function invalidarVinculos(qc: ReturnType<typeof useQueryClient>) {
  // `obra_contatos` é a seção da ficha da obra; `contatos` e `clientes` são as
  // listas que mostram as obras do contato. Esquecer uma delas deixa metade da
  // tela contando uma história diferente da outra metade.
  ['obra_contatos', 'contato_obras', 'contatos', 'contatos_do_cliente', 'clientes'].forEach((chave) =>
    qc.invalidateQueries({ queryKey: [chave] })
  );
}

/**
 * Contatos vinculados a esta obra — pela tabela de junção `obra_contatos`
 * (migration `20260827120000_obra_contatos.sql`), que substituiu a coluna
 * `contatos.obra_id` quando o vínculo virou lista dos dois lados.
 *
 * Lista simples, sem agregação, então não precisa de RPC (CLAUDE.md §6.4 é
 * sobre soma/contagem, não sobre listar).
 */
export function useContatosDaObra(obraId?: string | null) {
  return useQuery({
    queryKey: ['obra_contatos', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('obra_contatos')
        .select('contato:contatos!contato_id(id, nome_contato, cargo, email, telefone)')
        .eq('obra_id', obraId!);
      if (error) throw error;
      return ((data ?? []) as unknown as { contato: ContatoRow | null }[])
        .map((linha) => linha.contato)
        .filter((c): c is ContatoRow => !!c)
        .map((c) => ({
          id: c.id,
          nomeContato: c.nome_contato,
          cargo: c.cargo,
          email: c.email,
          telefone: c.telefone,
        }))
        // Ordenar aqui e não no banco: a ordenação teria que ser pela coluna da
        // tabela juntada, e o PostgREST não ordena por ela de forma confiável.
        // São poucos contatos por obra.
        .sort((a, b) => (a.nomeContato || '').localeCompare(b.nomeContato || '', 'pt-BR'));
    },
    enabled: !!obraId,
  });
}

/**
 * Contatos de UM cliente, para o seletor de vínculo da obra.
 *
 * Consulta própria em vez de reaproveitar `useContatos()`: aquele hook puxa a
 * tabela inteira em páginas de mil linhas para alimentar a tela de Clientes, e
 * o seletor precisa de meia dúzia de nomes de um cliente só.
 */
export function useContatosDoCliente(clienteId?: string | null, empresaNome?: string | null) {
  return useQuery({
    queryKey: ['contatos_do_cliente', clienteId, empresaNome],
    queryFn: async () => {
      const COLUNAS = 'id, nome_contato, cargo, email, telefone';

      const { data: porFk, error } = await supabase
        .from('contatos')
        .select(COLUNAS)
        .eq('cliente_id', clienteId!)
        .order('nome_contato');
      if (error) throw error;

      const achados = new Map<string, ContatoRow>();
      ((porFk ?? []) as ContatoRow[]).forEach((c) => achados.set(c.id, c));

      // Contato antigo costuma ter só o NOME da empresa em texto, sem `cliente_id`
      // preenchido (o cadastro gravava assim, e os fluxos de "Vincular empresa"
      // também). Sem esta segunda busca, a ficha do cliente mostra seis contatos e o
      // seletor da obra mostra dois — e o usuário recadastra a mesma pessoa.
      //
      // Duas consultas em vez de um `.or(...)`: o filtro `or` do PostgREST vai na URL
      // separado por vírgula, e nome de construtora com vírgula ("Alfa Engenharia,
      // Ltda") quebraria o filtro inteiro em silêncio.
      if (empresaNome) {
        const { data: porTexto, error: erroTexto } = await supabase
          .from('contatos')
          .select(COLUNAS)
          .is('cliente_id', null)
          .eq('empresa', empresaNome)
          .order('nome_contato');
        if (erroTexto) throw erroTexto;
        ((porTexto ?? []) as ContatoRow[]).forEach((c) => achados.set(c.id, c));
      }

      return [...achados.values()]
        .map((c) => ({
          id: c.id,
          nomeContato: c.nome_contato,
          cargo: c.cargo,
          email: c.email,
          telefone: c.telefone,
        }))
        .sort((a, b) => (a.nomeContato || '').localeCompare(b.nomeContato || '', 'pt-BR')) as ObraContato[];
    },
    enabled: !!clienteId,
  });
}

export interface ObraDoContato {
  id: string;
  nomeObra: string | null;
}

/** As obras de um contato — o outro lado do mesmo vínculo, para a ficha do contato. */
export function useObrasDoContato(contatoId?: string | null) {
  return useQuery({
    queryKey: ['contato_obras', contatoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('obra_contatos')
        .select('obra:obras!obra_id(id, nome_obra)')
        .eq('contato_id', contatoId!);
      if (error) throw error;
      return ((data ?? []) as unknown as { obra: { id: string; nome_obra: string | null } | null }[])
        .map((l) => l.obra)
        .filter((o): o is { id: string; nome_obra: string | null } => !!o)
        .map((o) => ({ id: o.id, nomeObra: o.nome_obra }))
        .sort((a, b) => (a.nomeObra || '').localeCompare(b.nomeObra || '', 'pt-BR'));
    },
    enabled: !!contatoId,
  });
}

/**
 * Grava a lista de contatos de uma obra como um todo: adiciona os que faltam e
 * remove os que saíram.
 *
 * Recebe a lista COMPLETA e não "o que mudou" de propósito — quem chama tem em
 * mãos o que está marcado na tela, e calcular a diferença aqui evita que duas
 * telas diferentes cheguem a conclusões diferentes sobre o que mudou.
 */
export function useSalvarContatosDaObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ obraId, contatoIds }: { obraId: string; contatoIds: string[] }) => {
      const { data: atuais, error: erroLeitura } = await supabase
        .from('obra_contatos')
        .select('contato_id')
        .eq('obra_id', obraId);
      if (erroLeitura) throw erroLeitura;

      const { inserir, remover } = calcularDiffDeVinculos(
        (atuais ?? []).map((l) => l.contato_id),
        contatoIds
      );

      if (inserir.length > 0) {
        const { error } = await supabase
          .from('obra_contatos')
          .insert(inserir.map((contato_id) => ({ obra_id: obraId, contato_id })));
        if (error) throw error;
      }

      if (remover.length > 0) {
        const { error } = await supabase
          .from('obra_contatos')
          .delete()
          .eq('obra_id', obraId)
          .in('contato_id', remover);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidarVinculos(qc),
  });
}

/**
 * O mesmo de `useSalvarContatosDaObra`, pelo outro lado: grava a lista de obras
 * de um contato. Existe porque o vínculo é editável nas duas fichas — quem está
 * cadastrando a pessoa costuma saber de quais canteiros ela cuida, e quem está
 * abrindo a obra costuma saber quem responde por ela.
 */
export function useSalvarObrasDoContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contatoId, obraIds }: { contatoId: string; obraIds: string[] }) => {
      const { data: atuais, error: erroLeitura } = await supabase
        .from('obra_contatos')
        .select('obra_id')
        .eq('contato_id', contatoId);
      if (erroLeitura) throw erroLeitura;

      const { inserir, remover } = calcularDiffDeVinculos(
        (atuais ?? []).map((l) => l.obra_id),
        obraIds
      );

      if (inserir.length > 0) {
        const { error } = await supabase
          .from('obra_contatos')
          .insert(inserir.map((obra_id) => ({ obra_id, contato_id: contatoId })));
        if (error) throw error;
      }

      if (remover.length > 0) {
        const { error } = await supabase
          .from('obra_contatos')
          .delete()
          .eq('contato_id', contatoId)
          .in('obra_id', remover);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidarVinculos(qc),
  });
}

/** Desfaz um vínculo só — o "remover" de uma linha da ficha da obra. */
export function useDesvincularContatoDaObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ obraId, contatoId }: { obraId: string; contatoId: string }) => {
      const { error } = await supabase
        .from('obra_contatos')
        .delete()
        .eq('obra_id', obraId)
        .eq('contato_id', contatoId);
      if (error) throw error;
    },
    onSuccess: () => invalidarVinculos(qc),
  });
}
