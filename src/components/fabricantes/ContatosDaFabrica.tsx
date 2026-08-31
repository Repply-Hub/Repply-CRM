import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Star, Pencil, Trash2, Plus, X, Phone, Mail, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useFabricanteContatos, useFabricanteFuncoes, useSalvarContato,
  useRemoverContato, useMarcarPrincipal,
} from '@/hooks/use-fabricante-contatos';
import { ordenarContatos, aoMarcarPrincipal } from '@/lib/contatos-da-fabrica';

/**
 * A lista de contatos de uma fábrica — gerente, logística, assistência técnica.
 *
 * ---------------------------------------------------------------------------------
 * POR QUE ELE FUNCIONA ANTES DE A FÁBRICA EXISTIR
 * ---------------------------------------------------------------------------------
 * Este componente serve DOIS lugares: a ficha da fábrica (onde ela já existe) e o
 * cadastro de fábrica nova (onde ainda não existe identificador para prender contato
 * nenhum).
 *
 * É o mesmo desenho de `SeletorContatosObra`, que o dono do produto apontou como
 * referência: sem `fabricanteId`, a lista vive no estado do PAI (`pendentes` /
 * `onPendentesChange`) e só vai para o banco depois que a fábrica for criada. Com
 * `fabricanteId`, cada gesto grava na hora.
 *
 * A alternativa — obrigar a cadastrar a fábrica, salvar, reabrir e só então acrescentar
 * contato — é exatamente o atrito que matou o campo de contato antigo (vazio nas 28
 * fábricas da MD).
 *
 * 🔴 ELE VIVE DENTRO DO <form> DO CADASTRO DE FÁBRICA. Por isso todo campo daqui bloqueia
 * o Enter: sem isso, digitar Enter no nome do contato SUBMETE o formulário de cima e cria
 * a fábrica no meio do cadastro do contato. Mesma armadilha que `SeletorContatosObra`
 * documenta, e os botões `type="button"` sozinhos não cobrem — a submissão implícita pelo
 * teclado passa por cima deles.
 */

export interface ContatoEditavel {
  /** Identificador do banco quando já existe; local (`novo-…`) enquanto é rascunho. */
  chave: string;
  nome: string;
  funcao_id: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  principal: boolean;
}

/**
 * O `<Select>` do Radix não aceita `value=""` num item — string vazia é o valor que ele
 * usa para "nada selecionado", e um `SelectItem` com ela faz o componente estourar.
 */
const SEM_FUNCAO = '__sem_funcao__';

const FORMULARIO_VAZIO = { nome: '', funcao_id: '', telefone: '', email: '', observacao: '' };

interface Props {
  /** Quando existe, cada gesto grava direto. Quando não, a lista é rascunho do pai. */
  fabricanteId?: string;
  pendentes?: ContatoEditavel[];
  onPendentesChange?: (lista: ContatoEditavel[]) => void;
  className?: string;
}

