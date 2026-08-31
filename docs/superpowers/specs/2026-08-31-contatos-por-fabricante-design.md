# Vários contatos por fabricante — desenho

> **Estado:** desenho aprovado pelo Lucas em 31/08/2026. **Nada implementado.**
> **Objetivo:** a fábrica deixa de ter um contato e passa a ter uma lista, com a função de
> cada pessoa.

---

## 1. O que motivou

Pedido do Lucas, em 31/08/2026:

> uma fábrica que um representante possui tem diversos contatos que ele fala diariamente.
> Tem o gerente, tem o responsável pela logística na fábrica, existe a assistência técnica

Hoje `fabricantes` guarda **um** contato, em duas colunas soltas: `nome_contato` e
`telefone`. Não há função, não há e-mail, não há segundo nome.

---

## 2. A medição que mudou o desenho

Contado em 31/08/2026:

| empresa | fabricantes | com nome de contato | com telefone |
|---|---:|---:|---:|
| **MD Representações** | **28** | **0** | **0** |
| JHS Representações | 1 | 1 | 1 |
| Repply *(base de demonstração)* | 8 | 8 | 8 |

**O campo que existe hoje está vazio nas 28 fábricas do cliente-âncora.**

Duas consequências, e as duas mandam no desenho:

1. **Não há migração de dado a fazer.** São 9 registros no sistema inteiro, sendo 8 de uma
   base de demonstração criada ontem.
