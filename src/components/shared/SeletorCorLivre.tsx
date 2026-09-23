import { useRef, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Seletor de cor livre — popover no design system do app ──────────────────
//
// Antes disparava o `<input type="color">` nativo: tecnicamente já era "o
// seletor do sistema", só que cada navegador desenha essa janela do seu
// jeito (no Chrome/Linux sai um popup escuro estilo Google Material, sem
// nada a ver com o resto do app) — e isso o site não tem como estilizar, é UI
// do navegador, fora do DOM da página. A primeira versão desta troca virou só
// um campo de hex — mas nem todo usuário sabe de cabeça o código da cor que
// quer. Esta versão tem a área de saturação/brilho + barra de matiz
// arrastáveis, do mesmo jeito que o seletor nativo (ver print do pedido), só
// que desenhado com as cores/bordas do próprio app. O campo de hex continua
// embaixo, mas como atalho OPCIONAL pra quem já sabe o código — não como
// única forma de escolher.

const HEX_REGEX = /^#[0-9a-f]{6}$/i;

function hexParaHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (((g - b) / d) % 6) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  const v = max;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v };
}

function hsvParaHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const paraHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${paraHex(r)}${paraHex(g)}${paraHex(b)}`;
}

const HSV_PADRAO = hexParaHsv('#888888');

export function SeletorCorLivre({
  hexAtual,
  onEscolher,
  disabled,
}: {
  hexAtual: string | null;
  onEscolher: (hex: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [{ h, s, v }, setHsv] = useState(() => (hexAtual ? hexParaHsv(hexAtual) : HSV_PADRAO));
  const [textoHex, setTextoHex] = useState(hexAtual ?? '#888888');
  const areaRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const arrastando = useRef<'area' | 'hue' | null>(null);

  // Sincroniza a cor de trabalho com a cor de verdade toda vez que o popover
  // abre — sem isto, reabrir mostraria o rascunho da última vez em vez do
  // valor salvo.
  useEffect(() => {
    if (!open) return;
    setHsv(hexAtual ? hexParaHsv(hexAtual) : HSV_PADRAO);
    setTextoHex(hexAtual ?? '#888888');
  }, [open, hexAtual]);

  function aplicar(novo: { h: number; s: number; v: number }) {
    setHsv(novo);
    const hex = hsvParaHex(novo.h, novo.s, novo.v);
    setTextoHex(hex);
    onEscolher(hex);
  }

  function moverArea(clientX: number, clientY: number) {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    aplicar({ h, s: x / rect.width, v: 1 - y / rect.height });
  }

  function moverHue(clientX: number) {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    aplicar({ h: (x / rect.width) * 360, s, v });
  }

  // Um único listener no window, ligado enquanto o popover está aberto —
  // arrastar o dedo/mouse pra fora da área pequena do popover não pode
  // interromper o gesto, senão soltar fora do quadrado "trava" a cor no meio
  // do arraste.
  useEffect(() => {
    if (!open) return;
    function onMove(e: PointerEvent) {
      if (arrastando.current === 'area') moverArea(e.clientX, e.clientY);
      else if (arrastando.current === 'hue') moverHue(e.clientX);
    }
    function onUp() { arrastando.current = null; }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, h, s, v]);

  function mudarTextoHex(valor: string) {
    setTextoHex(valor);
    if (HEX_REGEX.test(valor)) {
      const novo = hexParaHsv(valor);
      setHsv(novo);
      onEscolher(valor.toLowerCase());
    }
  }

  const hexPrevia = hsvParaHex(h, s, v);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={hexAtual ? `Cor livre: ${hexAtual}` : 'Escolher outra cor'}
          disabled={disabled}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full border-2 text-muted-foreground transition-transform hover:scale-110 hover:text-foreground',
            hexAtual ? 'border-foreground' : 'border-dashed border-muted-foreground/40',
          )}
          style={hexAtual ? { backgroundColor: hexAtual } : undefined}
        >
          {!hexAtual && <Plus className="h-3 w-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Cor livre</p>

        {/* Saturação (horizontal) × brilho (vertical). Duas camadas de
            gradiente sobre a cor cheia do matiz atual — branco→transparente
            da esquerda, preto→transparente de baixo — é o truque padrão pra
            desenhar um seletor HSV sem canvas. */}
        <div
          ref={areaRef}
          className="relative h-32 w-full touch-none rounded-md"
          style={{
            backgroundColor: `hsl(${h}, 100%, 50%)`,
            backgroundImage:
              'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
          }}
          onPointerDown={(e) => {
            if (disabled) return;
            arrastando.current = 'area';
            moverArea(e.clientX, e.clientY);
          }}
        >
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
            style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, backgroundColor: hexPrevia }}
          />
        </div>

        {/* Barra de matiz (0–360°). */}
        <div
          ref={hueRef}
          className="relative mt-2 h-3 w-full touch-none rounded-full"
          style={{
            backgroundImage:
              'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
          onPointerDown={(e) => {
            if (disabled) return;
            arrastando.current = 'hue';
            moverHue(e.clientX);
          }}
        >
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
            style={{ left: `${(h / 360) * 100}%`, backgroundColor: `hsl(${h}, 100%, 50%)` }}
          />
        </div>

        {/* Hex como atalho opcional — quem já sabe o código digita direto;
            quem não sabe usa só a área acima. */}
        <div className="mt-3 flex items-center gap-2">
          <span
            className="h-8 w-8 shrink-0 rounded-md border border-border"
            style={{ backgroundColor: hexPrevia }}
          />
          <Input
            value={textoHex}
            onChange={(e) => mudarTextoHex(e.target.value)}
            placeholder="#3b82f6"
            maxLength={7}
            disabled={disabled}
            className="h-8 font-mono text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
