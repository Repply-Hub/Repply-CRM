import { useNavigate } from 'react-router-dom';
import { Loader2, Mail, Pencil, Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { slugify } from '@/lib/utils';
import { useContatosDaObra } from '@/hooks/use-obra-contatos';

interface ContatosDaObraProps {
  obraId: string;
}

/**
 * Quem responde por este canteiro: as pessoas da construtora ligadas a ESTA obra,
 * não à empresa cliente inteira (tabela `obra_contatos`).
 *
 * 🔴 SOMENTE LEITURA. Quem muda o vínculo é o botão "Editar" do rodapé do painel, que abre o
 * modal de Editar Obra — lá vive o `SeletorContatosObra`, e o Salvar de lá grava a lista
 * COMPLETA (`useSalvarContatosDaObra` + `calcularDiffDeVinculos`), então desmarcar alguém
 * desvincula. Pedido do dono do produto em 28/08/2026.
 *
 * POR QUE SAIU DAQUI. Entre 27 e 28/08/2026 este bloco editava direto no painel: tinha o botão
 * "Vincular contatos" e um "X" por linha que desvinculava na hora. Dois problemas:
 *
 *   1. O painel é de LEITURA. Todo o resto dele — cliente, localização, vendas, visitas — só
 *      muda pelo Editar. Um bloco que grava no meio de uma ficha de consulta quebra a
 *      expectativa, e o "X" desvinculava sem confirmação nenhuma.
 *   2. Duas portas para o mesmo dado (o "X" aqui e o seletor no modal) divergem: quem abria o
 *      modal com o painel aberto atrás via listas diferentes da mesma obra.
 *
 * 🔴 O ESTADO VAZIO PRECISA APONTAR PARA O "EDITAR". Sem isso voltamos ao defeito que o dev
 * anterior mediu em 27/08: em 32 das 82 obras a lista abre vazia, e quem vê vazio sem saída
 * conclui que está quebrado. A frase abaixo é a saída.
 */
export function ContatosDaObra({ obraId }: ContatosDaObraProps) {
  const navigate = useNavigate();
  const { data: contatos, isLoading, isError, refetch } = useContatosDaObra(obraId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando os contatos...
      </div>
    );
  }

  // 🔴 Erro tem que ser DIFERENTE de "não tem nenhum". Tratados iguais, a tela dizia
  // "nenhum contato vinculado" quando na verdade a consulta falhou — e a pessoa abriria o
  // Editar achando que precisa cadastrar de novo alguém que já está lá.
  if (isError) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">
          Não foi possível carregar os contatos desta obra
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nada foi alterado. Tente de novo em instantes.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!contatos || contatos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Nenhum contato vinculado a esta obra</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Quem responde por este canteiro — engenheiro, comprador, mestre de obras. Para vincular,
          use o botão <span className="font-medium text-foreground">Editar</span> aqui embaixo. A
          mesma pessoa pode responder por mais de uma obra.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {contatos.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => navigate(`/contatos/${slugify(c.nomeContato || 'contato')}-${c.id}`)}
          className="group flex w-full items-start gap-2 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-sm font-medium">
                {c.nomeContato || 'Contato sem nome'}
              </span>
              {c.cargo && (
                <span className="shrink-0 text-xs text-muted-foreground">· {c.cargo}</span>
              )}
            </div>
            {(c.email || c.telefone) && (
              <div className="mt-1 flex flex-wrap items-center gap-3 pl-5 text-xs text-muted-foreground">
                {c.email && (
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3 shrink-0" /> {c.email}
                  </span>
                )}
                {c.telefone && (
                  <span className="flex items-center gap-1 truncate">
                    <Phone className="h-3 w-3 shrink-0" /> {c.telefone}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      ))}

      {/* Com contatos na lista o caminho não é óbvio: quem quer TIRAR alguém não tem mais o "X"
          e precisa saber que é pelo Editar. Uma linha discreta, e não um botão — o botão fica
          no rodapé, que é o mesmo para a ficha inteira. */}
      <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
        <Pencil className="h-3 w-3 shrink-0" />
        Para vincular ou desvincular, use o botão Editar.
      </p>
    </div>
  );
}
