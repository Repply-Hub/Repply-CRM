import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, TriangleAlert, Wand2 } from 'lucide-react';
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
import { useAuth } from '@/hooks/use-auth';
import { useClientes } from '@/hooks/use-clientes';
import { useConfiguracoesCampos } from '@/hooks/use-configuracoes-campos';
import { useUpdateContato } from '@/hooks/use-mutations';
import {
  useVincularContatoExistente,
  type ContatoReconhecido,
} from '@/hooks/use-contato-por-telefone';
import { nomeParaCadastro, telefoneComONumeroDoChat } from '@/lib/contato-da-conversa';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

/**
 * Vincular a conversa a um contato que já existe — passando pela ficha dele antes.
 *
 * 🔴 POR QUE NÃO É UM BOTÃO DIRETO, pedido do dono do produto em 07/09/2026: "o telefone do
 * contato deve ser atualizado automaticamente com o telefone do chat (…) aparecer como se fosse
 * o painel de edição de um contato, aí teria nele as novas informações que puxaram de forma
 * automática e o usuário só clicaria em salvar".
 *
 * O motivo é concreto. Estes dois caminhos de vínculo existem justamente para o caso em que o
 * telefone da ficha É DIFERENTE do número que está falando — o cadastro tem o fixo da
 * construtora e a pessoa fala do celular. Amarrar sem tocar na ficha resolve a conversa de hoje
 * e deixa o cadastro errado para sempre: amanhã ninguém reconhece o mesmo número de novo, e o
 * convite para vincular reaparece.
 *
 * 🔴 O TELEFONE SOMA, NÃO SUBSTITUI (decisão do dono do produto no mesmo dia). O fixo continua
 * valendo — é por ele que se fala com a empresa quando aquela pessoa sai. A regra e os casos de
 * borda estão em `telefoneComONumeroDoChat`.
 *
 * 🔴 O NOME DO WHATSAPP É DICA, NUNCA PREENCHIMENTO. Ele é o apelido que a pessoa escolheu para
 * si e costuma vir com emoji, empresa e cargo grudados; o nome do cadastro costuma ser melhor.
 * Aparece ao lado, com um botão para aplicar, e só entra se alguém clicar.
 */

interface VincularEAtualizarContatoProps {
  aberto: boolean;
  onFechar: () => void;
  conversa: { id: string; telefone: string; nome_contato?: string | null };
  contato: ContatoReconhecido | null;
  /**
   * De onde veio a escolha. `nome` é o palpite pelo nome parecido, que erra cerca de 1 em 3 —
   * e por isso carrega o aviso em destaque. `busca` é escolha à mão, que não erra sozinha.
   */
  origem: 'nome' | 'busca';
}

