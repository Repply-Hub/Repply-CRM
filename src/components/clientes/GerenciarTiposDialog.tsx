import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CabecalhoDialogo,
  ConteudoDialogo,
  CorpoDialogo,
  Dialog,
  DialogDescription,
  DialogTitle,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import {
  useClientesTipos,
  useCriarTipoDeCliente,
  useExcluirTipoDeCliente,
  useRenomearTipoDeCliente,
} from '@/hooks/use-clientes-tipos';
import { decidirRenomeacao } from '@/lib/tipos-de-cliente';

/**
 * O diálogo "Gerenciar tipos" — criar, RENOMEAR e excluir os tipos de cliente da
 * empresa. Serve as duas telas que têm o campo Tipo: o cadastro (`Clientes.tsx`) e a
 * edição (`ClienteDetalhe.tsx`).
 *
 * 🔴 POR QUE UM COMPONENTE SÓ, E NÃO UMA CÓPIA EM CADA TELA:
 * este projeto já pagou por duas telas com listas próprias que divergiram — a ficha do
 * cliente mostrava um rótulo e o cadastro mostrava outro. Uma cópia do diálogo recria
 * exatamente esse problema: a próxima correção entraria num arquivo só e ninguém notaria
 * a outra tela ficando para trás. Quem precisar do diálogo importa este arquivo.
 *
 * `<ConteudoDialogo>` no lugar de `<DialogContent>` é regra do projeto (CLAUDE.md §7.11):
 * modal sem teto de altura transborda para os dois lados e, como Esc e clique-fora estão
 * desligados aqui, a pessoa só sai recarregando a página.
 *
 * ⚠️ NÃO USE ISTO DENTRO DO `EmpresaSelector`. Ele já é renderizado dentro de outros
 * diálogos (Negócios, Obras, Contatos), e empilhar um TERCEIRO diálogo é fonte conhecida
 * de tela travada.
 */

interface GerenciarTiposDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Empresa dona da lista. É o mesmo valor que a tela passa para `useClientesTipos`. */
  empresaId?: string | null;
  /**
   * Espelha `public.is_gestor()` só para esconder os controles. A RLS continua sendo a
   * autoridade real — quem não for gestor recebe a recusa do banco no toast.
   */
  podeGerenciar: boolean;
  /** Recebe o SLUG do tipo recém-criado, para a tela já selecioná-lo no formulário. */
  onTipoCriado?: (slug: string) => void;
  /** Recebe o SLUG do tipo excluído, para a tela limpar formulário e filtro. */
  onTipoExcluido?: (slug: string) => void;
}

