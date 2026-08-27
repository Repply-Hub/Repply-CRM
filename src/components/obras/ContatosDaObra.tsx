import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mail, Phone, Plus, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { slugify } from '@/lib/utils';
import { toast } from 'sonner';
import { SeletorContatosObra } from '@/components/obras/SeletorContatosObra';
import {
  useContatosDaObra,
  useDesvincularContatoDaObra,
  useSalvarContatosDaObra,
} from '@/hooks/use-obra-contatos';

interface ContatosDaObraProps {
  obraId: string;
  /** Cliente dono da obra — define de quem são os contatos oferecidos. */
  clienteId?: string | null;
  clienteEmpresa?: string | null;
}

/**
 * Quem responde por este canteiro: as pessoas da construtora ligadas a ESTA obra,
 * não à empresa cliente inteira (tabela `obra_contatos`).
 *
 * Editável desde 27/08/2026. Antes era só leitura, e o estado vazio mandava o
 * usuário sair da obra, abrir o contato e escolher a obra por lá — a ida e volta
 * que o dono do produto pediu para acabar.
 */
export function ContatosDaObra({ obraId, clienteId, clienteEmpresa }: ContatosDaObraProps) {
  const navigate = useNavigate();
  const { data: contatos, isLoading, isError, refetch } = useContatosDaObra(obraId);
  const salvar = useSalvarContatosDaObra();
  const desvincular = useDesvincularContatoDaObra();
  const [adicionando, setAdicionando] = useState(false);
  // `null` = ainda não sei quem está vinculado. A gravação manda a lista COMPLETA e
  // apaga o que não está nela; salvar a partir de `[]` "não carregado" desvincularia
  // todo mundo. Ver src/lib/obra-contatos-diff.ts.
  const [selecionados, setSelecionados] = useState<string[] | null>(null);

  // Ao abrir o seletor, ele começa marcando quem já está vinculado — senão salvar
  // apagaria os vínculos existentes, já que a mutation recebe a lista completa.
  // A cópia acontece UMA vez por abertura: criar um contato aqui dentro invalida a
  // lista, e sem a trava o refetch reescreveria por cima do que a pessoa marcou.
  const jaMarcou = useRef(false);
  useEffect(() => {
    if (!adicionando) {
      jaMarcou.current = false;
      setSelecionados(null);
      return;
    }
    if (!contatos || jaMarcou.current) return;
    jaMarcou.current = true;
    setSelecionados(contatos.map((c) => c.id));
  }, [adicionando, contatos]);

  const confirmar = async () => {
    if (selecionados === null) return;
    try {
      await salvar.mutateAsync({ obraId, contatoIds: selecionados });
      setAdicionando(false);
      toast.success('Contatos da obra atualizados.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar os contatos.');
    }
  };

  const remover = async (contatoId: string, nome: string | null) => {
    try {
      await desvincular.mutateAsync({ obraId, contatoId });
      // Tira também da marcação do seletor, se ele estiver aberto: a marcação é uma
      // cópia congelada da abertura, e sem isto o Salvar em seguida devolveria o
      // contato que a pessoa acabou de remover.
      setSelecionados((prev) => (prev === null ? prev : prev.filter((id) => id !== contatoId)));
      // "Desvinculado", não "excluído": a pessoa continua cadastrada no cliente.
      toast.success(`${nome || 'Contato'} desvinculado desta obra.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível desvincular o contato.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando os contatos...
      </div>
    );
  }

  // 🔴 Erro tem que ser DIFERENTE de "não tem nenhum". Tratados iguais, a tela dizia
  // "nenhum contato vinculado" quando na verdade a consulta falhou — e o Salvar em
  // seguida apagaria os vínculos que existem, achando que a lista vazia era a verdade.
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

  return (
    <div className="space-y-3">
      {!contatos || contatos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Nenhum contato vinculado a esta obra</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Vincule quem responde por este canteiro — engenheiro, comprador, mestre de obras. A mesma
            pessoa pode responder por mais de uma obra.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {contatos.map((c) => (
            <div
              key={c.id}
              className="group flex items-start gap-2 rounded-md border bg-card px-3 py-2 transition-colors hover:border-primary/50"
            >
              <button
                type="button"
                onClick={() => navigate(`/contatos/${slugify(c.nomeContato || 'contato')}-${c.id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm font-medium">
                    {c.nomeContato || 'Contato sem nome'}
                  </span>
                  {c.cargo && <span className="shrink-0 text-xs text-muted-foreground">· {c.cargo}</span>}
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
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Desvincular desta obra"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remover(c.id, c.nomeContato)}
                disabled={desvincular.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {adicionando ? (
        <div className="space-y-2">
          <SeletorContatosObra
            clienteId={clienteId}
            clienteEmpresa={clienteEmpresa}
            value={selecionados ?? []}
            onChange={setSelecionados}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={confirmar}
              disabled={salvar.isPending || selecionados === null}
            >
              {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAdicionando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setAdicionando(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Vincular contatos
        </Button>
      )}
    </div>
  );
}
