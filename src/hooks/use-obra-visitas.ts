import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { recusaSemErro } from '@/lib/recusa-do-banco';
import { tarefaDoProximoPasso, type RespostasDaVisita } from '@/lib/analise-da-visita';
import { useCreateTarefa } from '@/hooks/use-tarefas';

export type { RespostasDaVisita };

export interface ObraVisita {
  id: string;
  grupoId: string;
  titulo: string;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  visitaRealizada: boolean;
  visitaObservacao: string | null;
  /** As cinco perguntas da visita concluída (T4/T5). `null` = pergunta não respondida. */
  visitaFase: string | null;
  visitaConcorrentes: string | null;
  visitaContatoId: string | null;
  visitaProximoPasso: string | null;
  visitaProximoPassoEm: string | null;
  criadoPor: string;
}

interface EventoVisitaRow {
  id: string;
  grupo_id: string;
  user_id: string;
  titulo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  visita_realizada: boolean;
  visita_observacao: string | null;
  visita_fase: string | null;
  visita_concorrentes: string | null;
  visita_contato_id: string | null;
  visita_proximo_passo: string | null;
  visita_proximo_passo_em: string | null;
  criado_por: string;
}

/**
 * Cada parada da rota pode ter mais de um participante (ver
 * `useCreateRotaVisita`), o que gera uma linha por pessoa no mesmo
 * `grupo_id` — igual a um evento comum com vários participantes. Sem isso a
 * mesma visita apareceria duplicada, uma vez por participante. Fica só uma
 * linha por grupo — não importa qual das cópias, porque
 * `visita_realizada`/`visita_observacao`/horário nunca divergem entre elas
 * (todas nascem iguais em `useCreateRotaVisita`, e `useMarcarVisitaRealizada`
 * sempre atualiza o grupo inteiro de uma vez).
 */
function dedupPorGrupo<T extends { grupoId: string; id: string }>(linhas: T[]): T[] {
  const porGrupo = new Map<string, T>();
  for (const linha of linhas) {
    const atual = porGrupo.get(linha.grupoId);
    if (!atual) {
      porGrupo.set(linha.grupoId, linha);
    }
  }
  return Array.from(porGrupo.values());
}

/**
 * Histórico de visitas de uma obra: eventos de calendário com `obra_id`
 * apontando para ela. Não é agregação (soma/contagem) — é uma lista simples
 * filtrada por `obra_id`, então uma query direta basta; não precisa da RPC
 * `SECURITY DEFINER` que `use-obra-vendas.ts` usa para números somados no
 * banco (CLAUDE.md §6.4). A visibilidade já vem certa da RLS de `eventos`:
 * toda visita é criada com `tipo_calendario = 'empresa'`, visível para
 * qualquer um da mesma empresa (ver migration `20260825170000_visitas_obra.sql`).
 */
export function useObraVisitas(obraId?: string | null) {
  return useQuery({
    queryKey: ['obra_visitas', obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos')
        .select(
          'id, grupo_id, user_id, titulo, inicio, fim, dia_inteiro, visita_realizada, visita_observacao, visita_fase, visita_concorrentes, visita_contato_id, visita_proximo_passo, visita_proximo_passo_em, criado_por',
        )
        .eq('obra_id', obraId!)
        .order('inicio', { ascending: false });
      if (error) throw error;
      const linhas = (data as EventoVisitaRow[]).map((e) => ({
        id: e.id,
        grupoId: e.grupo_id,
        titulo: e.titulo,
        inicio: e.inicio,
        fim: e.fim,
        diaInteiro: e.dia_inteiro,
        visitaRealizada: e.visita_realizada,
        visitaObservacao: e.visita_observacao,
        visitaFase: e.visita_fase,
        visitaConcorrentes: e.visita_concorrentes,
        visitaContatoId: e.visita_contato_id,
        visitaProximoPasso: e.visita_proximo_passo,
        visitaProximoPassoEm: e.visita_proximo_passo_em,
        criadoPor: e.criado_por,
      })) as ObraVisita[];
      return dedupPorGrupo(linhas);
    },
    enabled: !!obraId,
  });
}