2. 🔴 **O risco de repetir o padrão do item 57 da dívida técnica** ("os módulos que
   justificam o produto estão vazios"). Um campo para UM contato é inútil para quem fala
   com quatro pessoas na mesma fábrica — a leitura otimista é que a informação foi morar no
   WhatsApp, e é a favor deste trabalho. Mas construir algo mais rico que também não seja
   preenchido é o resultado que precisamos evitar.

**É essa segunda consequência que decide a lista semeada da §3.3, e é ela que decide a
função ser opcional.** O campo de hoje morreu por atrito; o novo não pode nascer com mais.

---

## 3. As decisões tomadas

Todas do Lucas, em 31/08/2026.

| # | Decisão | Escolha | O que ela evita |
|---|---|---|---|
| 1 | Onde os contatos de fábrica vivem | **Separados**, só dentro da fábrica | A tela de Contatos continua sendo a **carteira** — as 1.092 pessoas que compram. Misturar quem fornece faria a contagem, a exportação e a importação mentirem |
| 2 | A função (gerente, logística…) | **Lista fixa, configurável por empresa** | Texto livre faria "Logística", "logistica" e "Log." virarem três coisas, e aí não há filtro confiável |
| 3 | Como a lista começa | **Semeada e editável** | Lista vazia obriga a sair da tela antes de cadastrar o primeiro contato — o atrito que matou o campo de hoje |
| 4 | O que o cartão mostra | **Um principal, marcado** | Resolve o "para quem eu ligo primeiro" sem abrir a ficha |

### 3.1 Decisão minha, comunicada: o contato pertence a UMA fábrica

Diferente de `obra_contatos`, que é N:N. Lá a mesma pessoa da construtora cuida de vários
canteiros — o comprador toca três, quatro obras ao mesmo tempo. Aqui o gerente da
Portobello trabalha na Portobello. Vínculo simples, 1:N.

> **O precedente que justifica olhar isso com cuidado:** em 25/08/2026 o vínculo obra↔contato
> nasceu como coluna única, com o comentário "não é lista". Dois dias depois foi revertido,
> porque vincular o contato à obra B o **removia da obra A**, em silêncio
> (`20260827…_obra_contatos`). A pergunta "isso é lista?" foi feita aqui de propósito, e a
> resposta é diferente pelo domínio, não por descuido.

### 3.2 A função é OPCIONAL

Obrigatória, ela recria o atrito da §2: quem quer só anotar um telefone às pressas esbarra
numa lista antes de conseguir salvar.

### 3.3 A lista semeada

Empresa nova nasce com: **Gerente comercial · Logística · Assistência técnica · Financeiro ·
Representante**. Renomeáveis e apagáveis.

Isso **não** contradiz o princípio de não transformar prática da MD em regra do sistema
(`SPEC.md` §4): é ponto de partida editável, não regra. O que aquele princípio proíbe é
lista **cravada no código**, que o assinante não consegue mudar.

---

## 4. Estrutura

### 4.1 `fabricante_funcoes` — a lista por empresa

| coluna | |
|---|---|
| `id` | uuid |
| `empresa_id` | **NOT NULL** → `empresas(id)` |
| `nome` | texto, o rótulo na tela |
| `ordem` | inteiro |
| `is_sistema` | veio da semeadura |

`UNIQUE (empresa_id, nome)`.

### 4.2 `fabricante_contatos`

| coluna | |
|---|---|
| `id` | uuid |
| `fabricante_id` | **NOT NULL** → `fabricantes(id)` **ON DELETE CASCADE** |
| `funcao_id` | → `fabricante_funcoes(id)` **ON DELETE SET NULL**, anulável (§3.2) |
| `nome` | **NOT NULL** |
| `telefone`, `email`, `observacao` | anuláveis |
| `principal` | booleano |

### 4.3 🔴 Por que o isolamento aqui é o mais simples do sistema

`fabricantes` é a **única tabela do núcleo comercial que se prende à empresa por
`empresa_id`** — `clientes` tem a coluna e ela está nula nas 1.306 linhas, `pedidos` e
`obras` não têm coluna nenhuma, e o recorte real deles é `usuario_id → usuarios.empresa_id`
(ver `2026-08-30-base-demo-repply-design.md` §2.4).

Então o contato da fábrica herda o caminho mais curto e mais seguro que existe aqui:
`fabricante_id → fabricantes.empresa_id`. Uma junção, direta.

> ⚠️ **Não copie este desenho para contato de cliente ou de obra.** Lá a corrente é outra,
> e `empresa_id` mentiria.

### 4.4 O principal

`principal boolean not null default false`, com **índice único parcial**:

```sql
create unique index fabricante_contatos_um_principal
  on public.fabricante_contatos (fabricante_id) where principal;
```

O índice parcial é o que impede duas pessoas marcarem principais diferentes ao mesmo tempo
e o banco aceitar os dois. Sem ele, o cartão mostraria um dos dois sem critério.

**Regra de tela:** o primeiro contato de uma fábrica nasce principal. Marcar outro
desmarca o anterior, na mesma gravação.

---

## 5. Segurança

Mesmo alcance que **já vale para editar a fábrica** desde 19/08/2026
(`20260819125643_fabricantes_escrita_para_todo_membro_da_empresa.sql`): qualquer membro da
empresa. Não se inventa permissão nova.

As quatro políticas de `fabricante_contatos` se apoiam na fábrica dona:

```sql
exists (select 1 from public.fabricantes f
        where f.id = fabricante_contatos.fabricante_id
          and (is_admin() or f.empresa_id = get_my_empresa_id()))
```

E as de `fabricante_funcoes`, direto em `empresa_id = get_my_empresa_id()`.

> 🔴 **As duas tabelas entram no cerco do bloqueio por falta de pagamento** (migrations
> `20260830100000`+). Empresa fora de dia não cria nem edita contato de fábrica. O
> checklist de tabela nova em `docs/arquitetura/permissoes-e-rls.md` exige essa resposta —
> ela é **sim**, e a política restritiva vai no mesmo arquivo que cria a tabela.

---

## 6. O que acontece com o que existe

Os 9 registros da §2 viram o contato **principal** da sua fábrica, sem função.

🔴 **As colunas `fabricantes.nome_contato` e `fabricantes.telefone` NÃO caem nesta rodada.**

Publicar o banco e publicar o site não são o mesmo ato nem acontecem no mesmo minuto.
Derrubar as colunas junto abre uma janela em que o site antigo — ainda no ar — lê uma
coluna que já sumiu, e a tela de Fábricas quebra para cliente pagante. O `DROP` vai em
arquivo próprio, **depois** do site novo publicado.

É o mesmo caminho de dois passos que `obras.status` (24/08) e `contatos.obra_id` (27/08)
seguiram. Até lá as colunas ficam órfãs: nada no site novo lê nem escreve nelas.

---

## 7. Telas

**Ficha da fábrica** ganha a seção *Contatos*: lista agrupada por função, cada linha com
nome, telefone, e-mail e o selo de principal. Botão de acrescentar, editar e remover.

**Cartão na lista de Fábricas** passa de `nome_contato` para
`Jorge Menezes · Gerente comercial  +3`. Sem contato, o cartão não mostra a linha — como já
faz hoje.

**Gerenciar funções** é um diálogo aberto de dentro da tela de Fábricas, no molde do
"Gerenciar colunas" do Kanban. **Não vai para Configurações:** lista usada num lugar só fica
perto de onde é usada, e Configurações já tem seis abas.

> ⚠️ Ao construir o diálogo, use `<ConteudoDialogo>`, não `<DialogContent>` (`CLAUDE.md`
> §7.11) — este projeto desligou Esc e clique-fora, e modal sem teto de altura prende a
> pessoa na tela.

---

## 8. O que NÃO entra nesta rodada

- ❌ Ligar conversa de WhatsApp a contato de fábrica *(decisão 1 separou os dois mundos; se
  o uso cobrar, volta como rodada própria)*
- ❌ Contato compartilhado entre fábricas *(§3.1)*
- ❌ Importar contatos de fábrica por planilha
- ❌ Histórico de interação com contato de fábrica
- ❌ Derrubar as colunas antigas *(§6 — é o passo 2, depois do site publicado)*

---

## 9. Critério de pronto

1. Uma fábrica aceita quatro contatos com funções diferentes, e a ficha os mostra agrupados.
2. O cartão mostra o principal e a contagem dos demais.
3. Marcar outro como principal desmarca o anterior — e o banco **recusa** dois principais na
   mesma fábrica, mesmo que duas pessoas salvem ao mesmo tempo.
4. Renomear uma função muda o rótulo em todos os contatos que a usam.
5. Apagar uma função **não apaga** contato nenhum: eles ficam sem função.
6. Apagar a fábrica leva os contatos junto.
7. Empresa nova nasce com as cinco funções; as 10 existentes recebem as mesmas por backfill.
8. Um membro comum da empresa consegue tudo isso. Uma empresa **bloqueada por falta de
   pagamento**, não.
9. Os 9 contatos de hoje aparecem como principais, e nenhuma fábrica perde o telefone que
   tinha.
