-- A importação de Negócios tinha um bug (corrigido em src/lib/import/resolve-entities.ts):
-- a deduplicação de nomes de cliente dentro da mesma planilha usava um Set sobre a string
-- exata em vez da chave normalizada, então cada linha com o mesmo cliente escrito com
-- variação de maiúsculas/minúsculas (ou repetido antes do preload de cache existir)
-- virou uma empresa nova em `clientes`. Esta migration mescla os grupos de clientes
-- duplicados (mesmo `empresa_id` — tenant — e mesmo nome normalizado) em um único
-- registro canônico, reapontando tudo que referencia `clientes.id` para ele.
--
-- Segurança: só mescla grupos onde não há mais de um CNPJ distinto preenchido — se o
-- grupo tiver CNPJs conflitantes, é sinal de que podem ser empresas realmente diferentes
-- que só compartilham o nome, e a mesclagem automática é pulada (fica pra revisão manual).

DO $$
DECLARE
  dup RECORD;
  primary_id uuid;
  dup_id uuid;
BEGIN
  FOR dup IN
    SELECT
      empresa_id,
      lower(btrim(empresa)) AS chave,
      count(*) AS total,
      count(DISTINCT NULLIF(btrim(cnpj), '')) AS cnpjs_distintos
    FROM public.clientes
    WHERE empresa IS NOT NULL AND btrim(empresa) <> ''
    GROUP BY empresa_id, lower(btrim(empresa))
    HAVING count(*) > 1
  LOOP
    IF dup.cnpjs_distintos > 1 THEN
      RAISE NOTICE 'Pulando grupo "%" (empresa_id=%): % CNPJs distintos entre % registros — merge manual necessário',
        dup.chave, dup.empresa_id, dup.cnpjs_distintos, dup.total;
      CONTINUE;
    END IF;

    -- Canônico: o registro mais antigo do grupo (o "original" antes das duplicatas).
    SELECT id INTO primary_id
    FROM public.clientes
    WHERE empresa_id IS NOT DISTINCT FROM dup.empresa_id
      AND lower(btrim(empresa)) = dup.chave
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    FOR dup_id IN
      SELECT id FROM public.clientes
      WHERE empresa_id IS NOT DISTINCT FROM dup.empresa_id
        AND lower(btrim(empresa)) = dup.chave
        AND id <> primary_id
    LOOP
      -- Reaponta todas as tabelas que referenciam clientes.id para o canônico.
      UPDATE public.automation_logs SET cliente_id = primary_id WHERE cliente_id = dup_id;
      UPDATE public.mensagens_whatsapp SET cliente_id = primary_id WHERE cliente_id = dup_id;
      UPDATE public.notificacoes SET cliente_id = primary_id WHERE cliente_id = dup_id;
      UPDATE public.obras SET cliente_id = primary_id WHERE cliente_id = dup_id;
      UPDATE public.pedidos SET cliente_id = primary_id WHERE cliente_id = dup_id;
      UPDATE public.tarefas SET cliente_id = primary_id WHERE cliente_id = dup_id;
      UPDATE public.whatsapp_conversas SET cliente_id = primary_id WHERE cliente_id = dup_id;

      -- Preenche no canônico os campos vazios com dados do duplicado, sem perder informação.
      UPDATE public.clientes p
      SET
        razao_social = COALESCE(p.razao_social, d.razao_social),
        cnpj = COALESCE(p.cnpj, d.cnpj),
        classificacao = COALESCE(p.classificacao, d.classificacao),
        email = COALESCE(p.email, d.email),
        telefone = COALESCE(p.telefone, d.telefone),
        endereco = COALESCE(p.endereco, d.endereco),
        logradouro = COALESCE(p.logradouro, d.logradouro),
        numero = COALESCE(p.numero, d.numero),
        complemento = COALESCE(p.complemento, d.complemento),
        bairro = COALESCE(p.bairro, d.bairro),
        cidade = COALESCE(p.cidade, d.cidade),
        uf = COALESCE(p.uf, d.uf),
        cep = COALESCE(p.cep, d.cep),
        nome_contato = COALESCE(p.nome_contato, d.nome_contato),
        campos_extras = COALESCE(p.campos_extras, '{}'::jsonb) || COALESCE(d.campos_extras, '{}'::jsonb)
      FROM public.clientes d
      WHERE p.id = primary_id AND d.id = dup_id;

      DELETE FROM public.clientes WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;
