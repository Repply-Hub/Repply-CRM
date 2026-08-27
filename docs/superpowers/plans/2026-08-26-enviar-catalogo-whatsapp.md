# Enviar catálogo por WhatsApp, com as travas contra banimento — plano

> **Para quem for executar:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos usam `- [ ]` para acompanhamento.

**Objetivo:** o representante escolhe um contato do CRM e manda o catálogo direto no WhatsApp
dele, **sem** conseguir derrubar o número da empresa por repetição.

**Arquitetura:** o front **não decide nada** sobre limite. Uma função de banco resolve de qual
número o envio sai, confere as três travas, e **reserva a vaga na mesma transação**. Só então
o front chama a função de servidor que já existe (`whatsapp-send`). Se o envio falhar, a vaga
é devolvida.

**Entrega 3 de 3.** Desenho: `docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md` §7 e §8.
Entrega 1: `acbcb415`. Entrega 2: `d38d353b`.

---

## Restrições globais

- **PT-BR** em interface, documentação, comentário e commit.
- **Verificação**, critério é *não subir*: `npx tsc --noEmit -p tsconfig.app.json` (**35**) ·
  `npm run test` (**237** + os novos) · `npm run build` · `npx eslint .` (**456**).
- 🔴 `npx tsc --noEmit` **sem** `-p` não confere nada e devolve sucesso.
- 🔴 **Nunca `git add -A`.** O `deno.lock` não é desta entrega.
- 🔴 **Autorização por commit**, e `git push` **publica**. Verificação antes do "pode".
- 🔴 **Nada no banco sem autorização explícita.**

### Os números das travas, decididos pelo Lucas

| trava | valor | do que protege |
|---|---|---|
| por **pessoa** | 10/hora, 40/dia | abuso individual |
| por **número** (`instancia_id`) | 40/hora, 150/dia | **o banimento — é a que protege o ativo** |
| mesmo arquivo + mesmo contato | 10 minutos | clique duplo e "será que foi?" |

🔴 **Por que dois tetos.** Medido em 26/08/2026: a MD tem **2 números para 13 pessoas** — um
deles com 13 ligadas. Teto só por pessoa daria 130 disparos de um único aparelho numa hora, e
quem o WhatsApp bane é o aparelho, não a pessoa.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `supabase/migrations/2026XXXX_envio_de_catalogo.sql` | **criar** — tabela de envios, RLS, e as duas funções de reserva |
| `src/lib/recusa-de-envio.ts` | **criar** — as mensagens de recusa, funções puras |
| `src/lib/recusa-de-envio.test.ts` | **criar** — os testes delas |
| `src/hooks/use-enviar-catalogo.ts` | **criar** — reservar → enviar → confirmar ou devolver |
| `src/components/fabricantes/EnviarCatalogoDialog.tsx` | **criar** — a busca de contato |
| `src/components/fabricantes/CartaoDeArquivo.tsx` | modificar — ganha o botão de WhatsApp |
| `src/components/fabricantes/DriveDaFabrica.tsx` | modificar — abre o diálogo |

---

## Tarefa 1: a tabela e as funções de reserva

**Arquivos:**
- Criar: `supabase/migrations/2026XXXXXXXXXX_envio_de_catalogo.sql`

**Interfaces:**
- Produz: `reservar_envio_de_catalogo(p_arquivo_id, p_contato_id, p_telefone)` e
  `liberar_envio_de_catalogo(p_envio_id)`. A Tarefa 3 usa.

🔴 **A decisão que define esta tarefa: a contagem é feita e recusada NO BANCO.**

Desabilitar o botão resolve o clique duplo do usuário honesto e **não resolve nada** para quem
abre o console do navegador. É a regra nº 1 do `CLAUDE.md`: esconder botão não protege.

🔴 **E a função resolve o número sozinha, a partir de `auth.uid()`.** Se o front informasse de
qual instância o envio sai, bastaria mentir esse campo para zerar a contagem do número — que é
justamente a trava que protege o ativo.

- [ ] **Passo 1: escrever a migration**

