import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, MessageSquare, Eye, CalendarClock, History } from 'lucide-react';
import { useHistoricoContatos } from '@/hooks/use-pedidos';
import { useContatosDoCliente } from '@/hooks/use-obra-contatos';
import { useConversaDoContato, useContagemDeMensagens } from '@/hooks/use-conversa-do-contato';
import { useSecaoLigada } from '@/hooks/use-secoes';

interface HistoricoDoNegocioProps {
  pedidoId?: string | null;
  clienteId?: string | null;
  empresaNome?: string | null;
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

export function HistoricoDoNegocio({ pedidoId, clienteId, empresaNome }: HistoricoDoNegocioProps) {
  const navigate = useNavigate();
  const { ligada: temWhatsapp } = useSecaoLigada('whatsapp');
  const { data: registros = [] } = useHistoricoContatos(pedidoId ?? null);
  const { data: contatos = [] } = useContatosDoCliente(clienteId, empresaNome);

  // Um gancho por contato seria proibido dentro de `map`; como a lista é pequena e todos
  // compartilham o mesmo cache, resolvemos as conversas com um componente-filho por linha.
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <History className="h-3 w-3" /> Histórico de contato
      </p>

      {temWhatsapp !== false && contatos.length > 0 && (
        <div className="space-y-1.5">
          {contatos.map((c) => (
            <ResumoDaConversa
              key={c.id}
              contatoId={c.id}
              telefone={c.telefone}
              nome={c.nomeContato}
              aoAbrir={(conversaId) =>
                navigate(`/whatsapp?conversaId=${encodeURIComponent(conversaId)}`)
              }
            />
          ))}
        </div>
      )}

      {registros.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma visita, ligação ou e-mail anotado neste negócio.
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

/**
 * A linha-resumo de UMA conversa. Vive em componente próprio porque cada linha precisa resolver
 * a sua conversa com um gancho, e gancho não pode ser chamado dentro de `map`.
 *
 * Não desenha nada quando não há conversa: aqui o silêncio é certo — este bloco é sobre o que
 * ACONTECEU, e "não conversamos por WhatsApp" não é um acontecimento. Quem quer ver com quem
 * existe conversa olha o bloco de contatos logo acima, que mostra o botão aceso ou apagado.
 */
function ResumoDaConversa({
  contatoId,
  telefone,
  nome,
  aoAbrir,
}: {
  contatoId: string;
  telefone: string | null;
  nome: string | null;
  aoAbrir: (conversaId: string) => void;
}) {
  const { conversa } = useConversaDoContato(telefone, contatoId, !!telefone || !!contatoId);
  const ids = useMemo(() => (conversa ? [conversa.id] : []), [conversa]);
  const { data: contagem } = useContagemDeMensagens(ids);

  if (!conversa) return null;

  const total = contagem?.get(conversa.id);

  return (
    <button
      type="button"
      onClick={() => aoAbrir(conversa.id)}
      className="flex w-full gap-2.5 rounded-lg border bg-muted/30 p-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <MessageSquare className="h-3 w-3 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-card-foreground">
          WhatsApp com {nome || 'este contato'}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {/* A contagem pode não ter voltado ainda; a data já veio junto com a conversa, então a
              linha nunca aparece vazia enquanto espera. */}
          {typeof total === 'number' ? `${total} mensagens · ` : ''}
          {conversa.ultima_mensagem_at
            ? `última em ${dataCurta(conversa.ultima_mensagem_at)}`
            : 'sem mensagens ainda'}
        </p>
      </div>
    </button>
  );
}
