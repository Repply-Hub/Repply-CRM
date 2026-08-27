import { useMemo, useState } from 'react';
import { Loader2, Plus, Search, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CargoSelect } from '@/components/shared/CargoSelect';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCreateContato } from '@/hooks/use-mutations';
import { useContatosDoCliente } from '@/hooks/use-obra-contatos';
import { useContatos } from '@/hooks/use-clientes';
import {
  opcoesDeContato,
  filtrarOpcoesDeContato,
  avisoDaListaDeContatos,
} from '@/lib/opcoes-de-contato';

interface SeletorContatosObraProps {
  /** Cliente dono da obra. Sem ele não há lista: obra sem cliente não tem de quem puxar contato. */
  clienteId?: string | null;
  /** Nome da empresa cliente — vai no campo `empresa` do contato criado aqui. */
  clienteEmpresa?: string | null;
  /** Ids marcados (controlado pelo pai, para funcionar antes de a obra existir). */
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

/**
 * Escolhe quais pessoas do cliente respondem por uma obra.
 *
 * Um componente só para os três lugares que vinculam contato a obra (Nova Obra,
 * Editar Obra e a ficha da obra) — a alternativa seria a mesma lista copiada
 * três vezes, que é exatamente como os campos da obra já divergiram antes.
 *
 * A lista é SEMPRE do cliente da obra. Foi decisão do dono do produto em
 * 27/08/2026 e não é preciosismo: a obra pertence a uma construtora, e oferecer
 * contatos de outra deixaria gravar um vínculo que não existe no mundo real —
 * coisa que o banco não impede (a checagem cruzada exigiria trigger entre duas
 * tabelas, ver a migration do vínculo).
 */
export function SeletorContatosObra({
  clienteId,
  clienteEmpresa,
  value,
  onChange,
  className,
}: SeletorContatosObraProps) {
  const { data: contatos, isLoading, isError } = useContatosDoCliente(clienteId, clienteEmpresa);
  // 🔴 A SEGUNDA FONTE. Medido em 27/08/2026: em 32 das 82 obras o cliente não tem contato
  // nenhum, e 428 dos 1.092 contatos não têm cliente amarrado — sem isto, quatro em cada dez
  // obras abrem a lista VAZIA e 428 pessoas não podem ser vinculadas a obra alguma.
  const { data: todosOsContatos, isLoading: carregandoTodos } = useContatos();
  const createContato = useCreateContato();
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState({ nome_contato: '', cargo: '', email: '', telefone: '' });

  // Os do cliente primeiro, os demais alcançáveis logo abaixo e MARCADOS com a empresa deles.
  // A composição é pura e testada — ver `src/lib/opcoes-de-contato.ts`.
  const opcoes = useMemo(
    () =>
      opcoesDeContato(
        (contatos ?? []).map((c) => ({
          id: c.id,
          nome_contato: c.nomeContato,
          cargo: c.cargo,
          email: c.email,
          telefone: c.telefone,
        })),
        (todosOsContatos ?? []).map((c: Record<string, unknown>) => ({
          id: String(c.id),
          nome_contato: (c.nome_contato as string) ?? null,
          cargo: (c.cargo as string) ?? null,
          email: (c.email as string) ?? null,
          telefone: (c.telefone as string) ?? null,
          // 🔴 O nome da empresa tem DUAS moradas, e o selo precisa das duas: quem tem cliente
          // amarrado traz o nome pelo vínculo (`cliente.empresa`); o cadastro antigo tem só o
          // texto solto em `contatos.empresa`. Ler só uma delas deixaria metade dos contatos
          // sem selo — e contato sem selo se parece com contato do cliente desta obra.
          empresa:
            ((c.cliente as { empresa?: string } | null)?.empresa) ??
            (c.empresa as string) ??
            null,
        })),
      ),
    [contatos, todosOsContatos],
  );

  const filtrados = useMemo(() => filtrarOpcoesDeContato(opcoes, busca), [opcoes, busca]);

  const alternar = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const salvarNovo = async () => {
    if (!novo.nome_contato.trim()) {
      toast.error('Informe o nome do contato.');
      return;
    }
    try {
      // O contato nasce já ligado ao cliente da obra — é o que permite que ele
      // apareça neste seletor no instante seguinte, sem passar pela ficha do cliente.
      const criado = await createContato.mutateAsync({
        cliente_id: clienteId || undefined,
        empresa: clienteEmpresa || undefined,
        nome_contato: novo.nome_contato.trim(),
        cargo: novo.cargo.trim() || undefined,
        email: novo.email.trim() || undefined,
        telefone: novo.telefone.trim() || undefined,
      });
      if (criado?.id) onChange([...value, criado.id]);
      setNovo({ nome_contato: '', cargo: '', email: '', telefone: '' });
      setCriando(false);
      toast.success('Contato criado e marcado para esta obra.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível criar o contato.');
    }
  };

  // 🔴 Sem cliente escolhido a lista NÃO é mais bloqueada. Antes havia um corte aqui que
  // devolvia só o aviso "escolha o cliente primeiro" — e junto com ele sumia o botão "Novo
  // contato", que era o único caminho restante. Agora a lista mostra todos os contatos da
  // empresa, marcados, e o aviso vira uma frase acima dela.

  return (
    <div className={cn('rounded-lg border border-border', className)}>
      <div className="flex items-center gap-2 border-b border-border p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            // Este campo vive dentro do <form> do modal da obra, que tem um único
            // botão de submit: Enter aqui criaria/salvaria a OBRA no meio da busca.
            // O handler fica no próprio campo, e não no bloco em volta, para não
            // duplicar com o do formulário de contato novo (que também trata Enter).
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
            placeholder="Buscar contato..."
            className="h-8 pl-7 text-sm"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          onClick={() => setCriando((v) => !v)}
        >
          {criando ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {criando ? 'Cancelar' : 'Novo contato'}
        </Button>
      </div>

      {criando && (
        // Formulário mínimo de propósito: o resto do cadastro (endereço, campos
        // personalizados) continua na ficha do contato. Aqui é para não obrigar a
        // sair da obra no meio do cadastro só porque a pessoa ainda não existe.
        //
        // 🔴 `onKeyDown` no bloco inteiro: estes campos vivem DENTRO do <form> do
        // modal da obra, e Enter num input submete o formulário que o contém — ou
        // seja, criaria a OBRA no meio do cadastro do contato. Os botões já têm
        // type="button", mas isso não cobre a submissão implícita pelo teclado.
        <div
          className="space-y-2 border-b border-border bg-muted/30 p-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              salvarNovo();
            }
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input
                value={novo.nome_contato}
                onChange={(e) => setNovo((n) => ({ ...n, nome_contato: e.target.value }))}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cargo</Label>
              <CargoSelect
                value={novo.cargo}
                onValueChange={(v) => setNovo((n) => ({ ...n, cargo: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={novo.email}
                onChange={(e) => setNovo((n) => ({ ...n, email: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone</Label>
              <Input
                value={novo.telefone}
                onChange={(e) => setNovo((n) => ({ ...n, telefone: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          </div>
          {/* type="button" é obrigatório: este bloco vive DENTRO do <form> do
              modal da obra, e um botão sem type submete o formulário inteiro —
              criaria a obra no meio do cadastro do contato. */}
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={salvarNovo}
            disabled={createContato.isPending}
          >
            {createContato.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Salvar contato
          </Button>
        </div>
      )}

      <div className="max-h-56 overflow-y-auto p-1">
        {isLoading ? (
          <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando os contatos...
          </div>
        ) : filtrados.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {busca
              ? 'Nenhum contato com esse nome.'
              : avisoDaListaDeContatos({
                  temCliente: !!clienteId,
                  temAlgum: false,
                  carregando: isLoading || carregandoTodos,
                  erro: isError,
                })}
          </p>
        ) : (
          filtrados.map((c) => {
            const marcado = value.includes(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50',
                  marcado && 'bg-accent/40'
                )}
              >
                <Checkbox checked={marcado} onCheckedChange={() => alternar(c.id)} />
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {c.nome}
                  {c.detalhe && (
                    <span className="ml-1.5 text-xs text-muted-foreground">· {c.detalhe}</span>
                  )}
                </span>
                {/* 🔴 O SELO É O QUE TORNA ACEITÁVEL MOSTRAR TODOS: sem ele alguém vincula ao
                    canteiro o comprador de OUTRA construtora sem perceber, e o erro só aparece
                    quando essa pessoa recebe ligação sobre uma obra que não é dela. */}
                {c.selo && (
                  <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {c.selo}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>

      {value.length > 0 && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          {value.length} contato(s) selecionado(s)
        </p>
      )}
    </div>
  );
}
