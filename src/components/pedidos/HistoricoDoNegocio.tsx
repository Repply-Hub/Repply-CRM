import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, MessageSquare, Eye, CalendarClock, History } from 'lucide-react';
import { useHistoricoContatos } from '@/hooks/use-pedidos';
import { BlocosDeAtendimento } from '@/components/pedidos/BlocosDeAtendimento';
import { useBlocosDoNegocio } from '@/hooks/use-blocos-do-negocio';

interface HistoricoDoNegocioProps {
  pedidoId?: string | null;
  clienteId?: string | null;
  empresaNome?: string | null;
  /** 🔴 `data_pedido`, nunca `created_at` — ver janelaDoNegocio. */
  dataPedido?: string | null;
  /** A data de FECHAMENTO; o nome da coluna mente (CLAUDE.md §4.4). */
  prazoResposta?: string | null;
  status?: string | null;
}

/**
 * O histórico de contato deste negócio: o que alguém anotou à mão, mais um resumo automático
 * de cada conversa de WhatsApp.
 *
 * 🔴 DOIS DEFEITOS ESCONDIDOS UM ATRÁS DO OUTRO, e este componente fecha os dois.
 *
 * O card "Histórico de Contatos" existia em `Negocios.tsx`, mas dependia de um `selectedOrder`
 * que **nunca era preenchido** — `setSelectedOrder` estava declarado e não era chamado em lugar
 * nenhum do projeto. E, se um dia fosse ligado, quebraria: a consulta pedia
 * `vendedor:vendedores(nome)`, e `vendedores` virou `usuarios` em abril/2026. Medido contra
 * produção em 04/09/2026: o PostgREST recusa a consulta inteira com `PGRST200`.
 *
 * Ou seja, o "Retomar depois" da Pauta gravava com um comentário no código dizendo que "o painel
 * do negócio mostra", e o painel nunca mostrou nada.
 *
 * 🔴 UMA LINHA POR CONVERSA, NÃO UMA POR MENSAGEM. São 73.456 mensagens de WhatsApp contra 56
 * registros manuais: uma linha por mensagem afogaria a visita e a ligação que alguém se deu ao
 * trabalho de anotar. Decisão do dono do produto em 04/09/2026.
 *
 * A linha do WhatsApp é CALCULADA, não gravada: nada é inserido em `historico_contatos` por causa
 * dela. Gravar criaria um registro que envelhece (a conversa continua, o registro não) e que
 * ninguém saberia manter.
 */

const ICONE_POR_TIPO: Record<string, typeof Mail> = {
  email: Mail,
  telefone: Phone,
  ligacao: Phone,
  whatsapp: MessageSquare,
  visita: Eye,
  automatico: CalendarClock,
};

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '';
  // Âncora de meio-dia não é necessária aqui: estes campos são timestamp com fuso, não data seca.
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function HistoricoDoNegocio({
  pedidoId,
  clienteId,
  empresaNome,
  dataPedido,
  prazoResposta,
  status,
}: HistoricoDoNegocioProps) {
  const navigate = useNavigate();
  const { data: registros = [] } = useHistoricoContatos(pedidoId ?? null);
  // O gancho vive AQUI, e não dentro de BlocosDeAtendimento, porque só quem
  // enxerga os dois lados — atendimentos e anotações manuais — pode decidir se
  // o histórico está mesmo vazio.
  const { linhas } = useBlocosDoNegocio({
    clienteId,
    empresaNome,
    dataPedido,
    prazoResposta,
    status,
  });

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <History className="h-3 w-3" /> Histórico de contato
      </p>

      {/* Cada ATENDIMENTO, e não uma linha por conversa inteira: a unidade certa
          é cada vez que a conversa foi aberta e fechada. Decisão do dono do
          produto em 09/09/2026, revendo a de 04/09. O e-mail entra pelo mesmo
          componente, agrupado por assunto. */}
      <BlocosDeAtendimento linhas={linhas} />

      {registros.length === 0 && linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma conversa, e-mail, visita ou ligação neste negócio.
        </p>
      ) : (
        <div className="space-y-2.5">
          {registros.map((r) => {
            const Icone = ICONE_POR_TIPO[r.tipo] ?? MessageSquare;
            return (
              <div key={r.id} className="flex gap-2.5">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icone className="h-3 w-3 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-card-foreground">{r.descricao || r.tipo}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {dataCurta(r.data_contato)}
                    {r.usuario?.nome ? ` · ${r.usuario.nome}` : ''}
                    {r.proximo_contato_em ? ` · retomar em ${dataCurta(r.proximo_contato_em)}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