export function VincularEAtualizarContato({
  aberto,
  onFechar,
  conversa,
  contato,
  origem,
}: VincularEAtualizarContatoProps) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: clientes } = useClientes();
  const { data: camposDeContato, isLoading: carregandoCampos } = useConfiguracoesCampos(
    'contatos',
    empresaId,
  );
  const atualizar = useUpdateContato();
  const vincular = useVincularContatoExistente();

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [cargo, setCargo] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);

  // O telefone que a ficha PASSA A TER, calculado uma vez por abertura. Fica fora do estado
  // inicial para a nota "o que mudou" poder comparar com o que estava lá antes.
  const telefoneSugerido = useMemo(
    () => telefoneComONumeroDoChat(contato?.telefone, conversa.telefone),
    [contato?.telefone, conversa.telefone],
  );

  // Recarrega a ficha a cada abertura. Sem isto, abrir num segundo contato mostraria os dados
  // do primeiro — e alguém salvaria o nome de uma pessoa na ficha de outra.
  useEffect(() => {
    if (!aberto || !contato) return;
    setNome(contato.nome_contato ?? '');
    setTelefone(telefoneSugerido);
    setEmail(contato.email ?? '');
    setCargo(contato.cargo ?? '');
    setClienteId(contato.cliente_id ?? null);
  }, [aberto, contato, telefoneSugerido]);

  const emailObrigatorio = carregandoCampos
    ? false
    : (camposDeContato?.find((c) => c.campo_key === 'email')?.obrigatorio ?? true);

  const opcoesDeCliente = useMemo(() => {
    const lista = (clientes ?? []) as Array<{ id: string; empresa?: string | null }>;
    return [
      { value: '', label: 'Sem empresa' },
      ...lista.filter((c) => c.empresa).map((c) => ({ value: c.id, label: c.empresa as string })),
    ];
  }, [clientes]);

  const clienteEscolhido = (clientes ?? []).find(
    (c: { id: string }) => c.id === clienteId,
  ) as { id: string; empresa?: string | null } | undefined;

  /** O nome que o WhatsApp mostra, limpo — só vira dica quando difere do que está na ficha. */
  const nomeDoWhatsapp = nomeParaCadastro(conversa.nome_contato);
  const valeSugerirNome =
    nomeDoWhatsapp.length > 0 && nomeDoWhatsapp.toLowerCase() !== nome.trim().toLowerCase();

  /** O que o chat acrescentou ao campo de telefone, para a nota embaixo dele. */
  const notaDoTelefone = (() => {
    const antes = (contato?.telefone ?? '').trim();
    if (telefoneSugerido === antes) return null;
    if (!antes) return 'A ficha estava sem telefone. Preenchemos com o número deste chat.';
    return 'O número deste chat foi acrescentado. O que já estava continua aí.';
  })();

  const podeSalvar =
    !!contato &&
    nome.trim().length > 0 &&
    telefone.trim().length > 0 &&
    (!emailObrigatorio || email.trim().length > 0);

  const salvar = async () => {
    if (!contato) return;
    try {
      await atualizar.mutateAsync({
        id: contato.id,
        nome_contato: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim() || undefined,
        cargo: cargo.trim() || null,
        cliente_id: clienteId,
        // 🔴 O texto `empresa` anda junto do vínculo. Telas antigas leem esse campo solto, e
        // deixá-lo apontando para a construtora anterior faria a mesma ficha dizer duas coisas.
        empresa: clienteEscolhido?.empresa ?? undefined,
      });
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível salvar a ficha deste contato.'));
      return;
    }

    try {
      await vincular.mutateAsync({
        conversaId: conversa.id,
        contatoId: contato.id,
        clienteId,
      });
      toast.success(`Ficha atualizada e conversa ligada a ${nome.trim() || 'este contato'}.`);
      onFechar();
    } catch (e) {
      // 🔴 Dizer exatamente o que foi feito e o que não foi. Um "não deu certo" liso faria a
      // pessoa refazer a edição que JÁ está gravada.
      toast.error(
        mensagemDeErro(
          e,
          'A ficha foi salva, mas o vínculo com a conversa não foi gravado. Tente vincular de novo.',
        ),
      );
    }
  };

  const salvando = atualizar.isPending || vincular.isPending;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Vincular e atualizar o cadastro
          </DialogTitle>
          <DialogDescription>
            Confira a ficha antes de ligar esta conversa a ela. O que veio do chat já está
            preenchido.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          {/* 🔴 O aviso do palpite por nome vem JUNTO com a edição, e não antes dela. Separar em
              duas telas faria a pessoa ler o aviso, clicar, e só então ver os campos — quando o
              aviso já teria saído da vista. Aqui ele fica ao lado do que está sendo mudado. */}
          {origem === 'nome' && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                Confira antes de salvar
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Esta pessoa foi encontrada pelo <strong>nome</strong>, não pelo número. Esse
                palpite erra cerca de 1 vez em 3, e quando erra costuma apontar um colega da mesma
                construtora. Se não for ele, feche esta janela.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="vinc-nome">Nome *</Label>
            <Input id="vinc-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            {valeSugerirNome && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>
                  No WhatsApp aparece como{' '}
                  <span className="font-medium text-card-foreground">{nomeDoWhatsapp}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setNome(nomeDoWhatsapp)}
                  className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                >
                  <Wand2 className="h-3 w-3" /> usar este nome
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vinc-telefone">Telefone *</Label>
            <Input
              id="vinc-telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
            {notaDoTelefone && (
              <p className="text-[11px] text-primary">{notaDoTelefone}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <CargoSelect value={cargo} onValueChange={setCargo} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vinc-email">E-mail{emailObrigatorio ? ' *' : ''}</Label>
              <Input
                id="vinc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={emailObrigatorio ? 'obrigatório nesta empresa' : 'opcional'}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <SearchableSelect
              options={opcoesDeCliente}
              value={clienteId ?? ''}
              onValueChange={(v) => setClienteId(v || null)}
              placeholder="Selecione a empresa"
              searchPlaceholder="Buscar empresa..."
              emptyMessage="Nenhuma empresa encontrada."
            />
            <p className="text-[11px] text-muted-foreground">
              É a empresa que faz os negócios desta pessoa aparecerem na ficha dela.
            </p>
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" disabled={salvando} onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={!podeSalvar || salvando} onClick={() => void salvar()}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {salvando ? 'Salvando…' : 'Salvar e vincular'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
