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

interface Props {
  /** `null` mantém o modal fechado — controlado pelo endereço a confirmar, não por um `open` à parte. */
  endereco: string | null;
  onCancelar: () => void;
  onConfirmar: (endereco: string) => void;
}

/**
 * Confirmação antes de abrir o compositor a partir de um clique num
 * endereço de e-mail — usada em vários lugares do CRM (detalhe de cliente,
 * de contato, painéis da lista, corpo de uma mensagem aberta), por isso é um
 * componente à parte em vez de duplicar o `AlertDialog` em cada tela.
 */
export function ConfirmarEnviarEmailDialog({ endereco, onCancelar, onConfirmar }: Props) {
  return (
    <AlertDialog open={!!endereco} onOpenChange={(aberto) => !aberto && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enviar e-mail?</AlertDialogTitle>
          <AlertDialogDescription>
            Deseja enviar um e-mail para <span className="font-medium text-foreground">{endereco}</span>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => endereco && onConfirmar(endereco)}>
            Enviar e-mail
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
