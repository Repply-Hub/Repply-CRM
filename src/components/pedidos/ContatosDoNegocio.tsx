import { Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { slugify } from '@/lib/utils';
import { useContatosDoCliente } from '@/hooks/use-obra-contatos';
import { BotaoVerConversa } from '@/components/whatsapp/BotaoVerConversa';

interface ContatosDoNegocioProps {
  /** A construtora do negócio. Sem ela não há de quem listar contatos. */
  clienteId?: string | null;
  /** Nome da construtora — o gancho o usa para alcançar os contatos antigos, sem chave. */
  empresaNome?: string | null;
}

/**
 * As pessoas da construtora deste negócio, com o atalho para a conversa de cada uma.
 *
 * 🔴 O NEGÓCIO NÃO TINHA LISTA DE CONTATOS EM LUGAR NENHUM. Nem no painel de detalhe, nem na
 * tela de edição. A coluna "Contato" que aparece na lista de negócios é **texto solto** de
 * `campos_extras`, herdado da importação do Bitrix: sem id, sem telefone, sem vínculo com
 * ninguém. Dava para ler um nome e não dava para fazer nada com ele.
 *
 * O negócio já carrega `cliente_id`, então a lista sai de graça pelo gancho que já existe —
 * `useContatosDoCliente`, o mesmo do seletor de contatos da obra.
 *
 * 🔴 O NOME DA EMPRESA VAI JUNTO DE PROPÓSITO. Aquele gancho casa pela chave E, como reforço,
 * pelo texto do nome para os contatos antigos que não têm `cliente_id` — 456 nesta base. Mandar
 * só a chave deixaria essas pessoas de fora da lista do negócio enquanto elas aparecem em outras
 * telas, e a diferença entre as duas listas é o que faz alguém recadastrar a mesma pessoa.
 */
export function ContatosDoNegocio({ clienteId, empresaNome }: ContatosDoNegocioProps) {
  const navigate = useNavigate();
  const { data: contatos = [], isLoading } = useContatosDoCliente(clienteId, empresaNome);

  if (!clienteId || isLoading) return null;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Users className="h-3 w-3" /> Contatos da empresa
      </p>

      {contatos.length === 0 ? (
        // Dizer que não há é diferente de não mostrar nada: sem esta linha, quem olha não sabe
        // se a construtora não tem contato cadastrado ou se a tela deixou de carregar.
        <p className="text-sm text-muted-foreground">
          Nenhum contato cadastrado nesta empresa.
        </p>
      ) : (
        <div className="space-y-1.5">
          {contatos.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  navigate(`/contatos/${slugify(c.nomeContato || 'contato')}-${c.id}`)
                }
              >
                <p className="truncate text-sm font-medium hover:text-primary transition-colors">
                  {c.nomeContato || 'Contato sem nome'}
                </p>
                {(c.cargo || c.telefone) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.cargo, c.telefone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </button>
              <BotaoVerConversa
                telefone={c.telefone}
                contatoId={c.id}
                nome={c.nomeContato}
                compacto
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