```sql
-- ============================================================================
-- Envio de catálogo por WhatsApp, e as travas contra banimento
-- ============================================================================
-- Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md §7 e §8.
--
-- A conexão com o WhatsApp é por API NÃO OFICIAL. Número que dispara muito arquivo em pouco
-- tempo é derrubado, e perder o número é perder operação — não funcionalidade.
--
-- Medido em 26/08/2026: a MD tem 2 números para 13 pessoas, um deles com 13 ligadas. Por isso
-- há DOIS tetos, e o que importa é o do número.
-- ============================================================================

create table public.fabricante_arquivo_envios (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  arquivo_id    uuid not null references public.fabricante_arquivos(id) on delete cascade,
  -- Aceita nulo só para o caso de o contato ser excluído depois: não existe caminho de envio
  -- sem escolher contato.
  contato_id    uuid references public.contatos(id) on delete set null,
  telefone      text not null,
  -- 🔴 De qual NÚMERO saiu. É esta coluna que a trava do banimento conta.
  instancia_id  uuid not null references public.configuracoes_wapi(id) on delete cascade,
  usuario_id    uuid not null references public.usuarios(id),
  enviado_em    timestamptz not null default now()
);

-- Sem estes índices a contagem vira varredura da tabela a cada clique.
create index fabricante_envios_por_numero  on public.fabricante_arquivo_envios (instancia_id, enviado_em desc);
create index fabricante_envios_por_pessoa  on public.fabricante_arquivo_envios (usuario_id, enviado_em desc);
create index fabricante_envios_repeticao   on public.fabricante_arquivo_envios (arquivo_id, contato_id, enviado_em desc);

alter table public.fabricante_arquivo_envios enable row level security;

-- Ler: a empresa inteira. O registro também é funcionalidade — é o que permite o cartão dizer
-- "enviado para 12 clientes" e saber quem já recebeu a edição de setembro.
create policy fabricante_envios_select on public.fabricante_arquivo_envios
  for select to authenticated using (empresa_id = get_my_empresa_id());

-- 🔴 NENHUMA política de INSERT, UPDATE ou DELETE para quem está logado.
--
-- A escrita passa SÓ pelas funções abaixo, que são SECURITY DEFINER. Se houvesse política de
-- insert, bastaria gravar linhas falsas — ou não gravar nenhuma — para a contagem deixar de
-- valer. A ausência de política aqui É a trava.

comment on table public.fabricante_arquivo_envios is
  'Cada envio de catálogo por WhatsApp. É o mecanismo das travas contra banimento (contagem '
  'por número e por pessoa) e, de quebra, o histórico de quem já recebeu cada edição. '
  'Escrita SÓ por reservar_envio_de_catalogo / liberar_envio_de_catalogo.';

-- ── Reservar a vaga ────────────────────────────────────────────────────────
--
-- Devolve uma linha em vez de lançar erro, de propósito: quem chama precisa do HORÁRIO em que
-- libera para montar a mensagem. Aviso sem horário é o que faz a pessoa continuar clicando.
create or replace function public.reservar_envio_de_catalogo(
  p_arquivo_id uuid,
  p_contato_id uuid,
  p_telefone   text
)
returns table (
  ok         boolean,
  motivo     text,      -- 'repeticao' | 'teto_pessoa_hora' | 'teto_pessoa_dia' |
                        -- 'teto_numero_hora' | 'teto_numero_dia' | 'sem_instancia'
  libera_em  timestamptz,
  envio_id   uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id   uuid := get_my_usuario_id();
  v_empresa_id   uuid := get_my_empresa_id();
  v_instancia_id uuid;
  v_marco        timestamptz;
  v_novo_id      uuid;
begin
  if v_usuario_id is null or v_empresa_id is null then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- O arquivo tem que ser da empresa de quem pede. Sem isto, alguém de outra empresa mandaria
  -- o catálogo alheio informando o id.
  if not exists (
    select 1 from fabricante_arquivos a
     where a.id = p_arquivo_id and a.empresa_id = v_empresa_id
  ) then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- 🔴 O NÚMERO É RESOLVIDO AQUI, a partir de quem está logado — nunca informado por quem
  -- chama. Se viesse de fora, bastaria mentir o campo para zerar a contagem do número.
  select iu.instancia_id into v_instancia_id
    from wapi_instancia_usuarios iu
   where iu.usuario_auth_id = auth.uid()
   limit 1;

  if v_instancia_id is null then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- ── Trava 1: mesmo arquivo, mesmo contato, 10 minutos ────────────────────
  select max(e.enviado_em) + interval '10 minutes' into v_marco
    from fabricante_arquivo_envios e
   where e.arquivo_id = p_arquivo_id
     and e.contato_id is not distinct from p_contato_id
     and e.enviado_em > now() - interval '10 minutes';
  if v_marco is not null then
    return query select false, 'repeticao'::text, v_marco, null::uuid; return;
  end if;

  -- ── Trava 2: a pessoa ────────────────────────────────────────────────────
  select min(e.enviado_em) + interval '1 hour' into v_marco
    from (
      select enviado_em from fabricante_arquivo_envios
       where usuario_id = v_usuario_id and enviado_em > now() - interval '1 hour'
    ) e having count(*) >= 10;
  if v_marco is not null then
    return query select false, 'teto_pessoa_hora'::text, v_marco, null::uuid; return;
  end if;

  if (select count(*) from fabricante_arquivo_envios
       where usuario_id = v_usuario_id and enviado_em > now() - interval '1 day') >= 40 then
    return query select false, 'teto_pessoa_dia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- ── Trava 3: o NÚMERO. É esta que protege o ativo ────────────────────────
  select min(e.enviado_em) + interval '1 hour' into v_marco
    from (
      select enviado_em from fabricante_arquivo_envios
       where instancia_id = v_instancia_id and enviado_em > now() - interval '1 hour'
    ) e having count(*) >= 40;
  if v_marco is not null then
    return query select false, 'teto_numero_hora'::text, v_marco, null::uuid; return;
  end if;

  if (select count(*) from fabricante_arquivo_envios
       where instancia_id = v_instancia_id and enviado_em > now() - interval '1 day') >= 150 then
    return query select false, 'teto_numero_dia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- Passou: reserva a vaga NA MESMA transação da conferência. Conferir e gravar em chamadas
  -- separadas deixaria a brecha de dois cliques simultâneos passarem pela mesma contagem.
  insert into fabricante_arquivo_envios
    (empresa_id, arquivo_id, contato_id, telefone, instancia_id, usuario_id)
  values (v_empresa_id, p_arquivo_id, p_contato_id, p_telefone, v_instancia_id, v_usuario_id)
  returning id into v_novo_id;

  return query select true, null::text, null::timestamptz, v_novo_id;
end;
$$;

revoke all on function public.reservar_envio_de_catalogo(uuid, uuid, text) from public, anon;
grant execute on function public.reservar_envio_de_catalogo(uuid, uuid, text) to authenticated;

-- ── Devolver a vaga quando o envio falha ───────────────────────────────────
--
-- Sem isto, uma queda de rede consumiria uma vaga sem nenhuma mensagem ter saído — e a pessoa
-- bateria no teto sem ter mandado nada, que é o jeito mais rápido de a trava virar reclamação.
create or replace function public.liberar_envio_de_catalogo(p_envio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só a própria pessoa devolve a própria reserva, e só nos primeiros minutos: sem essa
  -- janela, a função viraria um jeito de apagar o histórico de envio de qualquer um.
  delete from fabricante_arquivo_envios
   where id = p_envio_id
     and usuario_id = get_my_usuario_id()
     and enviado_em > now() - interval '5 minutes';
end;
$$;

revoke all on function public.liberar_envio_de_catalogo(uuid) from public, anon;
grant execute on function public.liberar_envio_de_catalogo(uuid) to authenticated;
```

