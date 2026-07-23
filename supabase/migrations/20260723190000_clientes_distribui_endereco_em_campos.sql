-- A tabela de Empresas agora exibe o endereço em colunas separadas (Logradouro, Número,
-- Complemento, Bairro, Cidade, UF, CEP) em vez de uma única coluna "Endereço" concatenada.
-- Boa parte dos clientes (cadastro manual antigo, imports) só tem o campo `endereco` (uma
-- linha só) preenchido, com logradouro/numero/etc. nulos — o que deixaria essas colunas
-- vazias na lista. Esta migration replica em SQL o parser `stringToEndereco` de
-- src/lib/cep.ts (mesmo formato: "logradouro, numero, complemento, bairro, cidade - UF, cep")
-- e passa a rodar automaticamente sempre que um endereço chega em uma linha só, seja por
-- insert manual, seja por import.

CREATE OR REPLACE FUNCTION public.parse_endereco_livre(p_endereco TEXT)
RETURNS TABLE (
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT
) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_parts TEXT[];
  v_count INT;
  v_last TEXT;
  v_cidade_uf TEXT;
  v_cidade_uf_match TEXT[];
  v_cep TEXT := '';
  v_logradouro TEXT := '';
  v_numero TEXT := '';
  v_complemento TEXT := '';
  v_bairro TEXT := '';
  v_cidade TEXT := '';
  v_uf TEXT := '';
BEGIN
  IF p_endereco IS NULL OR btrim(p_endereco) = '' THEN
    RETURN QUERY SELECT ''::TEXT, ''::TEXT, ''::TEXT, ''::TEXT, ''::TEXT, ''::TEXT, ''::TEXT;
    RETURN;
  END IF;

  -- Cada segmento separado por vírgula, na mesma ordem gerada por enderecoToString():
  -- logradouro, numero, [complemento,] [bairro,] cidade - UF, cep
  v_parts := ARRAY(SELECT btrim(x) FROM unnest(string_to_array(p_endereco, ',')) AS x);
  v_count := array_length(v_parts, 1);

  v_logradouro := COALESCE(v_parts[1], '');
  v_numero := COALESCE(v_parts[2], '');

  IF v_count >= 5 THEN
    v_complemento := COALESCE(v_parts[3], '');
    v_bairro := COALESCE(v_parts[4], '');
    v_cidade_uf := COALESCE(v_parts[5], '');
    v_cep := COALESCE(v_parts[6], '');
  ELSIF v_count = 4 THEN
    v_bairro := COALESCE(v_parts[3], '');
    v_cidade_uf := COALESCE(v_parts[4], '');
  ELSIF v_count = 3 THEN
    v_cidade_uf := COALESCE(v_parts[3], '');
  ELSE
    v_cidade_uf := '';
  END IF;

  -- Se o último segmento parecer um CEP (8 dígitos, com ou sem traço), reprocessa sem ele.
  v_last := COALESCE(v_parts[v_count], '');
  IF regexp_replace(v_last, '\s', '', 'g') ~ '^\d{5}-?\d{3}$' THEN
    v_cep := v_last;
    IF v_count = 5 THEN
      v_bairro := COALESCE(v_parts[3], '');
      v_cidade_uf := COALESCE(v_parts[4], '');
      v_complemento := '';
    ELSIF v_count >= 6 THEN
      v_complemento := COALESCE(v_parts[3], '');
      v_bairro := COALESCE(v_parts[4], '');
      v_cidade_uf := COALESCE(v_parts[5], '');
    END IF;
  END IF;

  v_cidade_uf_match := regexp_match(v_cidade_uf, '^(.+?)\s*-\s*(.+)$');
  IF v_cidade_uf_match IS NOT NULL THEN
    v_cidade := btrim(v_cidade_uf_match[1]);
    v_uf := btrim(v_cidade_uf_match[2]);
  ELSE
    v_cidade := v_cidade_uf;
    v_uf := '';
  END IF;

  -- CEP sempre formatado como 00000-000, igual ao maskCep() do front.
  v_cep := regexp_replace(v_cep, '\D', '', 'g');
  IF length(v_cep) = 8 THEN
    v_cep := substring(v_cep, 1, 5) || '-' || substring(v_cep, 6, 3);
  END IF;

  RETURN QUERY SELECT v_logradouro, v_numero, v_complemento, v_bairro, v_cidade, v_uf, v_cep;
END; $$;

CREATE OR REPLACE FUNCTION public.clientes_distribui_endereco()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_parsed RECORD;
BEGIN
  -- Só distribui quando o endereço chegou em uma linha só (campos estruturados vazios)
  -- e há algo pra distribuir — nunca sobrescreve campos já preenchidos manualmente.
  IF NEW.endereco IS NOT NULL AND btrim(NEW.endereco) <> ''
     AND COALESCE(NEW.logradouro, '') = ''
     AND COALESCE(NEW.numero, '') = ''
     AND COALESCE(NEW.bairro, '') = ''
     AND COALESCE(NEW.cidade, '') = ''
     AND COALESCE(NEW.uf, '') = ''
     AND COALESCE(NEW.cep, '') = ''
  THEN
    SELECT * INTO v_parsed FROM public.parse_endereco_livre(NEW.endereco);
    NEW.logradouro := NULLIF(v_parsed.logradouro, '');
    NEW.numero := NULLIF(v_parsed.numero, '');
    NEW.complemento := NULLIF(v_parsed.complemento, '');
    NEW.bairro := NULLIF(v_parsed.bairro, '');
    NEW.cidade := NULLIF(v_parsed.cidade, '');
    NEW.uf := NULLIF(v_parsed.uf, '');
    NEW.cep := NULLIF(v_parsed.cep, '');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_clientes_distribui_endereco ON public.clientes;
CREATE TRIGGER trg_clientes_distribui_endereco
  BEFORE INSERT OR UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_distribui_endereco();

-- Backfill: aplica o mesmo parser aos clientes já cadastrados que só têm `endereco` preenchido.
-- Uma subquery LATERAL não pode se correlacionar com a própria tabela alvo do UPDATE
-- (o FROM-clause de um UPDATE é resolvido antes de ser unido ao alvo) — por isso o parse
-- roda numa subquery independente, pré-calculada, e o join com o alvo é feito por id.
UPDATE public.clientes
SET
  logradouro = NULLIF(p.logradouro, ''),
  numero = NULLIF(p.numero, ''),
  complemento = NULLIF(p.complemento, ''),
  bairro = NULLIF(p.bairro, ''),
  cidade = NULLIF(p.cidade, ''),
  uf = NULLIF(p.uf, ''),
  cep = NULLIF(p.cep, '')
FROM (
  SELECT id, (public.parse_endereco_livre(endereco)).*
  FROM public.clientes
  WHERE endereco IS NOT NULL AND btrim(endereco) <> ''
    AND COALESCE(logradouro, '') = ''
    AND COALESCE(numero, '') = ''
    AND COALESCE(bairro, '') = ''
    AND COALESCE(cidade, '') = ''
    AND COALESCE(uf, '') = ''
    AND COALESCE(cep, '') = ''
) p
WHERE public.clientes.id = p.id;
