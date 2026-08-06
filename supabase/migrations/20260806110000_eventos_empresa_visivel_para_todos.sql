-- Eventos do tipo "empresa" devem ser visíveis para todo mundo da MESMA empresa,
-- independente de estarem marcados como participantes/responsáveis (isso é só
-- informativo). A policy anterior (20260805170026_eventos_grupo_participantes.sql)
-- já liberava `tipo_calendario = 'empresa'` para SELECT, mas sem nenhum escopo por
-- empresa — um vazamento cross-tenant que não se manifestava porque o frontend
-- ainda filtrava a query sempre por `user_id = auth.uid()`. Ao remover esse filtro
-- no frontend (para cumprir o pedido de visibilidade livre), a policy precisa
-- passar a exigir também que o organizador do evento (criado_por) seja da mesma
-- empresa de quem está lendo.
drop policy if exists eventos_select on public.eventos;

create policy eventos_select on public.eventos
for select to authenticated
using (
  user_id = auth.uid()
  or public.eventos_mesmo_grupo(grupo_id)
  or (
    tipo_calendario = 'empresa'
    and exists (
      select 1 from public.usuarios u
      where u.user_id = eventos.criado_por
        and u.empresa_id = public.get_my_empresa_id()
    )
  )
);
