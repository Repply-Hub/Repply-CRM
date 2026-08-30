# Permissões e segurança de acesso

Como o Repply CRM decide quem pode ver e fazer o quê.

> **Substitui `docs/auth-structure.md`**, que descrevia a tabela `vendedores` e um modelo
> de vínculo por texto livre. Aquele documento ficou factualmente errado quando a tabela
> foi renomeada para `usuarios` em abril de 2026, e foi removido para não ensinar errado.

---

## 1. A regra que governa tudo

**A autorização real é a segurança por linha (RLS) do Postgres, não a tela.**

Esconder um botão, sumir com um item de menu ou checar um `if` no React **não protege
nada** — qualquer pessoa com a chave pública do app (que vai dentro do JavaScript e é
pública por natureza) consegue falar direto com o banco. O que protege é a política
escrita na tabela.

Consequência prática ao escrever código:

- Verificação no frontend serve para **experiência de uso** (não mostrar o que a pessoa
  não pode usar), nunca para segurança.
- Tabela nova sem RLS habilitada e sem política escrita **é um vazamento**, não um item
  de melhoria futura.
- Ao testar uma mudança de permissão, teste **logado como vendedor comum**. Como gestor,
  quase tudo passa.

---

## 2. As três camadas

```
1. Autenticação          Supabase Auth diz QUEM é (auth.uid())
        |
        v
2. Papel + empresa       a linha em `usuarios` diz o PAPEL e a EMPRESA
        |
        v
3. Política por tabela    a RLS decide LINHA A LINHA o que essa pessoa alcança
```

Somam-se a isso duas camadas de produto que **não são segurança de banco**, mas afetam o
acesso:

- **Permissões por módulo** (`permissoes_usuario`) — configuráveis pelo gestor
- **Portão de plano** — se a assinatura não está em dia, a escrita é bloqueada

---

## 3. Os papéis

São **quatro**, guardados em `usuarios.role`:

| Papel | Quem é | O que alcança |
|---|---|---|
| `admin` | Super-admin da Repply | Todas as empresas. Tem rotas próprias em `/admin/*` e **não** acessa o pipeline comercial de ninguém |
| `empresa` | Quem criou a conta da empresa assinante — o titular | A própria empresa inteira |
| `gestor` | Membro promovido a gerente | A própria empresa inteira |
| `vendedor` | Membro comum da equipe | O que as permissões dele liberarem |

### A pegadinha do nome

```sql
CREATE OR REPLACE FUNCTION public.is_gestor()
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.usuarios
  WHERE user_id = auth.uid() AND role IN ('gestor', 'admin', 'empresa')
); $$;
```

> ⚠️ **`is_gestor()` não significa "tem o papel gestor".** Significa **"responde pela
> empresa"** — e vale para `gestor`, `admin` e `empresa`. Quem lê a função pelo nome
> interpreta errado, e as políticas dependem dela.

---

## 4. As funções auxiliares

Todas são `STABLE SECURITY DEFINER` com `search_path` fixo em `public`.

| Função | Devolve |
|---|---|
| `get_my_usuario_id()` | O `id` em `usuarios` de quem está logado |
| `get_my_empresa_id()` | O `empresa_id` de quem está logado |
| `is_admin()` | Verdadeiro só para o super-admin da Repply |
| `is_gestor()` | Verdadeiro para quem responde pela empresa (ver acima) |
| `usuario_in_my_empresa(_usuario_id)` | Se aquele usuário é da mesma empresa que a minha |
| `has_permission(_usuario_id, _modulo, _acao)` | Se a permissão de módulo libera aquela ação |
| `has_funcionalidade(_usuario_id, _modulo, _funcionalidade)` | Se a funcionalidade específica está liberada |
| `empresa_plano_ativo()` | Se a assinatura da empresa permite escrever |
| `can_access_wa_conversa(...)` | Se a pessoa alcança aquela conversa de WhatsApp |
| `is_member_of_grupo(_grupo_id)` | Se a pessoa é membro daquele grupo do chat |

### Apelidos legados — ainda vivos

`get_my_vendedor_id()` e `vendedor_in_my_empresa()` continuam existindo e **ainda são
usados por políticas antigas**. Código novo usa os equivalentes com `usuario`.

> **Não remova os apelidos** sem varrer todas as políticas. Remover uma função usada por
> política derruba o acesso da tabela inteira, e o sintoma aparece como "sumiu tudo".

---

## 5. Permissões por módulo

Configuradas pelo gestor em **Configurações → Usuários**, gravadas em
`permissoes_usuario`.

**Estrutura de cada linha:** `usuario_id` + `modulo` + `pode_ver` / `pode_criar` /
`pode_editar` / `pode_excluir` + `funcionalidades` (um objeto com as opções extras).

### Os 14 módulos

`dashboard` · `pipeline` · `clientes` · `contatos` · `pedidos` · `obras` · `fabricantes` ·
`portal` · `calendario` · `tarefas` · `chat` · `whatsapp` · `emails` · `configuracoes`

A descrição de cada um, e a lista de funcionalidades extras (importar, exportar, mover
card, enviar WhatsApp, gerar PDF, filtrar por vendedor, gerenciar grupo…), está em
`src/hooks/use-permissoes.ts`, na constante `MODULOS`. **É essa constante que desenha a
tela de permissões** — acrescentar módulo lá muda a interface.

### Os padrões quando não há linha configurada

