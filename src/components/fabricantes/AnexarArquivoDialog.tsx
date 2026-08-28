import { useState } from 'react';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tamanhoLegivel } from '@/lib/fabricante-arquivos';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { gerarCapaDoPdf } from '@/lib/capa-do-pdf';
import { useAnexarArquivo, TETO_BYTES } from '@/hooks/use-fabricante-arquivos';
import { CamposDaEdicao } from './CamposDaEdicao';
import { ANO_INTEIRO, selectParaMes } from './mes-da-edicao';

/**
 * Anexar um catálogo, folder ou planilha ao drive da fábrica.
 *
 * Não pergunta o TIPO do arquivo: a seção se chama "Catálogos, folders e materiais" e aceita
 * o que vier. Cada pergunta a mais na hora de anexar é uma chance a mais de a pessoa desistir.
 *
 * Nome, mês e ano moram em `CamposDaEdicao`, compartilhados com o "Editar material": as duas
 * telas perguntam a mesma coisa, e deixá-las divergir permitiria consertar a edição num lugar
 * e continuar errando no outro.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fabricanteId: string;
}

export function AnexarArquivoDialog({ open, onOpenChange, fabricanteId }: Props) {
  const anexar = useAnexarArquivo();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nome, setNome] = useState('');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [mes, setMes] = useState<string>(ANO_INTEIRO);
  const [preparandoCapa, setPreparandoCapa] = useState(false);

  const limpar = () => {
    setArquivo(null); setNome('');
    setAno(String(new Date().getFullYear())); setMes(ANO_INTEIRO);
  };

  const escolher = (f: File | null) => {
    if (!f) return;
    // 🔴 RECUSA ANTES DE SUBIR. Deixar subir 200 MB para falhar no fim gasta o tempo e a
    // internet de quem está numa obra — e é onde o representante trabalha.
    if (f.size > TETO_BYTES) {
      toast.error(`Arquivo de ${tamanhoLegivel(f.size)}. O limite é 50 MB.`);
      return;
    }
    setArquivo(f);
    if (!nome.trim()) setNome(f.name.replace(/\.[^.]+$/, ''));
  };

  const salvar = async () => {
    if (!arquivo) { toast.error('Escolha um arquivo.'); return; }
    // O ano vem de uma lista fechada desde 28/08/2026, então não há mais o que validar aqui:
    // `anosDeEdicao` só oferece anos que a restrição do banco aceita.
    const anoNum = Number.parseInt(ano, 10);

    try {
      // A capa é opcional e não pode travar o anexo: PDF protegido devolve null e o cartão
      // cai no ícone do formato. Ver capa-do-pdf.ts.
      setPreparandoCapa(true);
      const capa = await gerarCapaDoPdf(arquivo);
      setPreparandoCapa(false);

      await anexar.mutateAsync({
        fabricanteId,
        arquivo,
        nome,
        edicaoAno: anoNum,
        edicaoMes: selectParaMes(mes),
        capa,
      });
      toast.success('Arquivo anexado.');
      limpar();
      onOpenChange(false);
    } catch (e) {
      setPreparandoCapa(false);
      toast.error(`Não foi possível anexar: ${mensagemDeErro(e)}`);
    }
  };

  const ocupado = anexar.isPending || preparandoCapa;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!ocupado) { onOpenChange(o); if (!o) limpar(); } }}>
      {/* ConteudoDialogo e não DialogContent cru: este projeto desligou Esc e clique-fora, e
          modal sem teto de altura prende a pessoa na tela. CLAUDE.md §7.11. */}
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle>Anexar material</DialogTitle>
          <DialogDescription>
            Catálogo, folder, tabela — qualquer arquivo até 50 MB.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          <div className={cn(
            'relative rounded-lg border-2 border-dashed p-4 transition-colors',
            arquivo ? 'border-primary/50 bg-primary/5' : 'border-muted hover:border-primary/30',
          )}>
            <input
              type="file"
              onChange={(e) => escolher(e.target.files?.[0] ?? null)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              disabled={ocupado}
            />
            <div className="flex items-center justify-center gap-3">
              {arquivo ? (
                <>
                  <FileText className="h-6 w-6 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{arquivo.name}</p>
                    <p className="text-xs text-muted-foreground">{tamanhoLegivel(arquivo.size)}</p>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    aria-label="Trocar arquivo" disabled={ocupado}
                    onClick={(e) => { e.stopPropagation(); setArquivo(null); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Clique ou arraste o arquivo</p>
                    <p className="text-xs text-muted-foreground">PDF, planilha, imagem — o que precisar</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <CamposDaEdicao
            nome={nome} aoMudarNome={setNome}
            ano={ano} aoMudarAno={setAno}
            mes={mes} aoMudarMes={setMes}
            desabilitado={ocupado}
          />
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="outline" disabled={ocupado} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!arquivo || ocupado} onClick={() => void salvar()}>
            {ocupado && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {preparandoCapa ? 'Preparando a capa…' : anexar.isPending ? 'Enviando…' : 'Anexar'}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