export interface VisitaObraListagem extends ObraVisita {
  obraId: string;
  nomeObra: string;
  clienteEmpresa: string | null;
  /** O cliente DONO da obra — de quem `PerguntasDaVisita` oferece os contatos (`useContatosDoCliente`). */
  clienteId: string | null;
  /** O nome de quem a visita marca como "com quem falou" (`visitaContatoId`). Nulo sem resposta. */
  contatoNome: string | null;
  /**
   * Onde a obra fica. Nulo quando o serviço de endereço não achou o local — 8 das 82 obras da
   * MD estão assim em 27/08/2026.
   *
   * 🔴 Nulo NÃO pode virar zero em lugar nenhum do caminho: (0, 0) é um ponto de verdade, no
   * golfo da Guiné, e o trajeto sairia de Natal para o meio do Atlântico sem erro nenhum
   * aparecer. Quem desenha separa as paradas com ponto das sem ponto, e diz na tela quantas
   * ficaram de fora.
   */
  latitude: number | null;
  longitude: number | null;
  /** A rota a que esta parada pertence. Nula nas paradas anteriores a 28/08/2026. */
  rotaId: string | null;
  /** O título da rota, repetido em todas as paradas dela. */
  rotaTitulo: string | null;
}

interface EventoVisitaComObraRow extends EventoVisitaRow {
  obra_id: string;
  rota_id: string | null;
  rota_titulo: string | null;
  obras: {
    nome_obra: string | null;
    latitude: number | null;
    longitude: number | null;
    cliente_id: string | null;
    clientes: { empresa: string | null } | null;
  } | null;
  // Embed com ALIAS (`contato_da_visita:contatos!eventos_visita_contato_id_fkey`) e nomeado pela
  // CHAVE ESTRANGEIRA, não pela coluna: o PostgREST precisa do caminho explícito para casar o
  // apelido com a relação certa — mesma sintaxe de `usuarios!pedidos_vendedor_id_fkey` em
  // `use-pedidos.ts`, ali por ambiguidade (duas FKs para `usuarios`); aqui por causa do alias.
  contato_da_visita: { nome_contato: string | null } | null;
}

/**
 * Todas as visitas (planejadas ou realizadas) de todas as obras da empresa —
 * usado na aba "Visitas" da tela de Obras. Mesma base de `useObraVisitas`,
 * sem o filtro por `obra_id`; a RLS de `eventos` já limita à empresa de quem
 * está logado.
 */
export function useTodasVisitasObras() {
  return useQuery({
    queryKey: ['obra_visitas_todas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos')
        .select(
          // `latitude`/`longitude` vêm daqui para o traçado da rota no mapa não precisar de uma
          // segunda consulta só para descobrir onde cada obra fica. `cliente_id` vem junto: é de
          // quem `PerguntasDaVisita` busca os contatos ao reabrir uma visita para editar.
          'id, grupo_id, user_id, titulo, inicio, fim, dia_inteiro, visita_realizada, visita_observacao, visita_fase, visita_concorrentes, visita_contato_id, visita_proximo_passo, visita_proximo_passo_em, criado_por, obra_id, rota_id, rota_titulo, obras(nome_obra, latitude, longitude, cliente_id, clientes(empresa)), contato_da_visita:contatos!eventos_visita_contato_id_fkey(nome_contato)',
        )
        .not('obra_id', 'is', null)
        .order('inicio', { ascending: false });
      if (error) throw error;
      const linhas = (data as unknown as EventoVisitaComObraRow[]).map((e) => ({
        id: e.id,
        grupoId: e.grupo_id,
        titulo: e.titulo,
        inicio: e.inicio,
        fim: e.fim,
        diaInteiro: e.dia_inteiro,
        visitaRealizada: e.visita_realizada,
        visitaObservacao: e.visita_observacao,
        visitaFase: e.visita_fase,
        visitaConcorrentes: e.visita_concorrentes,
        visitaContatoId: e.visita_contato_id,
        visitaProximoPasso: e.visita_proximo_passo,
        visitaProximoPassoEm: e.visita_proximo_passo_em,
        criadoPor: e.criado_por,
        obraId: e.obra_id,
        // A identidade e o título da rota (28/08/2026). Nulos nas paradas antigas — a tela
        // cai no agrupamento por (dia, criador), que continua valendo para elas.
        rotaId: e.rota_id ?? null,
        rotaTitulo: e.rota_titulo ?? null,
        nomeObra: e.obras?.nome_obra || 'Obra sem nome',
        clienteEmpresa: e.obras?.clientes?.empresa ?? null,
        clienteId: e.obras?.cliente_id ?? null,
        contatoNome: e.contato_da_visita?.nome_contato ?? null,
        // `?? null` e não `|| 0`: ver o comentário do tipo.
        latitude: e.obras?.latitude ?? null,
        longitude: e.obras?.longitude ?? null,
      })) as VisitaObraListagem[];
      return dedupPorGrupo(linhas);
    },
  });
}