export function GerenciarTiposDialog({
  open,
  onOpenChange,
  empresaId,
  podeGerenciar,
  onTipoCriado,
  onTipoExcluido,
}: GerenciarTiposDialogProps) {
  const { data: tiposDeCliente, isLoading: carregandoTipos, error: erroTipos } =
    useClientesTipos(empresaId);
  const tipos = tiposDeCliente ?? [];

  const criarTipo = useCriarTipoDeCliente();
  const renomearTipo = useRenomearTipoDeCliente();
  const excluirTipo = useExcluirTipoDeCliente();

  const [novoNome, setNovoNome] = useState('');
  /** Qual linha está com o campo de renomear aberto, e o texto sendo digitado nela. */
  const [emEdicao, setEmEdicao] = useState<{ id: string; nome: string } | null>(null);
  /**
   * Guarda id (para excluir no banco), slug (para a tela limpar formulário e filtro) e
   * nome (para a pergunta da confirmação).
   */
  const [confirmarExclusao, setConfirmarExclusao] = useState<
    { id: string; slug: string; nome: string } | null
  >(null);

  // Ao fechar, o diálogo esquece o que estava digitado: reabrir com um nome pela metade,
  // ou com uma linha em modo de renomear de uma sessão anterior, confunde mais do que
  // ajuda.
  useEffect(() => {
    if (!open) {
      setNovoNome('');
      setEmEdicao(null);
      setConfirmarExclusao(null);
    }
  }, [open]);

  const handleCriar = async () => {
    try {
      const slug = await criarTipo.mutateAsync({ nome: novoNome });
      onTipoCriado?.(slug);
      setNovoNome('');
      onOpenChange(false);
    } catch {
      // O toast do erro real já sai no onError do hook — inclusive a frase que o banco
      // devolve quando quem tentou não é gestor.
    }
  };

  const handleRenomear = async () => {
    if (!emEdicao) return;
    const tipoAtual = tipos.find(t => t.id === emEdicao.id);
    if (!tipoAtual) return;

    // decidirRenomeacao (src/lib/tipos-de-cliente.ts) concentra a regra -- é a mesma
    // função que o teste em use-clientes-tipos.test.ts cobre, sem precisar mockar o
    // Supabase. Aqui só se reage ao veredito.
    switch (decidirRenomeacao(emEdicao.nome, tipoAtual, tipos)) {
      case 'sem-mudanca':
        // Nada mudou: só fecha o campo, sem ir ao banco nem mostrar "Tipo renomeado".
        setEmEdicao(null);
        return;
      case 'vazio':
        toast.error('Informe um nome para o tipo');
        return;
      case 'duplicado':
        toast.error('Esse tipo já existe');
        return;
    }

    try {
      await renomearTipo.mutateAsync({ id: emEdicao.id, nome: emEdicao.nome });
      setEmEdicao(null);
    } catch {
      // idem: o campo continua aberto com o texto digitado, para a pessoa tentar de novo.
    }
  };

  const handleExcluir = async () => {
    if (!confirmarExclusao) return;
    try {
      await excluirTipo.mutateAsync({ id: confirmarExclusao.id });
      onTipoExcluido?.(confirmarExclusao.slug);
      setConfirmarExclusao(null);
    } catch {
      // idem
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <ConteudoDialogo className="sm:max-w-md">
          <CabecalhoDialogo>
            <DialogTitle>Gerenciar tipos</DialogTitle>
            <DialogDescription>
              Renomear só troca o rótulo: os clientes já classificados com este tipo
              continuam exatamente como estão. Excluir tira o tipo dos seletores, mas não
              reclassifica ninguém.
            </DialogDescription>
          </CabecalhoDialogo>

          <CorpoDialogo>
            {/* Criação */}
            {podeGerenciar && (
              <div className="space-y-2 pt-2 pb-3 border-b">
                <Label htmlFor="novo-tipo-nome">Novo tipo</Label>
                <div className="flex gap-2">
                  <Input
                    id="novo-tipo-nome"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Ex: Indústria, Cooperativa…"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCriar();
                      }
                    }}
                  />
                  <Button size="sm" onClick={handleCriar} disabled={criarTipo.isPending}>
                    <Plus className="h-4 w-4 mr-1" /> Criar
                  </Button>
                </div>
              </div>
            )}

            {/* Lista gerenciável */}
            <div className="space-y-3 pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Tipos existentes
              </p>
              {carregandoTipos ? (
                <p className="text-sm text-muted-foreground text-center py-3">Carregando tipos…</p>
              ) : erroTipos ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Não foi possível carregar os tipos.
                </p>
              ) : tipos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Nenhum tipo cadastrado
                </p>
              ) : (
                <div className="space-y-1">
                  {tipos.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 hover:bg-muted/40 transition-colors"
                    >
                      {emEdicao?.id === t.id ? (
                        // Renomeação INLINE, no lugar do nome. Abrir outro diálogo por cima
                        // deste empilharia uma terceira camada de foco do Radix — o mesmo
                        // problema que mantém este componente fora do EmpresaSelector.
                        <>
                          <Input
                            value={emEdicao.nome}
                            onChange={(e) =>
                              setEmEdicao(atual => (atual ? { ...atual, nome: e.target.value } : atual))
                            }
                            autoFocus
                            className="h-8"
                            aria-label={`Novo nome para "${t.nome}"`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRenomear();
                              }
                              if (e.key === 'Escape') {
                                // `stopPropagation` para o Esc cancelar SÓ a renomeação: sem
                                // ele a tecla sobe para o diálogo, que é quem normalmente
                                // trataria Esc. Aqui o `ui/dialog.tsx` já barra Esc, então
                                // isto é defesa — mas defesa barata contra alguém religar.
                                e.preventDefault();
                                e.stopPropagation();
                                setEmEdicao(null);
                              }
                            }}
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={handleRenomear}
                              disabled={renomearTipo.isPending}
                              title="Salvar nome"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => setEmEdicao(null)}
                              title="Cancelar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm truncate">{t.nome}</span>
                            {t.is_sistema && (
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 shrink-0">
                                padrão
                              </span>
                            )}
                          </div>
                          {podeGerenciar && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setEmEdicao({ id: t.id, nome: t.nome })}
                                title={`Renomear "${t.nome}"`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() =>
                                  setConfirmarExclusao({ id: t.id, slug: t.slug, nome: t.nome })
                                }
                                title={`Excluir "${t.nome}"`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CorpoDialogo>

          <RodapeDialogo>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>

      {/*
        Fora do <Dialog> de propósito. Os dois são portados para o <body> de qualquer
        jeito, e deixar a confirmação como irmã — e não como filha — é o arranjo que a tela
        de Clientes já usava em produção.
      */}
      <AlertDialog
        open={!!confirmarExclusao}
        onOpenChange={(o) => !o && setConfirmarExclusao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo "{confirmarExclusao?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O tipo sai dos seletores para toda a equipe. Empresas já cadastradas com ele
              continuam existindo e continuam aparecendo no filtro. Para trazer o tipo de volta,
              basta criá-lo outra vez com o mesmo nome. Se a intenção é só trocar o nome, use o
              lápis: renomear preserva a classificação de todos os clientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