export function ContatosDaFabrica({
  fabricanteId,
  pendentes = [],
  onPendentesChange,
  className,
}: Props) {
  const gravaDireto = !!fabricanteId;

  const { data: doBanco = [] } = useFabricanteContatos(fabricanteId);
  const { data: funcoes = [] } = useFabricanteFuncoes();
  const salvar = useSalvarContato();
  const remover = useRemoverContato();
  const marcar = useMarcarPrincipal();

  const [criando, setCriando] = useState(false);
  const [editandoChave, setEditandoChave] = useState<string | null>(null);
  const [form, setForm] = useState(FORMULARIO_VAZIO);

  const lista: ContatoEditavel[] = gravaDireto
    ? doBanco.map((c) => ({
        chave: c.id,
        nome: c.nome,
        funcao_id: c.funcao_id,
        telefone: c.telefone,
        email: c.email,
        observacao: c.observacao,
        principal: c.principal,
      }))
    : pendentes;

  // A mesma ordenação nos dois modos, para o rascunho não reordenar ao salvar.
  const emOrdem = ordenarContatos(
    lista.map((c) => ({ ...c, id: c.chave })),
    funcoes,
  ).map((c) => lista.find((x) => x.chave === c.id)!);

  function fecharFormulario() {
    setCriando(false);
    setEditandoChave(null);
    setForm(FORMULARIO_VAZIO);
  }

  function abrirEdicao(c: ContatoEditavel) {
    setEditandoChave(c.chave);
    setCriando(true);
    setForm({
      nome: c.nome,
      funcao_id: c.funcao_id ?? '',
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      observacao: c.observacao ?? '',
    });
  }

  async function gravar() {
    const nome = form.nome.trim();
    if (!nome) {
      toast.error('O nome do contato é obrigatório.');
      return;
    }
    const campos = {
      nome,
      funcao_id: form.funcao_id || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      observacao: form.observacao.trim() || null,
    };

    if (!gravaDireto) {
      if (editandoChave) {
        onPendentesChange?.(
          pendentes.map((c) => (c.chave === editandoChave ? { ...c, ...campos } : c)),
        );
      } else {
        onPendentesChange?.([
          ...pendentes,
          {
            chave: `novo-${Date.now()}-${pendentes.length}`,
            ...campos,
            // O primeiro nasce principal: sem isso o cartão da lista ficaria sem ninguém.
            principal: pendentes.length === 0,
          },
        ]);
      }
      fecharFormulario();
      return;
    }

    try {
      await salvar.mutateAsync({
        id: editandoChave ?? undefined,
        fabricante_id: fabricanteId!,
        ...campos,
        ...(editandoChave ? {} : { principal: lista.length === 0 }),
      });
      fecharFormulario();
      toast.success(editandoChave ? 'Contato atualizado.' : 'Contato adicionado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o contato.');
    }
  }

  async function excluir(c: ContatoEditavel) {
    if (!gravaDireto) {
      const resto = pendentes.filter((x) => x.chave !== c.chave);
      // Removeu o principal? O primeiro que sobrou assume — a fábrica não pode ficar com
      // contatos e nenhum principal.
      if (c.principal && resto.length > 0 && !resto.some((x) => x.principal)) {
        resto[0] = { ...resto[0], principal: true };
      }
      onPendentesChange?.(resto);
      return;
    }
    try {
      await remover.mutateAsync({ id: c.chave, fabricanteId: fabricanteId! });
      toast.success('Contato removido.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível remover o contato.');
    }
  }

  async function tornarPrincipal(c: ContatoEditavel) {
    if (!gravaDireto) {
      onPendentesChange?.(
        pendentes.map((x) => ({ ...x, principal: x.chave === c.chave })),
      );
      return;
    }
    // A lista já vem com o DESMARQUE do anterior: o banco recusa dois principais.
    const mudancas = aoMarcarPrincipal(
      doBanco,
      c.chave,
    );
    if (mudancas.length === 0) return;
    try {
      await marcar.mutateAsync({ mudancas, fabricanteId: fabricanteId! });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível marcar o principal.');
    }
  }

  return (
    <div className={cn('rounded-lg border border-border', className)}>
      <div className="flex items-center gap-2 border-b border-border p-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 px-1">
          <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">Contatos</span>
          {emOrdem.length > 0 && (
            <span className="text-xs text-muted-foreground">({emOrdem.length})</span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          onClick={() => (criando ? fecharFormulario() : setCriando(true))}
        >
          {criando ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {criando ? 'Cancelar' : 'Novo contato'}
        </Button>
      </div>

      {criando && (
        // 🔴 `onKeyDown` no bloco inteiro: estes campos vivem DENTRO do <form> do cadastro
        // de fábrica, e Enter num input submete o formulário que os contém — criaria a
        // FÁBRICA no meio do cadastro do contato.
        <div
          className="space-y-2 border-b border-border bg-muted/30 p-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              gravar();
            }
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Função</Label>
              <Select
                value={form.funcao_id || SEM_FUNCAO}
                onValueChange={(v) =>
                  setForm({ ...form, funcao_id: v === SEM_FUNCAO ? '' : v })
                }
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_FUNCAO}>Sem função</SelectItem>
                  {funcoes.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Observação</Label>
            <Input
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" className="h-8"
                    onClick={fecharFormulario}>
              Cancelar
            </Button>
            <Button type="button" size="sm" className="h-8"
                    onClick={gravar} disabled={salvar.isPending}>
              {editandoChave ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      )}

      {emOrdem.length === 0 && !criando && (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          Nenhum contato cadastrado.
        </p>
      )}

      <ul className="divide-y divide-border">
        {emOrdem.map((c) => {
          const funcao = funcoes.find((f) => f.id === c.funcao_id);
          return (
            <li key={c.chave} className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{c.nome}</span>
                  {c.principal && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Principal
                    </span>
                  )}
                  {funcao && (
                    <span className="text-xs text-muted-foreground">· {funcao.nome}</span>
                  )}
                </div>
                {c.telefone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3 flex-shrink-0" /> {c.telefone}
                  </p>
                )}
                {c.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 break-all">
                    <Mail className="h-3 w-3 flex-shrink-0" /> {c.email}
                  </p>
                )}
                {c.observacao && (
                  <p className="text-xs text-muted-foreground mt-0.5">{c.observacao}</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-none">
                {!c.principal && (
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                          title="Tornar principal" onClick={() => tornarPrincipal(c)}>
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                        title="Editar" onClick={() => abrirEdicao(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                        title="Remover" onClick={() => excluir(c)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
