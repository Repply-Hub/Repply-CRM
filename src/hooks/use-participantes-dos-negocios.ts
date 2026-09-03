import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Os participantes de TODOS os negócios visíveis, num mapa por negócio.
 *
 * Serve a lista, o cartão do Kanban e a exportação, que precisam mostrar "Ana Lima +2" ou
 * listar os nomes — sem que cada linha da tela vá ao banco por conta própria.
 *
 * 🔴 BUSCA SÓ QUEM NÃO É PRINCIPAL, e não é economia de digitação: é o que torna esta consulta
 * viável. Medido em produção em 03/09/2026, como usuário logado:
 *
 *   | caminho                                                    | 1.000 negócios |
 *   |------------------------------------------------------------|----------------|
 *   | embutir os responsáveis no `select` da lista (um por linha) | **433 ms**     |
 *   | pedir a lista chapada, com os 1.000 ids                     | 65 ms          |
 *   | **só os participantes, sem filtrar por id (esta)**           | **137 ms** — e uma vez só, para a base inteira |
 *
 * O embed é 38× mais caro que a consulta sem ele (11 ms), porque a regra de segurança de
 * `pedido_responsaveis` reconsulta `pedidos` UMA VEZ POR LINHA — e a exportação paga isso 12
 * vezes, uma por lote de mil. Aqui o filtro `principal = false` é avaliado primeiro, sendo
 * barato, e as funções de segurança caras nem chegam a ser chamadas (o plano diz
 * "never executed" nelas).
 *
 * E funciona porque participante é a EXCEÇÃO, não a regra: o principal já vem no próprio
 * negócio (`pedidos.usuario_id`), e só o excedente precisa de consulta.
 */

export interface ParticipanteDoNegocio {
  usuarioId: string;
  nome: string;
}

/** Quantas linhas por ida ao servidor. O PostgREST corta em 1.000 por padrão. */
const LOTE = 1000;
/**
 * Teto de segurança: 50 mil participantes. Passar disso significa que a premissa desta
 * consulta (participante é exceção) deixou de valer, e aí o certo é voltar a buscar por
 * negócio — não continuar varrendo em silêncio.
 */
const TETO = 50_000;

export async function buscarParticipantesDosNegocios(): Promise<Map<string, ParticipanteDoNegocio[]>> {
  const mapa = new Map<string, ParticipanteDoNegocio[]>();

  for (let inicio = 0; inicio < TETO; inicio += LOTE) {
    const { data, error } = await supabase
      .from('pedido_responsaveis')
      .select('pedido_id, usuario_id, usuarios:usuario_id(nome)')
      .eq('principal', false)
      .order('pedido_id')
      .range(inicio, inicio + LOTE - 1);
    if (error) throw error;

    type Linha = {
      pedido_id: string;
      usuario_id: string;
      usuarios: { nome: string | null } | null;
    };
    const lote = (data ?? []) as unknown as Linha[];

    for (const l of lote) {
      const atual = mapa.get(l.pedido_id) ?? [];
      atual.push({ usuarioId: l.usuario_id, nome: l.usuarios?.nome ?? 'Sem nome' });
      mapa.set(l.pedido_id, atual);
    }

    // Lote curto = acabou. Sem isto, o laço iria até o teto pedindo páginas vazias.
    if (lote.length < LOTE) break;
  }

  // O nome em ordem alfabética dentro de cada negócio: a ordem de chegada não significa nada
  // para quem lê, e lista que muda de ordem sozinha confunde.
  for (const lista of mapa.values()) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  return mapa;
}

export function useParticipantesDosNegocios(ligado = true) {
  return useQuery({
    // O prefixo `pedido_responsaveis` é de propósito: as mutações que mexem em responsável
    // invalidam esse prefixo, então este mapa se atualiza junto, sem precisar ser listado nelas.
    queryKey: ['pedido_responsaveis', 'participantes-por-negocio'],
    queryFn: buscarParticipantesDosNegocios,
    enabled: ligado,
    staleTime: 60_000,
  });
}
