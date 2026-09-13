import { useState, useMemo, useRef } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { correspondeBusca } from '@/lib/texto-busca';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { CampoCnpj, type CampoCnpjHandle } from '@/components/shared/CampoCnpj';
import { unmaskCnpj, formatarDocumento, resultadoPermiteSalvar } from '@/lib/cnpj';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFabricantes } from '@/hooks/use-clientes';
import { useCreateFabricanteCompleto } from '@/hooks/use-novo-pedido';
import { fabricanteEstaAtivo } from '@/lib/ordem-de-fabricantes';
import { toast } from 'sonner';

interface FabricanteSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function FabricanteSelector({ value, onValueChange, placeholder = "Selecionar fabricante..." }: FabricanteSelectorProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newFab, setNewFab] = useState({
    nome: '',
    cnpj: '',
  });

  const { data: fabricantes, isLoading } = useFabricantes();
  const createFabricante = useCreateFabricanteCompleto();
  const campoCnpjRef = useRef<CampoCnpjHandle>(null);
  const [conferindo, setConferindo] = useState(false);
  // Sessão do modal: incrementa quando ele FECHA (pelo "X" ou pelo "Cancelar") — nenhum dos dois
  // desmonta este componente, então sem isto o cadastro em andamento seguia até o fim mesmo com a
  // pessoa já tendo desistido. `fecharDialogo` é o único caminho que fecha o modal.
  const sessaoRef = useRef(0);

  const fecharDialogo = (aberto: boolean) => {
    if (!aberto) {
      sessaoRef.current += 1;
      // Sem isto o botão reabria preso em "Conferindo o CNPJ...": a promessa velha do
      // handleCreate só zera `conferindo` se a sessão ainda bater, e como acabamos de
      // trocá-la, ela nunca mais vai bater. Reabrir precisa nascer destravado.
      setConferindo(false);
    }
    setDialogOpen(aberto);
  };

  // A lista chega do hook já com as marcas inativas por último (`useFabricantes`), e este
  // filtro preserva a ordem — `Array.prototype.filter` não reordena nada.
  const filteredFabricantes = useMemo(() => {
    if (!fabricantes) return [];
    if (!searchTerm) return fabricantes;
    // Sem acento e sem caixa: "acos" acha "Aços". O CNPJ casa DÍGITO COM DÍGITO, dos dois lados:
    // as fábricas antigas guardam com máscara e as novas só com dígitos, e comparar o texto cru
    // não achava nenhuma das antigas. Só entra na conta quando a busca é um número — senão
    // "Tigre 2" traria toda fábrica com um 2 no CNPJ.
    const buscaEhNumero = /^[\d./\-\s]+$/.test(searchTerm.trim());
    const digitosDaBusca = searchTerm.replace(/\D/g, '');
    return fabricantes.filter((f) =>
      correspondeBusca(f.nome, searchTerm) ||
      (buscaEhNumero && digitosDaBusca.length > 0 && (f.cnpj ?? '').replace(/\D/g, '').includes(digitosDaBusca))
    );
  }, [fabricantes, searchTerm]);

  const selectedFab = useMemo(() => 
    fabricantes?.find((f) => f.id === value), 
  [fabricantes, value]);

  const handleCreate = async () => {
    if (!newFab.nome) {
      toast.error('O nome do fabricante é obrigatório');
      return;
    }

    // Mesma regra da tela de Fabricantes: CNPJ que a Receita CONFIRMA não existir não entra, e o
    // cadastro espera a consulta de quem digitou e clicou direto. Serviço fora do ar não trava.
    const sessaoDoEnvio = sessaoRef.current;
    setConferindo(true);
    const conferencia = await campoCnpjRef.current?.conferir();
    // Só zera o cadeado desta MESMA sessão: se a pessoa fechou, reabriu e clicou em "Cadastrar"
    // de novo, esta promessa velha (que só volta agora) não pode destravar a conferência NOVA
    // que ainda está rodando — senão os dois cliques criam a fábrica duas vezes. Fechar o modal
    // já zera `conferindo` sozinho (em `fecharDialogo`, ao lado do `sessaoRef.current += 1`).
    if (sessaoDoEnvio === sessaoRef.current) setConferindo(false);
    // Fechar o modal (o "X" ou "Cancelar") durante a espera não cancela nada sozinho — sem esta
    // guarda a gravação seguia até o fim e trocava a fábrica selecionada no negócio em silêncio.
    if (sessaoDoEnvio !== sessaoRef.current) return;
    if (conferencia && !resultadoPermiteSalvar(conferencia, 'bloquear')) return;

    try {
      const result = await createFabricante.mutateAsync({
        nome: newFab.nome,
        cnpj: unmaskCnpj(newFab.cnpj) || undefined,
      });
      toast.success('Fabricante cadastrado com sucesso!');
      setDialogOpen(false);
      if (result?.id) {
        onValueChange(result.id);
      }
      setNewFab({ nome: '', cnpj: '' });
    } catch (error) {
      toast.error('Erro ao cadastrar fabricante: ' + mensagemDeErro(error));
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {/* O negócio antigo de uma marca desativada continua abrindo com ela
                escolhida — o selo no botão explica por que aquele nome não aparece mais no
                topo da lista, sem sugerir que algo está errado com o negócio. */}
            {selectedFab ? (
              <span className="flex items-center gap-1.5 truncate">
                <span className="truncate">{selectedFab.nome}</span>
                {!fabricanteEstaAtivo(selectedFab) && (
                  <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                    Inativa
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Buscar fabricante..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty className="py-2 px-2">
                <p className="text-xs text-muted-foreground mb-2 text-center">Nenhum fabricante encontrado.</p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full gap-2 text-xs"
                  onClick={() => {
                    setNewFab(prev => ({ ...prev, nome: searchTerm }));
                    setDialogOpen(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Cadastrar "{searchTerm}"
                </Button>
              </CommandEmpty>
              <CommandGroup>
                {filteredFabricantes.map((fab) => (
                  <CommandItem
                    key={fab.id}
                    value={fab.id}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === fab.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5">
                        {fab.nome}
                        {/* Marca que a empresa não representa mais. Continua escolhível —
                            negócio antigo pode precisar ser corrigido para ela —, só está
                            no fim da lista e avisa o porquê. */}
                        {!fabricanteEstaAtivo(fab) && (
                          <span className="rounded border border-border px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                            Inativa
                          </span>
                        )}
                      </span>
                      {fab.cnpj && (
                        <span className="text-[10px] text-muted-foreground">{formatarDocumento(fab.cnpj)}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {searchTerm && filteredFabricantes.length > 0 && (
              <div className="p-1 border-t">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="w-full justify-start gap-2 text-xs font-normal"
                  onClick={() => {
                    setNewFab(prev => ({ ...prev, nome: searchTerm }));
                    setDialogOpen(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Novo fabricante: "{searchTerm}"
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={fecharDialogo}>
        <ConteudoDialogo className="sm:max-w-[425px]">
          <CabecalhoDialogo>
            <DialogTitle>Cadastrar Novo Fabricante</DialogTitle>
          </CabecalhoDialogo>
          <CorpoDialogo className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fab-name">Nome do Fabricante *</Label>
              <Input
                id="fab-name"
                value={newFab.nome}
                onChange={(e) => setNewFab({ ...newFab, nome: e.target.value })}
                placeholder="Ex: Tigre, Deca"
              />
            </div>
            <CampoCnpj
              ref={campoCnpjRef}
              id="fab-cnpj"
              value={newFab.cnpj}
              onChange={(v) => setNewFab((f) => ({ ...f, cnpj: v }))}
              onDadosEncontrados={(dados) =>
                setNewFab((f) => ({ ...f, nome: f.nome || dados.razao_social || '' }))
              }
              seNaoExistir="bloquear"
            />
          </CorpoDialogo>
          <RodapeDialogo>
            <Button variant="outline" onClick={() => fecharDialogo(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createFabricante.isPending || conferindo}>
              {conferindo ? 'Conferindo o CNPJ...' : createFabricante.isPending ? 'Salvando...' : 'Cadastrar e Selecionar'}
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>
    </>
  );
}
