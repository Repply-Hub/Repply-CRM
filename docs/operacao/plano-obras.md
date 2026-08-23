# Plano — Obras: consertar, trocar status por marcador, vendas por obra e busca de CNPJ

**Data:** 23/08/2026 · **Estado:** aguardando autorização para aplicar no banco

---

## O ponto de partida que muda tudo

A seção de Obras está vazia **porque foi zerada**, não porque nunca foi tocada. Medido no
banco de produção em 23/08/2026:

| Medida | Valor |
|---|---|
| Obras cadastradas | **0** |
| Negócios ligados a uma obra | **0** de 11.911 |
| Linhas de `status_obras`, nas 8 empresas | **0** |
| Itens de negócio no banco inteiro | **1** |

Isso não é um detalhe de contexto: é o que autoriza este plano a **trocar coisas de lugar em vez
de remendar**. Não há dado para migrar, não há usuário para reeducar, não há tela em produção
que dependa do comportamento atual. Qualquer plano escrito sem essa medição seria três vezes
maior e cheio de compatibilidade retroativa inútil.

### 🔴 Correção: "nunca foi usada" está errado — ela foi usada, deu errado e foi zerada

A primeira versão deste plano dizia que a seção nunca tinha sido usada. `historico_alteracoes`
desmente, e a diferença importa para quem for construir. **2.312 obras existiram**:

| | |
|---|---|
| Criadas | 1.488 registradas, entre 30/07 e 01/08/2026 |
| Apagadas por **Lucas Ferreira** | 1.404 |
| Apagadas por **Arthur** | 908 |
| Quando | 28/07 a 06/08/2026, em **3 lotes cada** — exclusão em massa, deliberada |
| Empresas | "MD Representações" e "MD" — duas linhas de assinante distintas |

E o que essas obras eram explica a limpeza: o **nome da obra** vinha preenchido com o
**endereço**, com sobras de coordenada grudadas no fim —
`R Almirante Barroso 239, Alto da Conceição, Mossoro-RN (0, 0)`,
`TRAVESSA MINISTRO MACEDO SOARES 1973 LAGOA NOVA (, )`. Nenhuma tinha CNPJ, e nenhuma tinha
`endereco_entrega` preenchido: o endereço estava **no lugar do nome**. Importação malfeita,
limpa em seguida pelos próprios donos do dado.

**Duas consequências práticas:**

1. **Todas as 2.312 tinham `status = 'ativa'`.** Esse valor não existe em `status_obras` nem
   entre os 7 slugs da semente — é o que está **chumbado no formulário da ficha do cliente**
   (`ClienteDetalhe.tsx:317`). É prova, com dado, de que o cadastro em uso de verdade era o
   SEGUNDO. Consertar só o formulário de `Obras.tsx` não teria resolvido nada.
2. **Derrubar `obras.status` não apaga esse histórico.** `historico_alteracoes` guarda a foto
   inteira da linha em `dados_antes`, com os valores antigos preservados; a tela de Histórico
   continua legível depois do DROP.

---

## Por que está vazia: três travas independentes

**1. A lista de status nasce vazia em toda empresa.** A função `seed_default_status_obras`
existe e criaria 7 opções, mas **ninguém a chama** — não há gatilho em `empresas` nem chamada
no app. As outras seis tabelas de configuração do sistema (marcadores, colunas do funil,
campos, permissões, colunas de tarefa, assinatura) todas têm esse gatilho. `status_obras` é a
única exceção do padrão. Escrita e esquecida.
→ `supabase/migrations/20260428174553_...sql:47`; nenhuma chamada em todo o repositório.

**2. A obra seria gravada com status em branco.** O formulário espalha `...newObra`, que
carrega `status: ''`, e o insert manda a coluna **explicitamente** — o que anula o DEFAULT
`'em_andamento'` do banco (o Postgres só aplica default quando a coluna é omitida). String
vazia satisfaz o NOT NULL, então não há erro. Na lista, a etiqueta sai em branco.
→ `src/pages/Obras.tsx:852-856` + `src/hooks/use-mutations.ts:185`

