# Tela "Hoje": contraste, rosto do responsável e colunas ajustáveis — desenho

**Data:** 14/09/2026
**Pedido:** dono do produto, 14/09/2026, depois de conferir no ar a pauta que encolhe
**Estado:** aprovado na conversa, com rascunho visual

---

## 1. O que foi pedido

Com o print do "Dashboard de oportunidades" da MD como referência de contraste:

1. **Mais contraste entre os elementos** da tela "Hoje", como no dashboard de referência.
2. **O rosto do responsável** na coluna "Responsável" da tabela do time.
3. **Largura das colunas** que caiba tudo, ou que o usuário possa ajustar.
4. **"Abrir negócio" em laranja**, como na pauta.
5. **Pauta vazia com aviso** apontando para a tabela logo abaixo, no mesmo lugar onde a tela diz que a pauta está vazia.
6. **Sons:** tirar o rótulo "Criados pela Repply" — para o usuário, todos foram feitos pela Repply.

Decisões tomadas na conversa, que entram como entrada fixa:

| Pergunta | Decisão |
|---|---|
| Largura das colunas | Cabem por padrão **e** dá para arrastar; o ajuste fica guardado no navegador |
| Onde vai o contraste | Todo o bloco "No geral": cartões de risco, tabela do time e os dois gráficos |
| Texto do aviso | "pedem atenção", não "parados" (ver §3.5) |
| Pendência dos homônimos (§69 da dívida) | Resolvida junto, porque usa o mesmo dado novo |

---

## 2. O que existe hoje

- **Tabela do time** (`src/components/pauta/TabelaDoTime.tsx`): colunas Negócio, Fabricante,
  Etapa, Responsável (só para quem tem a chave `pauta_de_todos`), Valor, Sem mexer há e as ações.
  A tabela tem `min-w-[880px]` dentro de uma caixa que rola na horizontal. O cabeçalho é
  `bg-muted` com texto `text-[11px] uppercase text-muted-foreground`. "Abrir negócio" é botão
  contornado; "Retomar depois", fantasma.
- **A coluna Responsável recebe só o nome.** `negocios_em_risco` e `negocios_em_risco_de`
  devolvem `responsavel text` e nada mais sobre a pessoa. É por isso que `aoRetomarDaTabela`
  (`src/pages/Hoje.tsx`) decide "é meu?" comparando nomes — a pendência §69.
- **Foto com iniciais já existe** em `src/components/pedidos/CampoDeResponsaveis.tsx`, com
  `Avatar`/`AvatarImage`/`AvatarFallback` e uma função `iniciais()` local, não exportada.
- **Estados de pauta vazia** em `src/pages/Hoje.tsx`:
  - "Pauta de hoje zerada" — não aponta para a tabela;
  - "Sua fila está vazia" — aponta só com texto corrido, fácil de passar batido;
  - "Nada parado. Seu dia está seu." — só aparece quando a tabela também está vazia, então
    não há para onde apontar.
- **Cartões e gráficos do "No geral"** (`src/components/pauta/RadarDeRisco.tsx`): rótulos
  `text-[11px] uppercase text-muted-foreground`; a tabela "Resumo por fabricante" usa o mesmo
  cabeçalho `bg-muted` da tabela do time.
- **Sons** (`src/components/configuracoes/CardDeSom.tsx:99`): um `<p>` "Criados pela Repply"
  separa duas partes da lista, e `CardDeSom.test.tsx` confere que ele aparece.

---

## 3. O desenho

### 3.1 O rosto do responsável

- A coluna "Responsável" mostra a **foto** da pessoa ao lado do nome; sem foto, as **iniciais**,
  no mesmo círculo que a tela de Negócios já usa.
- Para isso as duas funções da tabela passam a devolver duas colunas a mais: **`responsavel_id`**
  (o `usuarios.id` do dono) e **`responsavel_avatar`** (`usuarios.avatar_url`).
- A função `iniciais()` sai de `CampoDeResponsaveis.tsx` para um lugar compartilhado, e as duas
  telas usam a mesma. Duas cópias da mesma regra divergem em silêncio.

### 3.2 Largura das colunas

- **Por padrão, tudo cabe** numa tela de notebook (1366 px): a tabela passa a
  `table-layout: fixed` com larguras-padrão por coluna, e o nome do negócio quebra em **até duas
  linhas**. Valor e dias não quebram.
- **Quem quiser, arrasta** a borda direita do título de uma coluna. Largura mínima por coluna,
  para ninguém esmagar uma coluna até sumir.
- **Dois cliques na borda** voltam aquela coluna à largura-padrão.
- O ajuste fica **guardado no navegador** daquela pessoa (`localStorage`), com uma chave para cada
  forma da tabela — com e sem a coluna Responsável —, porque as larguras de uma não servem na outra.