const RECUSA_AO_GRAVAR_VISITA = 'Registrar visita é uma permissão à parte, e o seu usuário não tem.';
const RECUSA_AO_DESMARCAR_VISITA = 'Desmarcar visita é a mesma permissão de registrar, e o seu usuário não tem.';

/**
 * Marcar (ou desmarcar) uma visita como realizada, com observação e respostas opcionais.
 * Atualiza o `grupo_id` inteiro (todas as cópias por participante) — uma
 * visita com 3 participantes tem que virar "realizada" para os 3 ao mesmo
 * tempo, não só para a linha que a busca trouxe primeiro.
 *
 * 🔴 DESMARCAR NÃO APAGA A ANOTAÇÃO — decisão do dono do produto de 16/09/2026, a mesma regra
 * que `NovaRotaVisitaDialog.tsx` já segue para a rota. Desmarcar ("esta visita não aconteceu")
 * e apagar a análise ("jogue fora o que eu escrevi") são gestos diferentes: quem desmarca por
 * engano — ou porque vai remarcar o horário — não pode perder o que já tinha registrado. Por
 * isso o `update` de desmarcar manda SÓ `visita_realizada: false`: nenhuma outra chave entra no
 * payload, e uma coluna ausente no `update` do PostgREST não é tocada. Apagar de propósito
 * continua possível: marcar de novo, limpar os campos na tela e salvar — aí sim vai `null`.
 *
 * 🔴 MARCAR SEM `respostas` TAMBÉM NÃO APAGA A ANÁLISE — mesmo princípio do parágrafo acima,
 * achado na revisão do Task 6a. As cinco colunas de análise só entram no `payload` quando quem
 * chamou passou `respostas`. `HistoricoVisitasObra.tsx` marca a visita como realizada sem
 * perguntar fase/concorrente/próximo passo (essas perguntas chegam lá só numa tarefa futura); se
 * as cinco colunas fossem gravadas sempre com `respostas?.campo || null`, marcar por aquela tela
 * apagaria silenciosamente o que já estava salvo pelo painel de visitas. Uma tela que não
 * pergunta não pode apagar a resposta de quem perguntou. `visita_observacao` continua sendo
 * gravada sempre que `realizada` é verdadeiro — isso já era assim antes e nenhuma tela hoje
 * chama sem intenção de gravar a observação.
 *
 * 🔴 A TAREFA DO PRÓXIMO PASSO É CONSEQUÊNCIA, NÃO É O TRABALHO (Tarefa 7a, 16/09/2026). A
 * visita acima é o registro de quem esteve em campo, e tem que gravar sozinha, sempre. Só
 * DEPOIS dela valer é que este hook tenta a segunda gravação: uma TAREFA, e só quando a visita
 * PASSA a realizada — nunca ao reabrir uma visita já realizada para editar (`respostas.criarTarefa`
 * volta sempre `true` nesse caso, mas `tarefaDoProximoPasso` já filtra por texto+data, não pelo
 * "passou a realizada") — com próximo passo E data preenchidos e a caixinha `criarTarefa`
 * marcada (campo TRANSITÓRIO da tela, nunca uma coluna do banco — ver `RespostasDaVisita` em
 * `src/lib/analise-da-visita.ts`). Se a criação da tarefa falhar, a visita já gravada continua
 * valendo: a pessoa não perde o registro de campo por causa de um problema na tarefa. Mesmo
 * espírito do aviso de participantes de `useCreatePedidoCompleto` (`use-novo-pedido.ts`).
 */