**3. 🔴 O formulário de EDITAR obra não salva. Nunca.** A validação de CNPJ roda sem condição
e exige `min(18)` — o tamanho **com** máscara — contra um valor que vem do banco com 14
dígitos, sem máscara. Obra sem CNPJ dá "CNPJ obrigatório"; obra **com** CNPJ também reprova.
O formulário de criar está protegido; o de editar não.
→ `src/pages/Obras.tsx:735` e `:711` contra o esquema em `:127`

**Bônus: dois formulários, três vocabulários.** A ficha do cliente
(`src/pages/ClienteDetalhe.tsx:1201-1213`) tem um segundo cadastro de obra com **4 opções
chumbadas no código** e padrão `'ativa'`, ignorando `status_obras` por completo. Somados aos 7
slugs da semente e ao default `'em_andamento'`, são três vocabulários que não conversam.

**Sobre o nome:** "fase da obra" **não existe** como campo. O rótulo é "Status Inicial". A
string "Fase da Obra" só aparece no Portal de licenças ambientais — outro domínio, outra
tabela, sem relação.

---

## Decisões tomadas com o Lucas em 23/08/2026

1. **Vendas por obra: construir agora, começando vazio.** As 11.903 vendas importadas não
   serão religadas — elas nunca souberam de que obra eram, só têm o endereço digitado.
2. **O marcador SUBSTITUI o status.** Não convivem.
3. **Uma lista de marcadores por empresa**, editável por gestor — igual ao marcador de Negócios.

### 4. A lista de marcadores nasce VAZIA — confirmado pelo Lucas em 23/08/2026