| Ação | Sem linha em `permissoes_usuario` |
|---|---|
| `ver` | **libera** |
| `criar` | bloqueia |
| `editar` | bloqueia |
| `excluir` | bloqueia |

Ou seja: **usuário novo enxerga tudo e não altera nada** até o gestor configurar. E quem
tem papel `gestor` passa direto por `has_permission`, sem consultar a tabela.

### Presets e auditoria

- `permissao_presets` e `perfis_customizados` — conjuntos prontos, para não configurar
  módulo por módulo a cada pessoa nova. Montados por `montar_permissoes_preset_padrao()`
- `audit_permissoes` — registro de quem mudou permissão de quem, e quando

---

## 6. Portão de plano

Camada independente das permissões: mesmo com toda permissão do mundo, se a assinatura da
empresa não está em dia, **a escrita é bloqueada no banco** e a tela leva para `/assinar`.

- Estado da assinatura: `empresa_assinaturas` (ligada à empresa, não ao usuário)
- Regra no frontend, num lugar só: `src/lib/plano-gate.ts`
- Regra no banco: `empresa_plano_ativo()`, usada nas políticas de escrita

A lógica é uma **lista fechada de situações que bloqueiam** — qualquer outro valor libera.
A justificativa dessa escolha (e por que o contrário seria pior) está em
[`SPEC.md` §10.2](../../SPEC.md).

`admin` não cai no paywall.

---

## 7. Entrada de usuário novo

1. O titular cria a conta da empresa. Um gatilho no cadastro cria as linhas em `empresas`
   e `usuarios` a partir dos dados informados.
2. O sistema gera um **código de acesso** da empresa.
3. O funcionário se cadastra informando esse código. `validar_codigo_empresa(p_codigo)`
   confere, e ele entra como `vendedor` naquela empresa.
4. O gestor ajusta as permissões dele.

Exclusão de usuário é **reversível**: marca `deleted_at` em vez de apagar a linha.
`ProtectedRoute` trata esse estado, e `restaurar_usuario_por_email(...)` desfaz.

---

## 8. Estados que o `ProtectedRoute` trata

`src/App.tsx` + `src/hooks/use-auth.tsx`. São mais do que "logado" e "deslogado":

| Estado | O que acontece |
|---|---|
| Sem sessão | Vai para o login |
| Sessão, perfil ainda carregando | Espera — **não** assuma que já pode usar o app |
| Sessão, perfil marcado como excluído (`deleted_at`) | Bloqueia |
| Sessão órfã: existe sessão, mas a linha de perfil sumiu | **Sai automaticamente** |
| Perfil sem `empresa_id` | Trata como caso à parte |
| Assinatura fora do ar | Manda para `/assinar` |

> **Nunca assuma que ter sessão significa que o app está usável.** Confira
> `profileLoaded` / `profileAttempted`.

---

## 9. O que falta: controle de seção por empresa

Hoje existe `sidebar_empresa_padrao`, que define o **layout do menu** de cada empresa.
Isso é **cosmético**: esconde o item da barra lateral e não bloqueia rota nem dado. Quem
digitar o endereço entra.

O produto precisa de um controle real, com política no banco, para que empresas
assinantes não tenham acesso ao **Portal de Consultas** — que é exclusividade da MD
Representações. É fase própria no roadmap: [`SPEC.md` §9](../../SPEC.md), Fase 2.

---

## 10. Checklist ao criar tabela nova

- [ ] Criada por **migration**, nunca pelo painel do Supabase
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` no mesmo arquivo
- [ ] Política de `SELECT` escrita, escopada por `empresa_id = get_my_empresa_id()`
- [ ] Políticas de `INSERT` / `UPDATE` / `DELETE` escritas
- [ ] Se a tabela guarda dado de terceiro (token, chave, retorno de API bruto): **não
      guarde credencial**. Foi assim que a chave do WhatsApp vazou — ver
      [`docs/divida-tecnica.md`](../divida-tecnica.md)
- [ ] Testado logado como `vendedor` comum, não só como gestor
- [ ] **A tabela entra no cerco do bloqueio por falta de pagamento?**

      Se ela guarda dado do cliente, **sim — e você não precisa escrever nada**. A rotina
      `gate-de-plano-conferencia-diaria` roda todo dia às 3h50, percorre as tabelas e cria as
      políticas restritivas que faltam (`public.aplicar_gate_de_plano()`). E o teste
      `src/test/gate-de-plano.test.ts` avisa antes disso, no build.

      🔴 **O que a rotina NÃO faz por você: ligar a RLS.** Ela só alcança tabela que já tem
      RLS habilitada — tabela sem RLS fica invisível para o cerco *e* sem isolamento entre
      empresas. É o segundo item deste checklist, e é o que sustenta este último.

      Se a tabela **não** deve entrar (log, catálogo compartilhado entre empresas,
      preferência de tela, dado ligado ao login), acrescente o nome em **um lugar só**:
      `public.tabelas_fora_do_gate()`. O teste lê a lista de lá — não existe segunda cópia
      para manter em dia, de propósito.

      > O cerco nasceu em 03/08/2026 cobrindo 5 tabelas. Em 27/08 alguém o copiou à mão para
      > uma tabela nova e a cópia saiu pela metade — só `INSERT`, sem `UPDATE`. Quatro semanas
      > depois de existir. É por isso que hoje é rotina, e não item de lista para lembrar.
