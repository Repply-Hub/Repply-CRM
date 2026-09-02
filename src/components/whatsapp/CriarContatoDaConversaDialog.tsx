import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus, Building2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CargoSelect } from '@/components/shared/CargoSelect';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { useClientes } from '@/hooks/use-clientes';
import { useCriarContatoDaConversa } from '@/hooks/use-criar-contato-da-conversa';
import { sugestaoDeContato, type ConversaParaContato } from '@/lib/contato-da-conversa';

/**
 * Abrir um contato no CRM a partir de uma conversa de WhatsApp.
 *
 * 🔴 POR QUE ISTO PRECISAVA EXISTIR. Medido em produção em 27/08/2026: das 779 conversas de
 * WhatsApp da MD, ZERO estão ligadas a um contato ou cliente do cadastro — e não por descuido,
 * mas porque **não havia tela nenhuma que gravasse esse vínculo**. A equipe conversa todo dia
 * com gente que o CRM não conhece, e cadastrar significava sair do WhatsApp, ir em Contatos,
 * digitar nome e telefone de novo e voltar. Pedido do Lucas: fazer isso de dentro da conversa.
 *
 * O nome e o telefone já vêm preenchidos do que a conversa sabe, e ambos são EDITÁVEIS: o nome
 * do WhatsApp é o apelido que a pessoa escolheu para si, não o nome que o cadastro precisa.
 */

interface CriarContatoDaConversaDialogProps {
  aberto: boolean;
  onFechar: () => void;
  conversa: ConversaParaContato | null;
  /** Chamado com o id do contato criado, para a tela seguir para a ficha se quiser. */
  onCriado?: (contatoId: string) => void;
}

export function CriarContatoDaConversaDialog({
  aberto,
  onFechar,
  conversa,
  onCriado,
}: CriarContatoDaConversaDialogProps) {
  const sugestao = useMemo(() => sugestaoDeContato(conversa), [conversa]);
  const criar = useCriarContatoDaConversa();
  const { data: clientes } = useClientes();

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [cargo, setCargo] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);

  // Recarrega a sugestão a cada abertura. Sem isto, abrir numa segunda conversa mostraria os
  // dados da primeira — e alguém cadastraria a pessoa errada com o telefone certo.
  useEffect(() => {
    if (!aberto) return;
    setNome(sugestao.nome);
    setTelefone(sugestao.telefone);
    setEmail('');
    setCargo('');
    setClienteId(null);
  }, [aberto, sugestao.nome, sugestao.telefone]);

  // "Sem cliente" na frente para dar como desmarcar — o campo é opcional. O resto é a
  // carteira inteira; a busca do próprio dropdown filtra na hora de digitar.
  const opcoesDeCliente = useMemo(() => {
    const lista = (clientes ?? []) as Array<{ id: string; empresa?: string | null }>;
    return [
      { value: '', label: 'Sem cliente' },
      ...lista
        .filter((c) => c.empresa)
        .map((c) => ({ value: c.id, label: c.empresa as string })),
    ];
  }, [clientes]);

  const clienteEscolhido = (clientes ?? []).find(
    (c: { id: string }) => c.id === clienteId,
  ) as { id: string; empresa?: string | null } | undefined;

  const salvar = async () => {
    try {
      const r = await criar.mutateAsync({
        conversaId: conversa!.id,
        nome,
        telefone,
        email,
        cargo,
        clienteId,
        // O nome vai junto para a ficha do contato e o bloco "Contatos Adicionais"
        // da empresa mostrarem o vínculo — as duas telas casam pelo texto `empresa`,
        // não pelo `cliente_id`. O hook reconfere no servidor a partir do id.
        empresa: clienteEscolhido?.empresa ?? null,
      });
      toast.success(
        r.vinculou
          ? 'Contato criado e ligado a esta conversa.'
          : // A segunda gravação falhou, mas o contato existe. Dizer isso é melhor que um
            // sucesso liso: quem souber pode ligar os dois depois, em vez de cadastrar de novo.
            'Contato criado. O vínculo com a conversa não foi gravado — o cadastro está lá.',
      );
      onCriado?.(r.contatoId);
      onFechar();
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível criar o contato.'));
    }
  };

  const podeSalvar = !sugestao.impedimento && nome.trim().length > 0 && telefone.trim().length > 0;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !criar.isPending && onFechar()}>
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Cadastrar como contato
          </DialogTitle>
          <DialogDescription>
            Abre a ficha desta pessoa no CRM e liga esta conversa a ela.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          {sugestao.impedimento ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {sugestao.impedimento}
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="contato-nome">Nome *</Label>
                <Input
                  id="contato-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Como esta pessoa se chama"
                  autoFocus
                />
                {/* O nome do WhatsApp é o apelido que a pessoa escolheu para si — costuma vir
                    com emoji, empresa e cargo grudados. Serve de sugestão, não de verdade. */}
                <p className="text-[11px] text-muted-foreground">
                  Veio do WhatsApp. Corrija se precisar.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contato-telefone">Telefone *</Label>
                  <Input
                    id="contato-telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cargo</Label>
                  <CargoSelect value={cargo} onValueChange={setCargo} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contato-email">E-mail</Label>
                <Input
                  id="contato-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="opcional"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Cliente
                </Label>
                {/* 🔴 OPCIONAL de propósito. Exigir o cliente aqui devolveria a pessoa ao
                    caminho longo — sair do WhatsApp, cadastrar a construtora, voltar. Contato
                    sem cliente continua achável na busca e pode ser amarrado depois; contato
                    NÃO cadastrado não existe para o sistema. */}
                <SearchableSelect
                  options={opcoesDeCliente}
                  value={clienteId ?? ''}
                  onValueChange={(v) => setClienteId(v || null)}
                  placeholder="Selecione o cliente"
                  searchPlaceholder="Buscar cliente..."
                  emptyMessage="Nenhum cliente encontrado."
                />
                <p className="text-[11px] text-muted-foreground">
                  Dá para deixar sem cliente e amarrar depois.
                </p>
              </div>
            </>
          )}
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" disabled={criar.isPending} onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={!podeSalvar || criar.isPending} onClick={() => void salvar()}>
            {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {criar.isPending ? 'Cadastrando…' : 'Cadastrar contato'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
