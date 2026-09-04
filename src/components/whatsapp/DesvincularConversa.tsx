import { useState } from 'react';
import { Link2Off, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { toast } from 'sonner';
import { useDesvincularConversa } from '@/hooks/use-contato-por-telefone';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

interface DesvincularConversaProps {
  conversaId: string;
  /** Nome da pessoa hoje amarrada, para a confirmação dizer de quem se está desamarrando. */
  nomeDoContato?: string | null;
  /** Nome da empresa hoje amarrada. */
  nomeDaEmpresa?: string | null;
}

/**
 * O botão de desfazer o vínculo de uma conversa com a pessoa e a empresa.
 *
 * 🔴 POR QUE ISTO EXISTE. Até 04/09/2026 o clique em "Vincular" era **irreversível pela
 * interface**: nenhum ponto do sistema gravava `contato_id: null`. E o erro se escondia sozinho —
 * o bloco de reconhecimento só aparece quando NÃO há vínculo, então amarrar a pessoa errada fazia
 * o convite sumir e o painel passar a apontar para a ficha errada, sem caminho de volta.
 *
 * Vive em componente próprio porque `WhatsAppInbox.tsx` já tem mais de 7,8 mil linhas
 * (CLAUDE.md §14: ao encostar nela, extraia em vez de engordar).
 *
 * 🔴 PEDE CONFIRMAÇÃO, e a confirmação DIZ O NOME de quem vai ser desamarrado. Sem o nome, a
 * pergunta "tem certeza?" não ajuda ninguém a perceber que está prestes a desfazer o vínculo certo
 * da conversa errada.
 */
export function DesvincularConversa({
  conversaId,
  nomeDoContato,
  nomeDaEmpresa,
}: DesvincularConversaProps) {
  const [aberto, setAberto] = useState(false);
  const desvincular = useDesvincularConversa();

  const alvo = nomeDoContato || nomeDaEmpresa || 'este cadastro';

  const confirmar = async () => {
    try {
      await desvincular.mutateAsync({ conversaId });
      toast.success('Conversa desvinculada. Ela volta a aparecer como não reconhecida.');
      setAberto(false);
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível desvincular esta conversa.'));
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => setAberto(true)}
      >
        <Link2Off className="h-3 w-3 mr-1.5" />
        Desvincular
      </Button>

      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular esta conversa de {alvo}?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa deixa de estar ligada à pessoa e à empresa, e volta a aparecer como não
              reconhecida — com a sugestão de cadastro de novo disponível. As mensagens não são
              apagadas, e o contato continua existindo no CRM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desvincular.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Sem isto o Radix fecha o diálogo antes de a gravação terminar, e um erro do
                // banco não teria mais onde aparecer.
                e.preventDefault();
                void confirmar();
              }}
              disabled={desvincular.isPending}
            >
              {desvincular.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