- [ ] **Passo 2: testar em transação desfeita**

Além de criar, **prove que a trava recusa**. Insira 10 envios fictícios para um usuário e
confirme que a 11ª reserva devolve `ok = false` com `motivo = 'teto_pessoa_hora'`.

- [ ] **Passo 3: NÃO aplicar ainda.** Só na Tarefa 6, com autorização.

---

## Tarefa 2: as mensagens de recusa

**Arquivos:**
- Criar: `src/lib/recusa-de-envio.ts`, `src/lib/recusa-de-envio.test.ts`

**Interfaces:**
- Produz: `mensagemDeRecusa(motivo, liberaEm, nomeDoContato)`. A Tarefa 4 usa.

🔴 **A culpa é do WhatsApp, e é dita como tal — sem afirmar número que não é dele.** Escrever
"o limite do WhatsApp é 40 por hora" seria falso, e o primeiro representante que pesquisasse
descobriria, passando a desconfiar de todos os outros avisos do sistema.

🔴 **Toda mensagem diz QUANDO libera.** Aviso sem horário é o que faz a pessoa clicar de novo.

- [ ] **Passo 1: os testes**

```ts
import { describe, it, expect } from 'vitest';
import { mensagemDeRecusa } from './recusa-de-envio';

const AS_15H12 = new Date('2026-08-26T18:12:00Z'); // 15h12 em Brasília

describe('mensagemDeRecusa', () => {
  it('repetição começa pela boa notícia, não pelo bloqueio', () => {
    const m = mensagemDeRecusa('repeticao', AS_15H12, 'João');
    // Quem clica de novo quase sempre só não sabe se foi. A resposta que resolve é "já foi".
    expect(m.titulo).toBe('Já enviado');
    expect(m.texto).toContain('João');
    expect(m.texto).toContain('15:12');
  });

  it('repetição joga a espera no WhatsApp, sem acusar quem clicou', () => {
    const m = mensagemDeRecusa('repeticao', AS_15H12, 'João');
    expect(m.texto).toContain('spam');
    expect(m.texto).not.toContain('você');   // nada de "você já enviou"
  });

  it('teto do número diz que é da EMPRESA, não da pessoa', () => {
    const m = mensagemDeRecusa('teto_numero_hora', AS_15H12, 'João');
    expect(m.texto).toContain('empresa');
    expect(m.texto).toContain('15:12');
    // Quem mandou dois e leva um "você atingiu seu limite" acha que é defeito e insiste.
    expect(m.texto).not.toContain('Você já enviou');
  });

  it('teto da pessoa diz que é dela', () => {
    expect(mensagemDeRecusa('teto_pessoa_hora', AS_15H12, 'João').texto).toContain('Você');
  });

  it('teto do dia não promete horário que não existe', () => {
    const m = mensagemDeRecusa('teto_numero_dia', null, 'João');
    expect(m.texto).toContain('amanhã');
    expect(m.texto).not.toContain('null');
    expect(m.texto).not.toContain('Invalid');
  });

  it('sem WhatsApp vinculado explica o que fazer', () => {
    expect(mensagemDeRecusa('sem_instancia', null, 'João').texto).toContain('gestor');
  });

  it('nenhuma mensagem afirma um número como sendo limite do WhatsApp', () => {
    const motivos = ['repeticao','teto_pessoa_hora','teto_pessoa_dia','teto_numero_hora','teto_numero_dia'] as const;
    for (const mo of motivos) {
      const t = mensagemDeRecusa(mo, AS_15H12, 'João').texto;
      expect(t).not.toMatch(/limite do WhatsApp é \d/);
    }
  });
});
```