- 🔴 `localStorage` pode falhar (aba anônima, bloqueio do navegador). Toda leitura e gravação fica
  protegida: sem o guardado, valem as larguras-padrão, e a tabela nunca quebra por isso.
- A caixa com rolagem horizontal fica, para telas estreitas: ela passa a rolar só quando a soma
  das larguras não cabe.

### 3.3 Contraste em todo o "No geral"

A mesma linguagem do dashboard de referência, com os tokens do projeto (CLAUDE.md §8), nunca cor solta:

- **Título das colunas numa faixa mais escura**, com texto escuro e forte, sem caixa-alta — na
  tabela do time e no "Resumo por fabricante".
- **Linhas bem separadas**, com divisória na força da borda do tema.
- **Números em destaque:** valor e dias em peso forte, na cor do texto principal.
- **Cartões de risco:** o rótulo sai do cinza em caixa-alta e ganha a cor do texto principal.
- Vale nos dois temas. A faixa usa o token do texto com transparência (`foreground` com opacidade
  baixa), que escurece no claro e clareia no escuro sem regra por tema.
- 🔴 **Os valores exatos de opacidade saem das fotos da tela, não deste documento.** Mudança de
  aparência é decisão do dono do produto: as fotos no claro e no escuro são mostradas a ele antes
  de publicar.

### 3.4 "Abrir negócio" em laranja

Em cada linha da tabela do time, o botão vira o principal (laranja, o `--primary` da marca), igual
ao da pauta. "Retomar depois" continua discreto.

### 3.5 Aviso quando a pauta está vazia

- Nos estados **"Pauta de hoje zerada"** e **"Sua fila está vazia"**, quando a tabela logo abaixo
  tem negócios, aparece um aviso com um botão que **desce a tela até a tabela**.
- Texto para quem tem a chave: *"Quer adiantar? Os N negócios que pedem atenção estão na tabela
  logo abaixo."* Para quem não tem: *"Quer adiantar? Seus N negócios que pedem atenção estão na
  tabela logo abaixo."* Botão: *"Ver a tabela"*.
- 🔴 **"Pedem atenção", e não "parados".** A tabela lista `parado OR sem_proxima_acao`; boa parte
  dela entra só por não ter próxima ação marcada. Chamá-la de "parados" contaria errado — é o
  mesmo cuidado que o título da própria tabela e o e-mail já tomam.
- Quando a tabela está vazia, nada muda: não há para onde apontar.
- O "Sua fila está vazia" perde a frase corrida que apontava para a tabela, porque o aviso novo diz
  a mesma coisa com um botão.

### 3.6 Sons

- Sai o `<p>` "Criados pela Repply". As duas partes viram **uma lista só**.
- O teste passa a conferir que o rótulo **não** aparece — senão alguém o devolve sem perceber.

### 3.7 De brinde: "é meu?" pelo identificador (§69 da dívida)

- `aoRetomarDaTabela` passa a comparar **`responsavel_id` com `profile.id`** (o `usuarios.id` de
  quem está logado — CLAUDE.md §4.5).
- Se `responsavel_id` não vier (site novo com o banco antigo), cai na comparação por nome de hoje.
  Assim nenhuma ordem de publicação quebra o diálogo.
- O §69 de `docs/divida-tecnica.md` vai para "Resolvidos".

---

## 4. Arquivos

| Arquivo | O quê |
|---|---|
| `supabase/migrations/20260914153000_tabela_do_time_com_rosto.sql` (novo) | as duas funções devolvem `responsavel_id` e `responsavel_avatar` |
| `src/lib/iniciais.ts` (novo) | a função `iniciais()` compartilhada, com teste |
| `src/lib/larguras-de-colunas.ts` (novo) | regra pura: largura-padrão, mínima, ler e gravar o guardado, com teste |
| `src/components/pedidos/CampoDeResponsaveis.tsx` | passa a importar `iniciais()` |
| `src/hooks/use-dashboard.ts` | o tipo `NegocioEmRisco` ganha as duas colunas |
| `src/components/pauta/TabelaDoTime.tsx` | foto, larguras, alça de arrastar, botão laranja, contraste |
| `src/components/pauta/RadarDeRisco.tsx` | contraste nos cartões e no "Resumo por fabricante" |
| `src/pages/Hoje.tsx` | aviso da pauta vazia com botão; "é meu?" pelo identificador |
| `src/components/configuracoes/CardDeSom.tsx` e o teste | sai o rótulo |
| `supabase/functions/pauta-resumo-diario/corpo.ts` | o tipo `NegocioDaEquipe` ganha as duas colunas (o e-mail não as usa) |
| `docs/divida-tecnica.md` | §69 para "Resolvidos" |

