import { useMemo, useState } from 'react';
import { Link2, Loader2, Search, User, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useContatosParaVincular, useVincularContatoExistente } from '@/hooks/use-contato-por-telefone';
import { contatosQueCasamComTexto, telefoneParaCadastro } from '@/lib/contato-da-conversa';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

/**
 * Procurar, à mão, o contato do CRM a que esta conversa pertence.
 *
 * 🔴 POR QUE ESTA TELA PRECISOU EXISTIR, relatado pelo dono do produto em 06/09/2026. O chat do
 * Djair (84 99920-2015) oferecia **só** "Cadastrar como contato", embora ele tenha TRÊS fichas
 * no CRM. As duas camadas automáticas erraram por motivos diferentes:
 *
 *   - o telefone gravado na ficha é `6143498404030`, um dos 383 números corrompidos na
 *     importação de 24/07 — nenhuma comparação honesta o reconhece;
 *   - a ficha que casaria pelo nome ("Djair - Licenge") está **sem telefone**, e a consulta de
 *     reconhecimento excluía quem não tem telefone. Esse filtro caiu junto com esta tela.
 *
 * Mesmo com os dois consertos sobra o caso geral: o cadastro simplesmente não se parece com o
 * que o WhatsApp mostra. Aí a máquina não tem como saber, e a pessoa tem. Sem esta saída, o
 * único caminho oferecido era criar mais uma ficha da mesma pessoa — que é exatamente o
 * problema que o reconhecimento existe para evitar.
 *
 * 🔴 A BUSCA ACHA PELA EMPRESA, e isso não é detalhe: é assim que se encontra quem está sem
 * telefone no cadastro. Digitar "licenge" traz o Djair que nenhuma régua automática traria.
 */

/** Lista longa é onde se clica no errado. Acima disto, a tela pede para refinar a busca. */
const MOSTRAR_NO_MAXIMO = 40;

interface VincularContatoExistenteProps {
  aberto: boolean;
  onFechar: () => void;
  conversa: { id: string; telefone: string; nome_contato?: string | null };
}

export function VincularContatoExistente({
  aberto,
  onFechar,
  conversa,
}: VincularContatoExistenteProps) {
  const [busca, setBusca] = useState('');
  const { contatos, carregando } = useContatosParaVincular(aberto);
  const vincular = useVincularContatoExistente();

  const encontrados = useMemo(
    () => contatosQueCasamComTexto(busca, contatos),
    [busca, contatos],
  );
  const visiveis = encontrados.slice(0, MOSTRAR_NO_MAXIMO);

  const amarrar = async (contatoId: string, clienteId: string | null, nome: string | null) => {
    try {
      await vincular.mutateAsync({ conversaId: conversa.id, contatoId, clienteId });
      toast.success(`Conversa ligada a ${nome || 'este contato'}.`);
      onFechar();
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível ligar a conversa a este contato.'));
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !vincular.isPending && onFechar()}>
      <ConteudoDialogo className="sm:max-w-lg">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Vincular a um contato existente
          </DialogTitle>
          <DialogDescription>
            Procure quem é esta pessoa no cadastro. A conversa passa a aparecer na ficha dela,
            na empresa e nos negócios.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-3">
          {/* 🔴 O número de quem está falando fica À VISTA o tempo todo. Sem ele, a pessoa
              procura de memória e amarra o contato errado — e o vínculo errado some da vista. */}
          <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Falando aqui:{' '}
            <span className="font-mono font-medium text-card-foreground">
              {telefoneParaCadastro(conversa.telefone)}
            </span>
            {conversa.nome_contato ? (
              <>
                {' '}· aparece como{' '}
                <span className="font-medium text-card-foreground">{conversa.nome_contato}</span>
              </>
            ) : null}
          </p>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, empresa ou telefone"
              className="pl-8"
              autoFocus
            />
          </div>

          {carregando ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando o cadastro...
            </div>
          ) : visiveis.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {busca.trim()
                ? 'Ninguém no cadastro bate com essa busca.'
                : 'Nenhum contato cadastrado ainda.'}
            </p>
          ) : (
            <div className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
              {visiveis.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"
                >
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.nome_contato || 'Contato sem nome'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.empresa, c.telefone || 'sem telefone no cadastro']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1.5"
                    onClick={() => void amarrar(c.id, c.cliente_id ?? null, c.nome_contato)}
                    disabled={vincular.isPending}
                  >
                    {vincular.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Link2 className="h-3 w-3" />
                    )}
                    Vincular
                  </Button>
                </div>
              ))}
            </div>
          )}

          {encontrados.length > MOSTRAR_NO_MAXIMO && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Mostrando {MOSTRAR_NO_MAXIMO} de {encontrados.length}. Escreva mais para achar a
              pessoa certa — em lista longa é fácil clicar no errado.
            </p>
          )}
        </CorpoDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
