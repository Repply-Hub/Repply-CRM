-- ============================================================================
-- Drive de catálogos por fabricante
-- ============================================================================
--
-- Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md
-- Plano:   docs/superpowers/plans/2026-08-26-drive-de-catalogos.md
--
-- Substitui o módulo de catálogo de produtos, removido em 26/08/2026 (commit acbcb415).
-- O que a representação precisa não é cadastrar produto a produto — é ter o PDF da fábrica à
-- mão e conseguir mandá-lo ao cliente.
-- ============================================================================

create table public.fabricante_arquivos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id)    on delete cascade,
  fabricante_id uuid not null references public.fabricantes(id) on delete cascade,

  nome          text   not null,
  caminho       text   not null unique,

  -- A capa da 1ª página, só para PDF. NULA não é erro: PDF protegido por senha ou arquivo
  -- estranho cai no ícone do formato, e o anexo segue. Travar o anexo por causa da miniatura
  -- seria trocar a funcionalidade pelo enfeite dela.
  capa_caminho  text,

  tamanho       bigint not null,
  mime          text,

  -- 🔴 Ano obrigatório, mês opcional. Fábrica que faz catálogo anual não deve ser obrigada a
  -- inventar um mês; fábrica que faz mensal precisa distinguir as edições. As duas existem.
  edicao_ano    integer not null check (edicao_ano between 2000 and 2100),
  edicao_mes    integer check (edicao_mes between 1 and 12),

  -- 🔴 `usuarios(id)`, NÃO `auth.users(id)`. As colunas "quem fez" deste banco se dividem
  -- entre os dois, e não dá para saber qual pelo nome: `historico_contatos.usuario_id` quer
  -- este, `configuracoes_automacao.updated_by` quer o outro. Mandar o errado faz a gravação
  -- inteira ser recusada pela chave estrangeira, em silêncio. Ver CLAUDE.md §4.5.
  enviado_por   uuid references public.usuarios(id),

  created_at    timestamptz not null default now()
);

-- A ordem que a tela usa: edição mais nova primeiro.
--
-- 🔴 `coalesce(edicao_mes, 0)` faz o catálogo do ANO se comportar como se fosse de janeiro,
-- então "set/2026" aparece acima de "2026". Sem isso os dois empatariam e a ordem ficaria à
-- mercê da ordem de chegada — e o representante abriria a fábrica sem saber qual é a edição
-- vigente, que é exatamente o problema que este drive existe para resolver.
create index fabricante_arquivos_ordem
  on public.fabricante_arquivos
     (fabricante_id, edicao_ano desc, coalesce(edicao_mes, 0) desc, created_at desc);

alter table public.fabricante_arquivos enable row level security;

-- ── Ver, anexar e editar: qualquer pessoa da empresa ───────────────────────
--
-- O catálogo é da FÁBRICA, não de quem subiu: um representante anexa a edição de setembro e
-- os treze da equipe usam. Um sobe, todos enviam — é como a fábrica funciona no mundo real,
-- ela manda UM catálogo para a representação. Decisão do Lucas em 26/08/2026.
create policy fabricante_arquivos_select on public.fabricante_arquivos
  for select to authenticated
  using (empresa_id = get_my_empresa_id());

create policy fabricante_arquivos_insert on public.fabricante_arquivos
  for insert to authenticated
  with check (empresa_id = get_my_empresa_id());

create policy fabricante_arquivos_update on public.fabricante_arquivos
  for update to authenticated
  using (empresa_id = get_my_empresa_id())
  with check (empresa_id = get_my_empresa_id());

-- ── Excluir: gestor OU quem tem a permissão ────────────────────────────────
--
-- Mesmo padrão da correção de segurança de `pedidos` (20260824143000). O módulo `fabricantes`
-- já existe em `permissoes_usuario` com a coluna `pode_excluir` — nenhuma permissão nova, e
-- nenhuma tela nova de configuração.
create policy fabricante_arquivos_delete on public.fabricante_arquivos
  for delete to authenticated
  using (
    empresa_id = get_my_empresa_id()
    and (is_gestor() or has_permission(get_my_usuario_id(), 'fabricantes', 'excluir'))
  );

comment on table public.fabricante_arquivos is
  'Catálogos, folders e materiais de cada fabricante. Visível e anexável por toda a empresa; '
  'só gestor ou quem tem permissão de excluir em "fabricantes" apaga. Os arquivos ficam no '
  'balde PRIVADO fabricante-arquivos, alcançados por link temporário assinado.';

-- ── O balde, PRIVADO desde o nascimento ────────────────────────────────────
--
-- 🔴 Os outros 6 baldes deste projeto são ABERTOS: medido em 24/08/2026, qualquer pessoa com o
-- link baixa os 5 GB de anexo de negócio e as 110 imagens de e-mail de clientes da MD, sem
-- login. A outra sessão está fechando isso (docs/operacao/plano-baldes-privados.md).
--
-- Nascer aberto criaria o sétimo buraco justamente enquanto os seis fecham — e com material
-- comercial de representada, que é de terceiro. Custo de nascer certo: zero.
--
-- 52428800 = 50 MB. Abaixo do teto do WhatsApp para documento, de propósito: empatar com ele
-- faria o arquivo subir bonito e falhar SÓ NO ENVIO, na frente do cliente. Ver o desenho §5.2.
insert into storage.buckets (id, name, public, file_size_limit)
values ('fabricante-arquivos', 'fabricante-arquivos', false, 52428800)
on conflict (id) do nothing;

-- ── As políticas do balde ──────────────────────────────────────────────────
--
-- O caminho é `{empresa_id}/{fabricante_id}/{arquivo}`. A PRIMEIRA pasta é o que permite
-- recusar quem é de outra empresa — ela existe por isso, não é organização visual.
--
-- Note a diferença para os baldes antigos, cujas políticas dizem só `authenticated`: ali
-- qualquer pessoa logada, de qualquer empresa, alcança o arquivo de qualquer outra.
create policy "fabricante_arquivos_ler" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fabricante-arquivos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
  );

create policy "fabricante_arquivos_subir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fabricante-arquivos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
  );

create policy "fabricante_arquivos_apagar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fabricante-arquivos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
    and (is_gestor() or has_permission(get_my_usuario_id(), 'fabricantes', 'excluir'))
  );

-- ── Sobra da entrega anterior ──────────────────────────────────────────────
--
-- Apagar `tabela_precos` em 20260826180000 levou o gatilho junto, mas deixou a FUNÇÃO dele
-- órfã no banco. Conferido em 26/08/2026: nenhum gatilho a usa.
drop function if exists public.tabela_precos_preenche_empresa();