- [ ] **Passo 2: rodar e ver falhar.** Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: escrever, com a redação que o Lucas aprovou**

A da repetição é literalmente esta, e **não é bloqueio: é confirmação**:

> **Já enviado.** O João recebeu este catálogo há 3 minutos, às 15h02.
> Para evitar problemas de spam para o seu número de WhatsApp, dá para mandar de novo às 15h12.

As outras três seguem o mesmo espírito, com a causa no WhatsApp e o horário sempre presente.

- [ ] **Passo 4: rodar e ver passar.** Total do projeto vai de 237 para ~244.

---

## Tarefa 3: o gancho de envio

**Arquivos:**
- Criar: `src/hooks/use-enviar-catalogo.ts`

**Interfaces:**
- Consome: as duas funções de banco (Tarefa 1), `enderecoDoObjeto`, `normalizeWhatsappPhone`.
- Produz: `useEnviarCatalogo()`. A Tarefa 4 usa.

- [ ] **Passo 1: a sequência, nesta ordem**

```
1. normaliza o telefone           normalizeWhatsappPhone — CLAUDE.md §7.1
2. reserva a vaga                 rpc('reservar_envio_de_catalogo')
   -> recusou? devolve o motivo e o horário, e PARA. Nada é enviado.
3. assina o arquivo               enderecoDoObjeto(BALDE, caminho) — 1 hora de validade
4. chama whatsapp-send            tipo 'documento', media_url = o link, nome_arquivo = o nome
5. falhou? devolve a vaga         rpc('liberar_envio_de_catalogo')
```

🔴 **O telefone passa por `normalizeWhatsappPhone`.** Enfiar o nono dígito à força já respondeu
por **100% das falhas de envio** deste sistema, e cliente com fixo que tem WhatsApp existe de
verdade na base da MD. `CLAUDE.md` §7.1.

