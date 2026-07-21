import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2, FileText, MessageSquareText } from 'lucide-react';

export interface FilePreviewTarget {
  url: string;
  nome: string;
  mime?: string | null;
  msgId?: string;
}

type Kind = 'pdf' | 'spreadsheet' | 'docx' | 'unsupported';

const SPREADSHEET_EXT = ['xlsx', 'xls', 'csv'];
const DOCX_EXT = ['docx'];

function extensionOf(nome: string): string {
  return (nome.split('.').pop() || '').toLowerCase();
}

function kindOf(nome: string, mime?: string | null): Kind {
  const ext = extensionOf(nome);
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (DOCX_EXT.includes(ext) || mime?.includes('wordprocessingml')) return 'docx';
  if (
    SPREADSHEET_EXT.includes(ext) ||
    mime === 'text/csv' ||
    mime?.includes('spreadsheetml') ||
    mime === 'application/vnd.ms-excel'
  ) {
    return 'spreadsheet';
  }
  return 'unsupported';
}

export function isPreviewable(nome: string, mime?: string | null): boolean {
  return kindOf(nome, mime) !== 'unsupported';
}

function SpreadsheetPreview({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(false);
    fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        if (cancelled) return;
        const workbook = XLSX.read(buf, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        setHtml(XLSX.utils.sheet_to_html(firstSheet, { editable: false }));
      })
      .catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <PreviewError />;
  if (!html) return <PreviewLoading />;

  return (
    <div
      className="overflow-auto max-h-[70vh] border rounded-md [&_table]:text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function DocxPreview({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(false);
    (async () => {
      try {
        const mammoth = await import('mammoth');
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) setHtml(result.value);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <PreviewError />;
  if (!html) return <PreviewLoading />;

  return (
    <div
      className="overflow-auto max-h-[70vh] border rounded-md p-4 prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function PreviewLoading() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" /> Carregando pré-visualização...
    </div>
  );
}

function PreviewError() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
      <FileText className="h-8 w-8 opacity-40" />
      <p className="text-sm">Não foi possível gerar a pré-visualização.</p>
    </div>
  );
}

export function FilePreviewDialog({
  file,
  onClose,
  onJumpToMessage,
}: {
  file: FilePreviewTarget | null;
  onClose: () => void;
  onJumpToMessage?: (msgId: string) => void;
}) {
  const kind = file ? kindOf(file.nome, file.mime) : 'unsupported';

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="truncate">{file?.nome}</DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              {file?.msgId && onJumpToMessage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => onJumpToMessage(file.msgId!)}
                >
                  <MessageSquareText className="h-3.5 w-3.5" /> Ver na conversa
                </Button>
              )}
              {file && (
                <a href={file.url} download={file.nome} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                    <Download className="h-3.5 w-3.5" /> Baixar
                  </Button>
                </a>
              )}
            </div>
          </div>
        </DialogHeader>
        {file && kind === 'pdf' && (
          <iframe
            src={file.url}
            title={file.nome}
            className="w-full h-[75vh] rounded-md border"
          />
        )}
        {file && kind === 'spreadsheet' && <SpreadsheetPreview url={file.url} />}
        {file && kind === 'docx' && <DocxPreview url={file.url} />}
        {file && kind === 'unsupported' && <PreviewError />}
      </DialogContent>
    </Dialog>
  );
}
