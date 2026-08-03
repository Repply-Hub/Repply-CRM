import { useCallback, useRef, useState } from 'react';

/** Lógica de arraste compartilhada entre ResizableTh e SortableTh (que também precisa da alça
 *  de redimensionamento quando usada nas tabelas de Clientes/Obras). */
export function useColumnResize(width: number | undefined, onResize: (width: number) => void, minWidth = 60) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; width: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.closest('th');
    const currentWidth = width ?? th?.getBoundingClientRect().width ?? 150;
    startRef.current = { x: e.clientX, width: currentWidth };
    setDragging(true);

    const handleMove = (moveEvent: PointerEvent) => {
      if (!startRef.current) return;
      const delta = moveEvent.clientX - startRef.current.x;
      onResize(Math.max(minWidth, startRef.current.width + delta));
    };
    const handleUp = () => {
      setDragging(false);
      startRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [onResize, minWidth, width]);

  return { dragging, handlePointerDown };
}
