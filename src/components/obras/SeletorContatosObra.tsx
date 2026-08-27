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
  const { data: contatos, isLoading } = useContatosDoCliente(clienteId, clienteEmpresa);
  const createContato = useCreateContato();
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState({ nome_contato: '', cargo: '', email: '', telefone: '' });

  const filtrados = useMemo(() => {
    const lista = contatos ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (c) =>
        (c.nomeContato || '').toLowerCase().includes(q) ||
        (c.cargo || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    );
  }, [contatos, busca]);

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

  if (!clienteId) {
    return (
      <div className={cn('rounded-lg border border-dashed border-border bg-muted/30 p-3', className)}>
        <p className="text-xs text-muted-foreground">
          Escolha o cliente da obra primeiro — os contatos que aparecem aqui são os dele.
        </p>
      </div>
    );
  }

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
              : 'Este cliente ainda não tem contatos cadastrados. Use "Novo contato" acima.'}
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
                  {c.nomeContato || 'Contato sem nome'}
                  {c.cargo && <span className="ml-1.5 text-xs text-muted-foreground">· {c.cargo}</span>}
                </span>
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