A frase original (*"por padrão não vem nenhum marcador e cada representante personaliza da
forma como quer"*) admitia duas leituras: a OBRA nascer sem marcador com a lista já cheia de
sugestões, ou a LISTA nascer vazia. **Perguntado, o Lucas confirmou: a lista nasce vazia.**

Isso é o oposto do que as outras seis tabelas de configuração do sistema fazem — todas semeiam
conteúdo por gatilho. Aqui não se semeia nada, **de propósito**.

**E é justamente por isso que o campo tem que nascer opcional, com estado vazio explícito.**
Lista vazia + campo obrigatório + `<Select>` sem tratamento de vazio é exatamente a receita
que deixou o `status_obras` intransponível por meses: um dropdown que abre em branco e não
deixa escolher nada. A diferença entre "vazio porque foi decidido" e "vazio porque quebrou"
tem que estar na tela, escrita: *"Nenhum marcador cadastrado — criar o primeiro"*.

---

## O molde a copiar (e o a não copiar)

O marcador que o Lucas quer **já existe pronto** em Negócios e deve ser copiado tal e qual:
tabela por empresa com `slug/nome/cor/ordem/is_sistema`, gatilho de semeadura em `empresas`,
7 cores de tema fixas, diálogo de gerenciar com arrastar-para-ordenar, filtro multi-seleção.
→ `supabase/migrations/20260731130000_marcadores_negocios.sql`, `src/hooks/use-marcadores.ts`,
`src/components/pedidos/MarcadoresDialog.tsx`

🔴 **A palavra "marcador" tem TRÊS significados neste código.** O de Tarefas
(`src/components/tarefas/MarcadoresMultiSelect.tsx`) é texto separado por vírgula, sem cor,
com as categorias guardadas no `localStorage` de cada navegador — cada pessoa vê uma lista
diferente e nada disso existe no banco. **Não copiar esse.** O de e-mail é pasta do provedor,
outro assunto.

🔴 **As cores não são livres.** São 7 tokens de tema (`KANBAN_COR_OPCOES`), e só funcionam
porque existe um *safelist* no Tailwind que os cobre. Cor fora dessa lista **sai sem cor em
produção e funciona em desenvolvimento** — defeito que só aparece depois de publicar.
→ `tailwind.config.ts:6-9`

---

## Tarefa 1: Conserto do que trava hoje

**Arquivos:** `src/pages/Obras.tsx`

- [ ] **1.1** A validação de CNPJ do EDITAR passa a ter a mesma condição do CRIAR
      (`if (obrigatório || preenchido)`), e o valor carregado do banco passa por `formatCnpj`
      antes de entrar no formulário. Sem os dois, o conserto é pela metade.
- [ ] **1.2** Teste que fixa o contrato: obra sem CNPJ salva; obra com CNPJ de 14 dígitos
      vindo do banco salva. É o tipo de defeito que volta.

> Este conserto entra **primeiro e sozinho**, antes de qualquer mudança de campo. Se entrar
> junto, qualquer falha de salvamento vai parecer culpa do marcador — quando já estava
> quebrado antes.

---

## Tarefa 2: O banco do marcador

**Arquivo:** `supabase/migrations/<ts>_marcadores_obras.sql`

- [ ] **2.1** Tabela `marcadores_obras`, cópia da forma de `marcadores`:
      `id, empresa_id NOT NULL, slug, nome, cor DEFAULT 'muted-foreground', ordem,
      is_sistema, created_at, updated_at`, com `UNIQUE (empresa_id, slug)`.
- [ ] **2.2** RLS: leitura para quem é da empresa, escrita só para gestor. Usar
      `get_my_empresa_id()` — aqui **pode**, porque a tabela tem `empresa_id` próprio.
- [ ] **2.3** `obras.marcador_id UUID REFERENCES marcadores_obras(id) ON DELETE SET NULL`,
      **nulável**. Um marcador por obra, como em negócios.
- [ ] **2.4** **NENHUMA semeadura de conteúdo** (ver a suposição acima). Mas o gatilho de
      empresa nova **não é criado agora** justamente porque não há o que semear — e isso fica
      escrito no arquivo, para o próximo não achar que foi esquecido como no `status_obras`.
- [ ] **2.5** Derrubar o que a substituição aposenta: `DROP` de `obras.status`,
      `status_obras` e `seed_default_status_obras`. As três estão **vazias e sem uso** — medido:
      0 obras, 0 linhas de status, função nunca chamada. Deixá-las de pé garante que o
      descasamento de três vocabulários continue existindo.

> **Por que derrubar em vez de deixar quieto:** `obras.status` é `NOT NULL`. Mantê-la
> obrigaria todo insert novo a inventar um valor para uma coluna que ninguém lê — exatamente
> o tipo de sobra que vira bug daqui a seis meses.

---

## Tarefa 3: Marcador na tela de Obras

**Arquivos:** `src/hooks/use-marcadores-obras.ts` (novo),
`src/components/obras/MarcadoresObrasDialog.tsx` (novo), `src/pages/Obras.tsx`,
`src/hooks/use-mutations.ts`, `src/components/obras/MapaObras.tsx`,
`src/pages/ClienteDetalhe.tsx`, `src/integrations/supabase/types.ts`

- [ ] **3.1** Hook no molde de `use-marcadores.ts`, com as mesmas invalidações
      (`['marcadores_obras']` e `['obras']`).
- [ ] **3.2** Diálogo de gerenciar, no molde de `MarcadoresDialog.tsx`.
- [ ] **3.3** Trocar o campo nos **dois** formulários — o de Obras.tsx **e o da ficha do
      cliente**, que hoje tem as 4 opções chumbadas. Consertar só um mantém o problema vivo.
- [ ] **3.4** Coluna, filtro, ordenação e legenda do mapa passam a falar de marcador.
      ⚠️ São **três listas independentes** em `Obras.tsx` (`OBRA_FIELDS`, o bloco de render e
      `getSortValue`) e nada força elas a baterem: coluna sem caso no `switch` cai no
      `default` e ordena pelo campo errado **em silêncio**.
- [ ] **3.5** `useUpdateObra` hoje **não aceita `campos_extras`** (`use-mutations.ts:198-205`),
      diferente do create. Acertar a assimetria de passagem.

---

## Tarefa 4: O que foi vendido para cada obra

**Arquivos:** `supabase/migrations/<ts>_obra_vendas.sql`, `src/hooks/use-obra-vendas.ts`
(novo), `src/pages/Obras.tsx`

- [ ] **4.1** RPC `obra_vendas(p_obra_id)` que devolve, **somado no banco**: quantidade de
      negócios, valor total, e o recorte por etapa do funil.
- [ ] **4.2** RPC `obra_negocios(p_obra_id, p_limit, p_offset)` com `count` exato, para a
      lista. **Paginada no servidor.**
- [ ] **4.3** Uma seção no painel lateral da obra. Não criar rota `/obras/:id`: ela não
      existe hoje, e os dois caminhos que abrem uma obra passam o id pelo `state` da
      navegação — criar a rota sem ajustar os dois deixa dois jeitos de navegar convivendo.

> **Qual número é "vendido": `pedidos.valor_total`, e não a soma dos itens.**
>
> Os dois divergem **por decisão consciente**: a tela de editar negócio grava o valor
> digitado DEPOIS dos itens, de propósito, para vencer o gatilho que recalcula o total — o
> código chama isso de "LIMITE CONHECIDO" (`src/hooks/use-edit-pedido.ts:153-172`).
>
> E o desempate é a medição: **`itens_pedido` tem 1 linha no banco inteiro.** Quem escolher
> "soma dos itens" entrega um relatório zerado para todas as obras, sem perceber.

🔴 **Não copiar `usePedidosPorCliente`.** Ele puxa todos os negócios do cliente para o
navegador sem paginação (`use-pedidos.ts:637-659`). É o molde mais provável de alguém copiar
aqui, e é justamente o proibido: além da regra do projeto (CLAUDE.md §6.4), o PostgREST corta
em 1.000 linhas **sem avisar** — a obra grande mostraria menos do que tem.

🔴 **Não acrescentar parâmetro em `pedidos_stats`.** Já aconteceu de recriar essa função com
assinatura nova e deixar a busca por obra morta em produção; foi preciso uma migration só
para varrer as sobrecargas antigas. RPC nova, sempre.

---

## Tarefa 5: Busca por CNPJ, acima do nome da obra

**Arquivos:** `src/components/shared/CampoCnpj.tsx` (novo), `src/pages/Obras.tsx`

- [ ] **5.1** Extrair `CampoCnpj` **a partir da versão de Fabricantes**, não da de Clientes:
      só a de Fabricantes protege contra resposta atrasada (`Fabricantes.tsx:167,171`). Sem
      essa guarda, fechar e reabrir o formulário dentro dos 10 segundos faz a resposta do
      CNPJ antigo preencher a obra nova.
- [ ] **5.2** Usar o componente **só na obra por enquanto.** Trocar nas duas telas antigas
      mexe em cadastro de cliente e de fabricante, que estão em produção com cliente pagante.
      Componente novo → obra primeiro → migrar as outras depois, em commit próprio.
- [ ] **5.3** O campo sobe para **acima do nome da obra**, e continua **opcional**.
- [ ] **5.4** Preenchimento nunca sobrescreve o que já foi digitado — só preenche campo vazio.
      É a regra que já existe em Clientes e evita o nome da obra trocar sozinho.
- [ ] **5.5** Padronizar em `src/lib/cnpj.ts`. Hoje Obras importa de `src/utils/cnpj.ts`, um
      **segundo módulo** com validação própria; existe ainda uma **terceira** cópia da máscara
      em `EmpresasTab.tsx`. Ligar a busca sem padronizar deixa dois módulos de CNPJ no mesmo
      arquivo.

### Duas ressalvas do endereço, que mudam o que a tela deve fazer

⚠️ **O endereço da Receita é o da SEDE da SPE**, que muitas vezes é o escritório da
construtora — **não o canteiro**. E o endereço da obra é o que gera a coordenada no mapa.
Preencher calado moveria o pino. Por isso o campo é preenchido **só se estiver vazio** e com
um aviso curto na tela dizendo de onde veio.

⚠️ **Preencher o endereço por código abre sozinho a listinha de sugestões do mapa**
(`EnderecoAutocomplete.tsx:31-62` reage a qualquer mudança de valor; a trava só é ligada
quando a pessoa clica numa sugestão). Ou se expõe a mesma trava para o preenchimento
automático, ou a listinha abre do nada.

---

## Tarefa 6: Verificação

- [ ] `npx tsc --noEmit -p tsconfig.app.json` — **com o `-p`** (CLAUDE.md §9). Linha de base: 35.
- [ ] `npm run test` (183) · `npm run build` · eslint medido antes/depois nos arquivos tocados
- [ ] Ensaio no banco em transação revertida: criar marcador, ligar a uma obra, excluir o
      marcador e confirmar que a obra fica **sem** marcador em vez de sumir.
- [ ] O Lucas abre a tela e cadastra a primeira obra do sistema.

---

## Riscos registrados, para não custarem de novo

| Risco | Onde |
|---|---|
| Cor fora dos 7 tokens **sai sem cor em produção** e funciona em desenvolvimento | `tailwind.config.ts:6-9` |
| Coluna nova sem caso no `switch` de ordenação ordena pelo campo errado **em silêncio** | `Obras.tsx:233-244` |
| `obras` **não tem `empresa_id`** — o isolamento passa todo pelo cliente. Copiar a RLS de `marcadores` literalmente quebra | `20260804195019...sql:91-102` |
| Reintroduzir `is_admin()` numa política de obra **desfaz** a decisão de ago/2026 que tirou o admin geral do conteúdo dos clientes | `20260804195019` |
| Rota nova fora do prefixo `/obras` **passa direto** pela guarda de seção | `App.tsx:393`, `secoes.ts:53` |
| A RPC `delete_obras_bulk` é `SECURITY DEFINER` e **só confere o papel, não a empresa dona** | `20260508194833:9-22` |
| Desligar a seção Obras **não fecha o banco** — nenhuma política de `obras` chama `empresa_tem_secao`. Só o Portal tem isso | `20260822221102` |
| O card do Kanban mostra o nome da obra **sem** a cascata da seção | `pedido-to-order.ts:11` |

---

## Fora do escopo, achado no caminho — registrar e decidir depois

0. 🔴 **Existem DUAS empresas "MD", e uma delas guarda 803 clientes que ninguém enxerga.**
   Medido em 23/08/2026:

   | Empresa | Usuários | Clientes | Negócios |
   |---|---|---|---|
   | MD Representações | 13 | 1.305 | 11.911 |
   | **MD** | 2 | **803** | 0 |

   As duas nasceram no mesmo dia (25/06/2026). A RLS isola uma da outra, então os 803
   clientes da segunda são invisíveis para as 13 pessoas da primeira — e vice-versa. Foi por
   aí que apareceu: as obras apagadas estavam divididas entre as duas, e o Arthur (908
   exclusões) é usuário da segunda.

   Não é assunto de Obras e **não deve ser mexido junto**: juntar ou apagar inquilino é
   operação de dado de cliente pagante, com decisão de produto antes. Mas é o achado de maior
   consequência desta apuração, e fica aqui para não se perder.

1. **A tela de importação mente.** Ela diz que a coluna "Obra" vai para `pedidos.obra_id`; vai
   para `endereco_entrega`. → `src/components/import/MappingStep.tsx:67`
2. **A chave do Google Maps cobra por consulta e dispara sozinha.** Abrir a aba do mapa com N
   obras sem coordenada faz N chamadas cobradas. O único freio é o carimbo `geocoded_at`,
   gravado **inclusive quando falha** — quem mexer nesse trecho não pode tirar isso.
   A chave anterior **vazou no histórico do git e foi rotacionada**.
   → `use-geocode-obras.ts:122-190`, `docs/arquitetura/integracoes-externas.md:20`
3. **Defeito na busca de CNPJ:** `return res.json()` sem `await` faz o `clearTimeout` do
   `finally` rodar antes de o corpo ser lido — o prazo de 10s cobre só até o cabeçalho, e
   falha de leitura escapa do `catch`. Além disso, a mensagem de "consulta expirou" **nunca
   chega ao usuário**: os dois chamadores usam `catch` sem ler o erro e mostram sempre "CNPJ
   não encontrado". Internet ruim e empresa inexistente ficam iguais na tela.
   → `src/lib/cnpj.ts:64`, `Clientes.tsx:658`, `Fabricantes.tsx:176`
4. **`generate-excel.ts` é código morto** — ninguém o importa; a exportação real é montada
   inline em `Negocios.tsx`.
5. **O SPEC.md está errado** ao afirmar que os status de obra são semeados pela função.
6. **A landing page diz que Obras é "o diferencial que TODO assinante recebe"** — hoje é
   falso, a seção é desligável por empresa. → `RecursosSection.tsx:19-23`
