-- Recriar views sem SECURITY DEFINER (usando security_invoker para respeitar RLS do usuário)

ALTER VIEW public.vw_indicadores_usuario SET (security_invoker = true);
ALTER VIEW public.vw_indicadores_vendedor SET (security_invoker = true);
ALTER VIEW public.vw_faturamento_mensal SET (security_invoker = true);
ALTER VIEW public.vw_velocidade_por_fabricante SET (security_invoker = true);
ALTER VIEW public.vw_pedidos_inativos SET (security_invoker = true);