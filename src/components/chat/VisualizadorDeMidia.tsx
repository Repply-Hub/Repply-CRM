import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { downloadFile } from '@/lib/download-file';

export interface MidiaParaVer {
  url: string;
  tipo: 'imagem' | 'video';
  nome?: string;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.5;

/**
 * Mini-visualização embutida de imagem e vídeo do chat interno (como no WhatsApp):
 * a imagem abre com zoom (botões e arraste), o vídeo toca com controles — em vez de
 * abrir em nova aba. Documento (PDF/Word/Excel) continua no `FilePreviewDialog`.
 */
export function VisualizadorDeMidia({ midia, onClose }: { midia: MidiaParaVer | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const arrastando = useRef<{ x: number; y: number } | null>(null);

  // Zera zoom e deslocamento a cada mídia nova aberta.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [midia?.url]);

  if (!midia) return null;

  const aplicarZoom = (delta: number) =>
    setZoom((z) => {
      const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta));
      if (novo === 1) setPan({ x: 0, y: 0 });
      return novo;
    });

  const aoPressionar = (e: React.MouseEvent) => {
    if (zoom === 1) return;
    arrastando.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const aoMover = (e: React.MouseEvent) => {
    if (!arrastando.current) return;
    setPan({ x: e.clientX - arrastando.current.x, y: e.clientY - arrastando.current.y });
  };
  const soltar = () => { arrastando.current = null; };

  return (
    <Dialog open={!!midia} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-full max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Visualizador de Mídia</DialogTitle>
        <DialogDescription className="sr-only">Visualizador de imagem e vídeo</DialogDescription>
        <div className="flex items-center justify-end gap-1 p-2 border-b border-border bg-muted/30">
          {midia.tipo === 'imagem' && (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Diminuir zoom" onClick={() => aplicarZoom(-ZOOM_STEP)}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Aumentar zoom" onClick={() => aplicarZoom(ZOOM_STEP)}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Voltar ao tamanho normal" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 mr-8" onClick={() => downloadFile(midia.url, midia.nome || 'arquivo')}>
            <Download className="h-3.5 w-3.5" /> Baixar
          </Button>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden bg-black/90">
          {midia.tipo === 'imagem' ? (
            <img
              src={midia.url}
              alt={midia.nome || 'imagem'}
              draggable={false}
              onMouseDown={aoPressionar}
              onMouseMove={aoMover}
              onMouseUp={soltar}
              onMouseLeave={soltar}
              onDoubleClick={() => (zoom === 1 ? aplicarZoom(1) : (setZoom(1), setPan({ x: 0, y: 0 })))}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? 'grab' : 'default' }}
              className="max-h-[80vh] max-w-full object-contain select-none transition-transform"
            />
          ) : (
            <video src={midia.url} controls autoPlay className="max-h-[80vh] max-w-full" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
