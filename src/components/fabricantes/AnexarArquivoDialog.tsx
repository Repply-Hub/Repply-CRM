import { useState } from 'react';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { tamanhoLegivel } from '@/lib/fabricante-arquivos';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { gerarCapaDoPdf } from '@/lib/capa-do-pdf';
import { useAnexarArquivo, TETO_BYTES } from '@/hooks/use-fabricante-arquivos';

/**
 * Anexar um catálogo, folder ou planilha ao drive da fábrica.
 *
 * Não pergunta o TIPO do arquivo: a seção se chama "Catálogos, folders e materiais" e aceita
 * o que vier. Cada pergunta a mais na hora de anexar é uma chance a mais de a pessoa desistir.
 */

const MESES = [
  { v: '1', l: 'Janeiro' }, { v: '2', l: 'Fevereiro' }, { v: '3', l: 'Março' },
  { v: '4', l: 'Abril' }, { v: '5', l: 'Maio' }, { v: '6', l: 'Junho' },
  { v: '7', l: 'Julho' }, { v: '8', l: 'Agosto' }, { v: '9', l: 'Setembro' },
  { v: '10', l: 'Outubro' }, { v: '11', l: 'Novembro' }, { v: '12', l: 'Dezembro' },
];

/** O valor do Select para "sem mês". Radix não aceita item com valor vazio. */
const ANO_INTEIRO = 'ano-inteiro';

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
    const anoNum = Number.parseInt(ano, 10);
    if (!Number.isFinite(anoNum) || anoNum < 2000 || anoNum > 2100) {
      toast.error('Informe um ano entre 2000 e 2100.');
      return;
    }

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
        edicaoMes: mes === ANO_INTEIRO ? null : Number.parseInt(mes, 10),
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

          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={nome} onChange={(e) => setNome(e.target.value)} disabled={ocupado}
              placeholder="Como aparece no cartão"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Mês da edição</Label>
              {/* Opcional de propósito: há fábrica que faz catálogo anual, e obrigá-la a
                  inventar um mês criaria uma data que ninguém consegue justificar. */}
              <Select value={mes} onValueChange={setMes} disabled={ocupado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANO_INTEIRO}>O ano inteiro</SelectItem>
                  {MESES.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ano</Label>
              <Input
                type="text" inputMode="numeric" value={ano}
                onChange={(e) => setAno(e.target.value)} disabled={ocupado}
              />
            </div>
          </div>
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
