-- ============================================================================
-- Duas colunas de `empresas` que um gestor podia trocar, e não devia.
--
-- 🔴 MEDIDO E REPRODUZIDO EM TRANSAÇÃO REVERTIDA, em 31/08/2026, com o JWT de um gestor de
-- verdade da MD Representações que NÃO é o dono registrado:
--
--     [1] trocar `secao_preset_id` ..... CONSEGUIU
--     [2] gravar `owner_id` = ele mesmo  CONSEGUIU
--     [3] mudar o `id` da empresa ...... recusado
--
-- Achado ao liberar a aba "Empresa" das configurações para o gestor (commit anterior). A
-- liberação NÃO abriu isto: o buraco existe desde 22/07/2026, quando a política
-- `empresas_update` passou a aceitar `is_gestor()`, e é alcançável direto pela API do
-- PostgREST — nunca dependeu de tela nenhuma. Esconder a aba nunca protegeu nada; é a mesma
-- lição do CLAUDE.md §6.1.
--
-- 🔴 POR QUE A POLÍTICA DE RLS NÃO RESOLVE. Quando o `WITH CHECK` é omitido, o Postgres
-- reaproveita o `USING` como verificação da linha nova — é por isso que o caso [3] já era
-- recusado. Ou seja, o que falta não é checagem de LINHA, é limite de COLUNA, e RLS não
-- distingue coluna. O jeito de fazer isso no Postgres é gatilho, que é o que este arquivo faz.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE CADA UMA DAS DUAS VALE
--
-- `secao_preset_id` decide QUAIS SEÇÕES a empresa tem — quais módulos do produto estão
-- ligados para ela. Não é preferência de tela: a RLS de várias tabelas pergunta
-- `empresa_tem_secao(...)` antes de liberar leitura. O caso mais caro é o Portal, cujas
-- tabelas de licenças (`licencas_natal`, `licencas_idema`, `licencas_extremoz`) abrem dado
-- real com base nisso. Um gestor apontava o preset para outro e ligava, sozinho, um módulo
-- que a Repply não vendeu. E como `empresas` está de propósito FORA do gate de plano (para o
-- cliente bloqueado ainda conseguir nos pagar), isso funcionava até com a conta bloqueada por
-- falta de pagamento.
--
-- `owner_id` é o dono registrado da conta. Nada no sistema o grava depois do cadastro —
-- conferido: das funções do banco, só `admin_definir_preset_da_empresa` e
-- `set_whatsapp_assinar_remetente_global` dão UPDATE em `empresas`, e as duas são admin; e
-- `handle_new_user` grava no INSERT, que este gatilho nem enxerga. Ele é lido pelo Stripe
-- (`stripe-checkout`, `stripe-portal`) e por `podeGerenciarAssinatura`.
--
-- ⚠️ O QUE ESTE ARQUIVO NÃO TRANCA, de propósito:
--   · `codigo_acesso` — o gestor regenera pela aba Usuários, e a política de 22/07/2026 foi
--     criada exatamente para isso. Trancar aqui quebraria uma funcionalidade viva.
--   · `nome`, `nome_fantasia`, `cnpj`, `logo_url`, `banner_url`, `cor_primaria`,
--     `subtitulo_header` — dado cadastral e de marca. É o que a aba "Empresa" edita.
--   · `whatsapp_assinar_remetente` — a RPC `set_whatsapp_assinar_remetente_global` é
--     admin-only e escreve em TODAS as empresas, então um gestor gravando na coluna direto
--     escapa daquela intenção. Ficou de fora porque é decisão de PRODUTO (quem controla essa
--     preferência), não de segurança: nada além do tom das mensagens depende dela. Anotado
--     para o Lucas decidir.
-- ============================================================================

create or replace function public.impedir_escalacao_na_empresa()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Mesma saída antecipada dos gatilhos irmãos de `usuarios`
  -- (`20260824210000_fecha_escrita_anonima_e_escalacao_de_cargo.sql`), e pelo mesmo motivo:
  -- sem sessão é cadastro de conta, importação ou função de borda rodando como serviço.
  -- Tirar isto daqui derrubaria caminhos que não têm usuário para checar.
  if auth.uid() is null then
    return new;
  end if;

  -- O operador da plataforma continua podendo tudo — é ele quem vende as seções e quem
  -- corrige um dono cadastrado errado.
  if public.is_admin() then
    return new;
  end if;

  if new.secao_preset_id is distinct from old.secao_preset_id then
    raise exception 'Só o administrador da plataforma pode mudar quais seções a empresa tem.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'Só o administrador da plataforma pode mudar o dono registrado da empresa.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.impedir_escalacao_na_empresa() is
  'Recusa, para quem nao e admin da plataforma, mudanca em empresas.secao_preset_id (quais '
  'modulos a empresa tem) e empresas.owner_id (dono registrado). A RLS nao consegue limitar '
  'coluna; por isso e gatilho.';

drop trigger if exists trg_impedir_escalacao_na_empresa on public.empresas;
create trigger trg_impedir_escalacao_na_empresa
  before update on public.empresas
  for each row execute function public.impedir_escalacao_na_empresa();

-- ─────────────────────────────────────────────────────────────────────────────
-- Limpeza: a política de UPDATE duplicada, do papel {public}
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Donos podem atualizar sua própria empresa" USING (auth.uid() = owner_id), criada em
-- `20260326172702`. Ela não acrescenta acesso nenhum: `empresas_update` já tem
-- `owner_id = auth.uid()` como um dos braços, e políticas PERMISSIVE se somam com OU. O que
-- ela acrescenta é confusão — duas regras de UPDATE na mesma tabela, uma delas para o papel
-- {public} (que inclui `anon`), fazem qualquer auditoria futura parar para conferir se o
-- anônimo escreve aqui. Ele não escreve: `auth.uid()` é nulo sem sessão, e nulo não é igual
-- a nada.
drop policy if exists "Donos podem atualizar sua própria empresa" on public.empresas;
