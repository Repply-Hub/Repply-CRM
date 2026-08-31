import { useState } from 'react';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  useFabricanteFuncoes, useSalvarFuncao, useRemoverFuncao,
} from '@/hooks/use-fabricante-contatos';

/**
 * Gerenciar as funções de contato de fábrica (Gerente comercial, Logística, Assistência
 * técnica…).
 *
 * POR QUE VIVE AQUI, E NÃO EM CONFIGURAÇÕES: lista usada num lugar só fica perto de onde é
 * usada — o mesmo caminho do "Gerenciar colunas" do Kanban, que também se abre de dentro
 * da tela que a consome. Configurações já tem seis abas.
 *
 * A lista nasce SEMEADA com cinco funções, e é editável. Isso não impõe a prática da MD ao
 * assinante (SPEC.md §4): o que aquele princípio proíbe é lista cravada no código. Esta se
 * renomeia, se apaga e se acrescenta.
 */
export function GerenciarFuncoesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { profile } = useAuth();
  const { data: funcoes = [] } = useFabricanteFuncoes();
  const salvar = useSalvarFuncao();
  const remover = useRemoverFuncao();
  const [nova, setNova] = useState('');

  const empresaId = profile?.empresa_id;

  async function acrescentar() {
    const nome = nova.trim();
    if (!nome) return;
    if (!empresaId) {
      // Estado real, não hipótese: `ProtectedRoute` deixa a tela desenhar enquanto o perfil
      // ainda vem (CLAUDE.md §6.7). Sem esta guarda, o insert iria com empresa vazia e a
      // regra de segurança recusaria com uma frase que não explica nada.
      toast.error('Seu perfil ainda está carregando. Tente de novo em instantes.');
      return;
    }
    try {
      await salvar.mutateAsync({ nome, ordem: funcoes.length, empresa_id: empresaId });
      setNova('');
      toast.success('Função adicionada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar a função.');
    }
  }

  /**
   * 🔴 `ordem` vai com o valor QUE JÁ ESTAVA.
   *
   * Mandar `ordem: 0` aqui renomearia e, de quebra, jogaria a função para o topo da lista —
   * uma mudança que ninguém pediu e que o usuário leria como bug da tela, não como efeito
   * do rename.
   */
  async function renomear(f: { id: string; nome: string; ordem: number }, texto: string) {
    const nome = texto.trim();
    if (!nome || nome === f.nome) return;
    if (!empresaId) return;
    try {
      await salvar.mutateAsync({ id: f.id, nome, ordem: f.ordem, empresa_id: empresaId });
      toast.success('Função renomeada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível renomear a função.');
    }
  }

  async function excluir(id: string) {
    try {
      await remover.mutateAsync(id);
      toast.success('Função removida. Os contatos que a usavam ficaram sem função.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível remover a função.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ConteudoDialogo className="sm:max-w-[480px]">
        <CabecalhoDialogo>
          <DialogTitle>Funções de contato</DialogTitle>
          <DialogDescription>
            São as funções que você pode escolher ao cadastrar o contato de uma fábrica.
            Remover uma função não remove nenhum contato — eles ficam sem função.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-2 py-2">
          {funcoes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma função cadastrada. Acrescente a primeira abaixo.
            </p>
          )}

          {funcoes.map((f) => (
            <div key={f.id} className="flex items-center gap-2">
              {/* `defaultValue` + `onBlur`, e não `value` controlado: com estado a cada
                  tecla, toda letra digitada dispararia uma gravação. */}
              <Input
                defaultValue={f.nome}
                onBlur={(e) => renomear(f, e.target.value)}
              />
              <Button
                size="icon" variant="ghost" title="Remover função"
                disabled={remover.isPending}
                onClick={() => excluir(f.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-2">
            <Input
              placeholder="Nova função"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  acrescentar();
                }
              }}
            />
            <Button
              size="icon" title="Acrescentar"
              onClick={acrescentar}
              disabled={salvar.isPending || !nova.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
