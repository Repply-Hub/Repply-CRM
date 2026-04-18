UPDATE public.obras o
SET endereco_entrega = NULL,
    latitude = NULL,
    longitude = NULL,
    geocoded_at = NULL
FROM public.clientes c
WHERE o.cliente_id = c.id
  AND o.endereco_entrega IS NOT NULL
  AND o.endereco_entrega = c.endereco;