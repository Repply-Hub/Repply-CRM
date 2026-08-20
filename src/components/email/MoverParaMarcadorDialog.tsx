import { useMemo, useState } from 'react';
import { Loader2, Plus, Search, Tag, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEmailPastas, useCriarMarcador, useMoverParaMarcador } from '@/hooks/use-email-pastas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaId?: string | null;
  /** Uma mensagem ou a seleção em massa — o mesmo diálogo serve para os dois casos. */
  mensagemIds: string[];
  /** Disparado só quando o movimento realmente aconteceu — não no cancelamento. */
  onMoved?: () => void;
}

/**
 * "Mover para" — escolhe um marcador existente ou cria um novo na hora, sem
 * sair do fluxo. A criação usa a MESMA `useCriarMarcador` do botão da barra
 * lateral: o marcador criado aqui é permanente na caixa, não algo específico
 * desta mensagem.
 */
export function MoverParaMarcadorDialog({ open, onOpenChange, contaId, mensagemIds, onMoved }: Props) {
  const { data: pastas = [] } = useEmailPastas(contaId);
  const criarMut = useCriarMarcador(contaId);
  const moverMut = useMoverParaMarcador();

  const [busca, setBusca] = useState('');
  const [modoCriar, setModoCriar] = useState(false);
  const [novoNome, setNovoNome] = useState('');

  const marcadores = useMemo(() => pastas.filter((p) => !p.ehSistema), [pastas]);
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return marcadores;
    return marcadores.filter((p) => p.nome.toLowerCase().includes(termo));
  }, [marcadores, busca]);

  const fechar = () => {
    onOpenChange(false);
    // Sem timeout: o Dialog já anima a saída, então resetar já não é visível.
    setBusca('');
    setModoCriar(false);
    setNovoNome('');
  };

  const moverPara = (pastaId: string) => {
    moverMut.mutate(
      { mensagemIds, pastaId },
      {
        onSuccess: () => {
          onMoved?.();
          fechar();
        },
      },
    );
  };

  const criarEMover = async () => {
    if (!novoNome.trim()) return;
    const pasta = await criarMut.mutateAsync(novoNome.trim());
    moverPara(pasta.id);
  };

  const carregando = moverMut.isPending || criarMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : fechar())}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {modoCriar
              ? 'Novo marcador'
              : `Mover ${mensagemIds.length > 1 ? `${mensagemIds.length} e-mails` : 'e-mail'} para`}
          </DialogTitle>
          {modoCriar && (
            <DialogDescription>
              Cria o marcador na caixa de e-mail conectada e já move para ele.
            </DialogDescription>
          )}
        </DialogHeader>

        {modoCriar ? (
          <div className="space-y-3">
            <Input
              placeholder="Ex: 011 - NOVO CLIENTE"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') criarEMover();
              }}
              autoFocus
            />
            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setModoCriar(false)} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar
              </Button>
              <Button size="sm" onClick={criarEMover} disabled={!novoNome.trim() || carregando}>
                {carregando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar e mover
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {marcadores.length > 8 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar marcador..."
                  className="h-9 pl-8 text-sm"
                  autoFocus
                />
              </div>
            )}

            <ScrollArea className="max-h-64">
              <div className="flex flex-col gap-0.5 pr-2">
                {filtrados.length === 0 && (
                  <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                    {busca ? `Nenhum marcador encontrado para "${busca}".` : 'Nenhum marcador ainda.'}
                  </p>
                )}
                {filtrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={carregando}
                    onClick={() => moverPara(p.pastaId)}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60 disabled:opacity-50"
                  >
                    <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    {moverMut.isPending && moverMut.variables?.pastaId === p.pastaId && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModoCriar(true)}
              className="w-full justify-start gap-2 text-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              Novo marcador
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
