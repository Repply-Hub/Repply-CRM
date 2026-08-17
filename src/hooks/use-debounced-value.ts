import { useEffect, useState } from 'react';

// `useDeferredValue` NÃO é debounce: ele evita travar a digitação, mas ainda dispara um novo
// valor (e portanto uma nova busca) a cada tecla, só em prioridade mais baixa. Isso é usado por
// buscas que disparam requisição ao servidor a cada mudança (ex.: filtro de negócios), onde
// cada tecla digitada custa uma query — aqui sim precisamos represar o valor por `delayMs` sem
// nenhuma tecla nova antes de propagar.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
