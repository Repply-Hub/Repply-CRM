import { useState } from 'react';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Star, Pencil, Trash2, Plus, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  useFabricanteContatos, useFabricanteFuncoes, useSalvarContato,
  useRemoverContato, useMarcarPrincipal,
} from '@/hooks/use-fabricante-contatos';
import {
  ordenarContatos, aoMarcarPrincipal, type ContatoDaFabrica,
} from '@/lib/contatos-da-fabrica';

/**
 * A lista de contatos de uma fábrica.
 *
 * POR QUE ESTA SEÇÃO EXISTE: a fábrica tinha UM contato, em duas colunas soltas. Um
 * representante fala com várias pessoas na mesma fábrica — o gerente, quem cuida da
 * logística, a assistência técnica — e um campo só não dava conta. Medido em 31/08/2026:
 * o campo antigo estava VAZIO nas 28 fábricas da MD.
 *
 * Ver docs/superpowers/specs/2026-08-31-contatos-por-fabricante-design.md.
 */

/** `funcao_id` vazio é legítimo: a função é OPCIONAL, por decisão de desenho (§3.2). */
const FORMULARIO_VAZIO = {
  nome: '', funcao_id: '', telefone: '', email: '', observacao: '',
};

/**
 * O `<Select>` do Radix não aceita `value=""` num item — string vazia é o valor que ele usa
 * para "nada selecionado", e passar isso num `SelectItem` faz o componente estourar. Por
 * isso "Sem função" viaja como este sentinela e é traduzido de volta para `null` na
 * gravação.
 */
const SEM_FUNCAO = '__sem_funcao__';

export function ContatosDaFabrica({ fabricanteId }: { fabricanteId: string }) {
  const { data: contatos = [], isLoading } = useFabricanteContatos(fabricanteId);
  const { data: funcoes = [] } = useFabricanteFuncoes();
  const salvar = useSalvarContato();
  const remover = useRemoverContato();
  const marcar = useMarcarPrincipal();

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<ContatoDaFabrica | null>(null);
  const [form, setForm] = useState(FORMULARIO_VAZIO);

  const emOrdem = ordenarContatos(contatos, funcoes);

  function abrirNovo() {
    setEditando(null);
    setForm(FORMULARIO_VAZIO);
    setAberto(true);
  }

  function abrirEdicao(c: ContatoDaFabrica) {
    setEditando(c);
    setForm({
      nome: c.nome,
      funcao_id: c.funcao_id ?? '',
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      observacao: c.observacao ?? '',
    });
    setAberto(true);
  }

  async function gravar() {
    if (!form.nome.trim()) {
      toast.error('O nome do contato é obrigatório.');
      return;
    }
    try {
      await salvar.mutateAsync({
        id: editando?.id,
        fabricante_id: fabricanteId,
        nome: form.nome.trim(),
        funcao_id: form.funcao_id || null,
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
        observacao: form.observacao.trim() || null,
        // O PRIMEIRO contato da fábrica nasce principal. Sem isto, o cartão da lista
        // ficaria sem ninguém até alguém lembrar de marcar — e ninguém lembra.
        ...(editando ? {} : { principal: contatos.length === 0 }),
      });
      setAberto(false);
      toast.success(editando ? 'Contato atualizado.' : 'Contato adicionado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o contato.');
    }
  }

  async function tornarPrincipal(id: string) {
    // A lista já vem com o DESMARQUE do anterior: o banco recusa dois principais na mesma
    // fábrica, e mandar só "marca este" faria a gravação ser recusada.
    const mudancas = aoMarcarPrincipal(contatos, id);
    if (mudancas.length === 0) return;
    try {
      await marcar.mutateAsync({ mudancas, fabricanteId });
      toast.success('Contato principal atualizado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível marcar o principal.');
    }
  }

  async function excluir(c: ContatoDaFabrica) {
    try {
      await remover.mutateAsync({ id: c.id, fabricanteId });
      toast.success('Contato removido.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível remover o contato.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Contatos</h3>
        <Button size="sm" variant="outline" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando contatos…</p>}

      {!isLoading && emOrdem.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum contato cadastrado nesta fábrica.
        </p>
      )}

      <ul className="space-y-2">
        {emOrdem.map((c) => {
          const funcao = funcoes.find((f) => f.id === c.funcao_id);
          return (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{c.nome}</span>
                  {c.principal && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Principal
                    </span>
                  )}
                </div>
                {funcao && (
                  <p className="text-xs text-muted-foreground">{funcao.nome}</p>
                )}
                {c.telefone && (
                  <p className="text-xs flex items-center gap-1 mt-1">
                    <Phone className="h-3 w-3 flex-shrink-0" /> {c.telefone}
                  </p>
                )}
                {c.email && (
                  <p className="text-xs flex items-center gap-1 break-all">
                    <Mail className="h-3 w-3 flex-shrink-0" /> {c.email}
                  </p>
                )}
                {c.observacao && (
                  <p className="text-xs text-muted-foreground mt-1">{c.observacao}</p>
                )}
              </div>

              <div className="flex items-center gap-1 flex-none">
                {!c.principal && (
                  <Button
                    size="icon" variant="ghost" title="Tornar principal"
                    disabled={marcar.isPending}
                    onClick={() => tornarPrincipal(c.id)}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" title="Editar" onClick={() => abrirEdicao(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon" variant="ghost" title="Remover"
                  disabled={remover.isPending}
                  onClick={() => excluir(c)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <ConteudoDialogo className="sm:max-w-[425px]">
          <CabecalhoDialogo>
            <DialogTitle>{editando ? 'Editar contato' : 'Novo contato'}</DialogTitle>
          </CabecalhoDialogo>

          <CorpoDialogo className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="contato-nome">Nome</Label>
              <Input
                id="contato-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Função</Label>
              <Select
                value={form.funcao_id || SEM_FUNCAO}
                onValueChange={(v) =>
                  setForm({ ...form, funcao_id: v === SEM_FUNCAO ? '' : v })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_FUNCAO}>Sem função</SelectItem>
                  {funcoes.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contato-telefone">Telefone</Label>
              <Input
                id="contato-telefone"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contato-email">E-mail</Label>
              <Input
                id="contato-email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contato-obs">Observação</Label>
              <Textarea
                id="contato-obs"
                rows={2}
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </div>
          </CorpoDialogo>

          <RodapeDialogo>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>
    </div>
  );
}