⚠️ **A reserva vem ANTES da assinatura**, e não o contrário: assinar primeiro gastaria uma
assinatura à toa em toda recusa, e — pior — deixaria um link válido por uma hora circulando
para um envio que não aconteceu.

- [ ] **Passo 2: verificação de quatro pernas**

---

## Tarefa 4: escolher o contato

**Arquivos:**
- Criar: `src/components/fabricantes/EnviarCatalogoDialog.tsx`

- [ ] **Passo 1: a busca**

Busca em `contatos` por nome, empresa e telefone. **Só quem tem telefone** — medido: 942 de
1.092 contatos têm. Mostrar os 150 sem telefone só para dar erro depois é desperdiçar o clique.

A RLS já escopa por empresa; não filtre por empresa no cliente.

Use `<ConteudoDialogo>`, **não** `<DialogContent>` cru — `CLAUDE.md` §7.11.

- [ ] **Passo 2: a recusa aparece como INFORMAÇÃO, não como erro vermelho**

🔴 Vermelho faz a pessoa achar que quebrou — e quem acha que quebrou tenta de novo, que é o
comportamento que a trava existe para evitar.

No caso da repetição, o diálogo mostra também um botão **"Ver na conversa"**, que leva à
conversa daquele contato no WhatsApp do sistema. Se a dúvida é "será que foi?", levar a pessoa
até a mensagem resolve o problema dela; mandá-la esperar dez minutos com a mesma dúvida, não.

- [ ] **Passo 3: verificação de quatro pernas**

---

## Tarefa 5: o botão no cartão

**Arquivos:**
- Modificar: `src/components/fabricantes/CartaoDeArquivo.tsx`, `src/components/fabricantes/DriveDaFabrica.tsx`

- [ ] **Passo 1: o botão de WhatsApp entra ao lado de Ver e Baixar**

Some para quem não tem WhatsApp vinculado — não desabilitado: botão que não faz nada é o
defeito que a aba Automação acabou de perder. Use a mesma consulta que o `whatsapp-send` usa
(`wapi_instancia_usuarios` pelo usuário logado).

- [ ] **Passo 2: enquanto envia, o botão fica ocupado**

Isso resolve o clique duplo do usuário honesto. **Não é a trava** — a trava é a do banco.

- [ ] **Passo 3: verificação de quatro pernas**

---

## Tarefa 6: publicar

🔴 **Ordem: migration ANTES.** Como na entrega 2 e ao contrário da entrega 1 — as funções são
novas, e publicar o código antes colocaria no ar um botão que chama função inexistente.

- [ ] **Passo 1: conferir que ninguém entrou na frente**
- [ ] **Passo 2: aplicar a migration, com autorização explícita**
- [ ] **Passo 3: pedir autorização, commitar, enviar** (o push publica sozinho)
- [ ] **Passo 4: confirmar a publicação** — `gh api .../commits/<sha>/status`, uma verificação

- [ ] **Passo 5: 🔴 provar a trava PELO SERVIDOR, não pela tela**

Testar clicando prova que o botão está desabilitado, não que a regra existe. Chame a função
direto, 11 vezes seguidas, e confirme que a 11ª devolve `ok = false`:

```sql
select * from reservar_envio_de_catalogo('<arquivo>', '<contato>', '5584999999999');
```

⚠️ Faça isso numa transação desfeita, ou apague as linhas de teste depois — senão as vagas
consumidas contam contra o envio real da equipe naquela hora.

---

## Definição de pronto

- [ ] O representante escolhe um contato e o catálogo chega no WhatsApp dele
- [ ] O envio sai do WhatsApp **do próprio representante** e cai na conversa daquele contato
- [ ] Repetir o mesmo catálogo para o mesmo contato mostra **"Já enviado"** com o horário e o
      botão "Ver na conversa" — em tom neutro, não vermelho
- [ ] A 11ª tentativa da mesma pessoa na mesma hora é recusada **pelo banco**
- [ ] A recusa do teto do número diz que é da **empresa**, não da pessoa
- [ ] Nenhuma mensagem afirma um número como sendo "o limite do WhatsApp"
- [ ] Telefone fixo com WhatsApp funciona (o nono dígito não é forçado)
- [ ] Tipos 35, testes ~244, build compila, lint não subiu de 456