---

## 5. A mudança no banco

- 🔴 **Mudar as colunas de saída de uma função exige `DROP` + `CREATE`** — `CREATE OR REPLACE` não
  aceita trocar o `RETURNS TABLE`. E o `DROP` apaga a permissão em silêncio. Medido em 14/09/2026:

  | função | `md5(prosrc)` vigente | permissão |
  |---|---|---|
  | `negocios_em_risco_de(uuid, …)` | `dc3e5f918b165fc8c27abfb1bbd40365` (3.149 caracteres) | `postgres`, `service_role` — só o servidor |
  | `negocios_em_risco(…)` | `128b6304a969066943f8954776237830` (327 caracteres) | `postgres`, `authenticated`, `service_role` |

  A migration refaz as duas **numa transação só** e devolve cada permissão exatamente como estava:
  `REVOKE ALL … FROM PUBLIC, anon` (e `authenticated` na versão `_de`), e `GRANT EXECUTE` só a quem
  tinha. A conferência da `proacl` antes e depois é obrigatória.
- 🔴 **`negocios_em_risco_de` fica fechada para o navegador.** Ela aceita o identificador de
  qualquer pessoa e pula a regra de segurança; aberta a `authenticated`, qualquer um consultaria a
  carteira de qualquer outro.
- **Os corpos são colhidos com `pg_get_functiondef`**, e a única mudança no SQL é levar
  `usuario_id` e `avatar_url` do dono até a saída. Nenhuma regra de quem vê o quê muda.
- A migration termina com `NOTIFY pgrst, 'reload schema';`, para a API do banco enxergar as colunas
  novas na hora, sem esperar a recarga automática.
- **Compatível com o site no ar:** o site antigo chama a função com os mesmos parâmetros e ignora
  as colunas a mais. O e-mail das 7h também.
- **Ensaio antes de aplicar**, pelo método que já funcionou nesta base (memória
  `ensaio-de-migration-em-producao`): a migration inteira, as conferências de permissão e a chamada
  como usuário de verdade, com e sem a chave, num comando só que termina em erro e desfaz tudo.
- **Rota de volta:** reemitir as duas funções como estão hoje, com as permissões de hoje.
- **O "pode" do dono do produto antes de aplicar** (CLAUDE.md §11).

---

## 6. Testes

1. `src/lib/iniciais.test.ts` — nome composto, nome único, espaços sobrando, vazio.
2. `src/lib/larguras-de-colunas.test.ts` — padrão sem guardado; guardado válido; guardado
   quebrado ou com coluna a menos volta ao padrão; largura abaixo da mínima sobe para a mínima;
   `localStorage` que lança erro não quebra.
3. `TabelaDoTime` — a foto aparece quando há `responsavel_avatar` e as iniciais quando não há;
   "Abrir negócio" é o botão principal; a coluna Responsável some sem a chave.
4. `Hoje` — nos estados zerada e vazia, com negócios na tabela, o aviso e o botão aparecem, com
   "Seus" para quem não tem a chave; com a tabela vazia, não aparecem.
5. `Hoje` — "é meu?" usa o identificador e, sem ele, cai no nome.
6. `CardDeSom.test.tsx` — o rótulo "Criados pela Repply" não aparece, e os 10 sons continuam.

🔴 Nomes e valores inventados em todos (CLAUDE.md §6.9).

---

## 7. Ordem de publicação

1. **Banco:** ensaio, "pode" do dono do produto, aplicar e conferir as permissões. Seguro com o
   site antigo, que ignora as colunas a mais.
2. **Fotos da tela** no navegador embutido, no claro e no escuro, com o login do dono do produto —
   eu não abro sessão com senha.
3. **Site**, só depois do aval visual, por cherry-pick só dos commits desta leva sobre `origin/main`.

A função do e-mail não precisa de publicação: o tipo em `corpo.ts` é só documentação do que a
função devolve, e o e-mail não usa as colunas novas.

---

## 8. Riscos

| Risco | O que fazemos |
|---|---|
| `DROP` apagar permissão e abrir a carteira alheia | permissão refeita na mesma transação, conferida no ensaio e depois de aplicar |
| API do banco servir a assinatura velha logo depois | `NOTIFY pgrst, 'reload schema'` no fim da migration |
| Muitos botões laranja por tela | é o pedido; a pauta já faz assim, e a tabela mostra 10 linhas por vez |
| Alguém desarrumar a própria tabela | dois cliques voltam a coluna ao padrão; o ajuste é só daquele navegador |
| Foto quebrada ou lenta | `AvatarFallback` mostra as iniciais enquanto a foto não carrega ou se falhar |
