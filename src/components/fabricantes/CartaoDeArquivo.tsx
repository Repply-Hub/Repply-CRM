import { FileText, FileSpreadsheet, FileImage, File as FileIcon, Download, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isPreviewable } from '@/components/chat/FilePreviewDialog';
import { rotuloDaEdicao, tamanhoLegivel } from '@/lib/fabricante-arquivos';
import type { ArquivoDaFabrica } from '@/hooks/use-fabricante-arquivos';

/**
 * Um arquivo do drive da fábrica, como retângulo arredondado.
 *
 * 🔴 TODOS OS CARTÕES TÊM A MESMA ALTURA, com ou sem capa. A área da imagem é fixa: quando não
 * há capa, ela mostra o ícone do formato no mesmo espaço. Altura variável deixaria a grade
 * irregular, e grade irregular é a diferença entre "uma prateleira" e "uma bagunça".
 */

function iconeDoFormato(nome: string, mime: string | null) {
  const ext = (nome.split('.').pop() || '').toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf') return FileText;
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext) || mime?.includes('spreadsheet')) return FileSpreadsheet;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) || mime?.startsWith('image/')) return FileImage;
  return FileIcon;
}

interface Props {
  arquivo: ArquivoDaFabrica;
  /** Link temporário da capa. `null` quando não há capa ou a assinatura falhou. */
  capaUrl: string | null;
  podeExcluir: boolean;
  aoVer: () => void;
  aoBaixar: () => void;
  aoExcluir: () => void;
  /** Ausente quando a pessoa não tem WhatsApp vinculado: aí o botão nem aparece. */
  aoEnviar?: () => void;
  ocupado?: boolean;
}

export function CartaoDeArquivo({
  arquivo,
  capaUrl,
  podeExcluir,
  aoVer,
  aoBaixar,
  aoExcluir,
  aoEnviar,
  ocupado,
}: Props) {
  const Icone = iconeDoFormato(arquivo.nome, arquivo.mime);
  const podeVer = isPreviewable(arquivo.nome, arquivo.mime);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20">
      {/* 🔴 O QUADRO INTEIRO ABRE A PRÉ-VISUALIZAÇÃO, não só o botão "Ver".
          Capa e nome são a parte que a pessoa olha e para onde ela leva o cursor; obrigar o
          clique num botão pequeno lá embaixo é atrito sem motivo.

          É `<button>` de verdade, e não uma `<div>` com onClick: assim funciona pelo teclado
          e o leitor de tela anuncia como ação. Só existe quando há o que mostrar — para
          formato sem visualizador, o quadro é só quadro.

          `object-cover` sem `object-top`: quem escolhe a altura do recorte agora é o gerador
          da capa (`capa-do-pdf.ts`), que procura onde a página tem conteúdo. Cortar pelo topo
          aqui desfaria esse trabalho — foi o que transformou o catálogo da Deca, que tem uma
          faixa preta no topo, num retângulo preto. */}
      <button
        type="button"
        disabled={!podeVer}
        onClick={podeVer ? aoVer : undefined}
        aria-label={podeVer ? `Ver ${arquivo.nome}` : undefined}
        className={cn(
          // `flex-1` e `w-full`: o botão virou o corpo do cartão, e sem eles ele encolheria
          // para o tamanho do conteúdo — cartões com nome curto ficariam mais baixos que os
          // outros e a grade voltaria a ter degraus.
          'group flex w-full flex-1 flex-col text-left',
          podeVer && 'cursor-pointer',
        )}
      >
      <div className="relative flex h-36 items-center justify-center overflow-hidden border-b border-border bg-muted/40">
        {capaUrl ? (
          <img
            src={capaUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Icone className="h-9 w-9 text-muted-foreground/50" />
        )}

        <span className="absolute right-2 top-2 rounded-md bg-background/90 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-foreground shadow-sm">
          {rotuloDaEdicao(arquivo.edicao_ano, arquivo.edicao_mes)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <p className={cn(
          'truncate text-sm font-medium leading-snug text-card-foreground',
          podeVer && 'group-hover:text-primary',
        )} title={arquivo.nome}>
          {arquivo.nome}
        </p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {tamanhoLegivel(arquivo.tamanho)}
        </p>
      </div>
      </button>

      <div className="flex items-center gap-1 border-t border-border p-2">
        {/* Não há botão "Ver" aqui: quem abre a pré-visualização é o QUADRO inteiro, acima.
            Ter os dois seria oferecer o mesmo caminho duas vezes e roubar espaço de Baixar e
            Enviar, que são ações que o quadro não faz. */}
        <Button variant="ghost" size="sm" className="h-8 flex-1 gap-1.5 px-2 text-xs" onClick={aoBaixar}>
          <Download className="h-3.5 w-3.5" /> Baixar
        </Button>
        {/* SOME para quem não tem WhatsApp vinculado, em vez de aparecer desabilitado:
            botão que não faz nada é o defeito que a aba Automação acabou de perder. */}
        {aoEnviar && (
          <Button
            variant="ghost" size="sm"
            className="h-8 flex-1 gap-1.5 px-2 text-xs text-primary hover:text-primary"
            disabled={ocupado} onClick={aoEnviar}
          >
            <Send className="h-3.5 w-3.5" /> Enviar
          </Button>
        )}
        {/* O botão de excluir some para quem não pode — mas quem protege é a regra do banco:
            a política de DELETE exige gestor ou permissão em "fabricantes". Esconder botão é
            conveniência, não segurança (CLAUDE.md §6.1). */}
        {podeExcluir && (
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 shrink-0 text-destructive hover:text-destructive')}
            aria-label={`Excluir ${arquivo.nome}`}
            disabled={ocupado}
            onClick={aoExcluir}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