export function useMarcarVisitaRealizada() {
  const qc = useQueryClient();
  const criarTarefa = useCreateTarefa();

  return useMutation({
    mutationFn: async ({
      grupoId,
      obraId,
      realizada,
      observacao,
      respostas,
      nomeObra,
      clienteId,
    }: {
      grupoId: string;
      obraId: string;
      realizada: boolean;
      observacao?: string | null;
      respostas?: RespostasDaVisita;
      /** Título da tarefa do próximo passo. Nulo/ausente vira "obra sem nome" (`tarefaDoProximoPasso`). */
      nomeObra?: string | null;
      /** Cliente dono da obra, para ligar a tarefa a ele. */
      clienteId?: string | null;
    }) => {
      const payload: Record<string, unknown> = { visita_realizada: realizada };
      if (realizada) {
        payload.visita_observacao = observacao || null;
        // Só grava as cinco colunas de análise quando a tela PERGUNTOU — ver o comentário
        // acima. Sem `respostas`, elas ficam de fora do payload e o PostgREST não as toca.
        if (respostas) {
          payload.visita_fase = respostas.fase || null;
          payload.visita_concorrentes = respostas.concorrentes || null;
          payload.visita_contato_id = respostas.contatoId || null;
          payload.visita_proximo_passo = respostas.proximoPasso || null;
          payload.visita_proximo_passo_em = respostas.proximoPassoEm || null;
        }
      }

      // 🔴 ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6). A regra de acesso pode recusar o
      // `UPDATE` sem erro nenhum: o `USING` não acha a linha, o comando mexe em zero registros
      // e a resposta volta com `error: null`. `count === 0` cravado, nunca `!count` — `count`
      // vem `null` quando a resposta não traz o cabeçalho de contagem, e tratar `null` como
      // recusa inventaria um erro em cima de uma gravação que funcionou.
      const { error, count } = await supabase
        .from('eventos')
        .update(payload, { count: 'exact' })
        .eq('grupo_id', grupoId);
      if (error) throw error;
      if (count === 0) {
        throw new Error(
          recusaSemErro(
            realizada
              ? 'A visita NÃO foi gravada como realizada: as respostas não foram salvas.'
              : 'A visita NÃO foi desmarcada: ela continua como realizada.',
            realizada ? RECUSA_AO_GRAVAR_VISITA : RECUSA_AO_DESMARCAR_VISITA,
          ),
        );
      }

      // A visita já está gravada a partir daqui. `tarefaDoProximoPasso` só devolve algo quando
      // há texto E data — sem os dois, não há o que cobrar (mesmo motivo da frase "sem data,
      // não vira tarefa" em `PerguntasDaVisita.tsx`).
      let avisoDaTarefa: string | null = null;
      if (realizada && respostas?.criarTarefa) {
        const tarefa = tarefaDoProximoPasso({
          nomeObra,
          clienteId,
          proximoPasso: respostas?.proximoPasso,
          proximoPassoEm: respostas?.proximoPassoEm,
        });
        if (tarefa) {
          try {
            await criarTarefa.mutateAsync(tarefa);
          } catch {
            // A visita já gravou — este `catch` não pode virar `throw`, ou a pessoa em campo
            // veria a gravação inteira falhar por causa de uma tarefa que ela nem escolheu
            // conferir agora.
            avisoDaTarefa =
              'A visita foi gravada, mas a tarefa do próximo passo não. Crie-a pela tela de Tarefas.';
          }
        }
      }

      return { obraId, avisoDaTarefa };
    },
    onSuccess: ({ obraId, avisoDaTarefa }) => {
      qc.invalidateQueries({ queryKey: ['obra_visitas', obraId] });
      qc.invalidateQueries({ queryKey: ['obra_visitas_todas'] });
      qc.invalidateQueries({ queryKey: ['eventos'] });
      if (avisoDaTarefa) {
        toast.warning(avisoDaTarefa);
        qc.invalidateQueries({ queryKey: ['tarefas'] });
      }
    },
  });
}
