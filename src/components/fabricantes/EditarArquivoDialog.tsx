import { useEffect, useState } from 'react';
import { Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { tamanhoLegivel } from '@/lib/fabricante-arquivos';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { useEditarArquivo, type ArquivoDaFabrica } from '@/hooks/use-fabricante-arquivos';
import { CamposDaEdicao } from './CamposDaEdicao';
import { ANO_INTEIRO, mesParaSelect, selectParaMes } from './mes-da-edicao';

/**
 * Corrigir o que foi escrito num material do drive: nome e edição.
 *
 * 🔴 NÃO TROCA O ARQUIVO. É o mesmo formulário do "Anexar material" sem a área de upload, e
 * isso é a funcionalidade, não uma limitação a esconder: o endereço do arquivo no balde é
 * único e trocá-lo envolve subir o novo e apagar o velho, com o risco de sobrar um objeto
 * órfão de dezenas de megabytes se qualquer metade falhar. O corpo do diálogo diz à pessoa
 * o caminho para o outro caso — excluir e anexar de novo — em vez de deixá-la procurando um
 * botão que não existe.
 *
 * Por que isto passou a existir em 28/08/2026: um mês errado empurrava a edição vigente para
 * baixo na prateleira e não tinha conserto nenhum pela tela.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arquivo: ArquivoDaFabrica | null;
  fabricanteId: string;
}

export function EditarArquivoDialog({ open, onOpenChange, arquivo, fabricanteId }: Props) {
  const editar = useEditarArquivo();
  const [nome, setNome] = useState('');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [mes, setMes] = useState<string>(ANO_INTEIRO);

  // O diálogo fica montado o tempo todo dentro do drive (é assim que o Radix consegue animar
  // o fechamento), então o valor inicial do `useState` só valeria para o PRIMEIRO cartão
  // aberto — do segundo em diante o formulário abriria com os dados do anterior, e salvar
  // renomearia o arquivo errado.
  useEffect(() => {
    if (!open || !arquivo) return;
    setNome(arquivo.nome);
    setAno(String(arquivo.edicao_ano));
    setMes(mesParaSelect(arquivo.edicao_mes));
  }, [open, arquivo]);

  const salvar = async () => {
    if (!arquivo) return;
    if (!nome.trim()) { toast.error('Dê um nome ao material.'); return; }

    try {
      await editar.mutateAsync({
        id: arquivo.id,
        fabricanteId,
        nome,
        edicaoAno: Number.parseInt(ano, 10),
        edicaoMes: selectParaMes(mes),
      });
      toast.success('Material atualizado.');
      onOpenChange(false);
    } catch (e) {
      toast.error(`Não foi possível salvar: ${mensagemDeErro(e)}`);
    }
  };

  // Sem mudança, não há o que gravar: uma chamada ao banco para escrever o mesmo valor só
  // gasta a espera de quem clicou.
  const mudou = !!arquivo && (
    nome.trim() !== arquivo.nome
    || Number.parseInt(ano, 10) !== arquivo.edicao_ano
    || selectParaMes(mes) !== arquivo.edicao_mes
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!editar.isPending) onOpenChange(o); }}>
      {/* ConteudoDialogo e não DialogContent cru: este projeto desligou Esc e clique-fora, e
          modal sem teto de altura prende a pessoa na tela. CLAUDE.md §7.11. */}
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle>Editar material</DialogTitle>
          <DialogDescription>
            Corrija o nome e a edição. O arquivo em si continua o mesmo — para trocá-lo,
            exclua este material e anexe o novo.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          {/* O arquivo aparece, apagado, no lugar onde o "Anexar" tem a área de upload: assim
              a pessoa confirma que está editando o cartão certo e vê, sem ler nada, que este
              pedaço não é o que está em jogo. */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{arquivo?.nome}</p>
              <p className="text-xs text-muted-foreground">
                {arquivo ? tamanhoLegivel(arquivo.tamanho) : ''}
              </p>
            </div>
          </div>

          <CamposDaEdicao
            nome={nome} aoMudarNome={setNome}
            ano={ano} aoMudarAno={setAno}
            mes={mes} aoMudarMes={setMes}
            desabilitado={editar.isPending}
          />
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" disabled={editar.isPending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!mudou || editar.isPending} onClick={() => void salvar()}>
            {editar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {editar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
