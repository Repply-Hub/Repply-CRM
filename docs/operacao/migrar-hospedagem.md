# Migrar a hospedagem — da Vercel da agência para a Repply

> **Estado: a migração ACONTECEU, por outro caminho.** Este documento nasceu em 21/08/2026
> comparando as opções de hospedagem, e recomendava a Cloudflare Pages. O Lucas decidiu
> **ficar na Vercel, na conta da Repply** — decisão dele, tomada com a comparação em mãos.
>
> O que valeu na prática, em 22/08/2026: repositório transferido para `Repply-Hub/Repply-CRM`
> e projeto Supabase movido para a organização da Repply. A hospedagem saiu da conta
> `arthurclimb` (da agência) e foi para a Vercel da Repply.
>
> **Consequência que pegou todo mundo de surpresa:** o plano gratuito da Vercel **não conecta
> repositório de organização**. A publicação automática a cada envio deixou de existir e virou
> passo manual. Isso está em [`CLAUDE.md` §16](../../CLAUDE.md) e no passo a passo de
> [`publicar-na-vercel.md`](publicar-na-vercel.md).
>
> **O que continua útil aqui:** a comparação entre os ambientes (capítulo 2), o que quebra ao
> trocar de domínio (capítulo 3) e a ressalva de que o plano gratuito veda uso comercial — o
> Repply CRM tem cliente pagante. Ver [`divida-tecnica.md` §2](../divida-tecnica.md).

---

## 1. O que este sistema realmente precisa de um servidor

Antes de escolher, o fato que decide: **o Repply CRM não tem servidor de aplicação.**

Medido em 21/08/2026:

| | |
|---|---|
| Dependências de servidor (Express, Next, Nest…) | **nenhuma** |
| Funções rodando na hospedagem | **nenhuma** — o `vercel.json` só reescreve rota e ajusta cache |
| Funções de servidor do produto | **40, todas no Supabase** |
| Banco de dados | Supabase |
| Build | 4,7 MB · **1,4 MB** comprimido |
| Primeira visita de um usuário | **~315 KB** comprimidos |

A hospedagem faz **uma coisa só**: entregar uma pasta de arquivos prontos por HTTPS. Com 4 TB
de tráfego mensal isso dá ordem de **13 milhões de visitas** — três ordens de grandeza acima
de qualquer cenário do produto hoje.

**Consequência prática:** a escolha da hospedagem quase não afeta desempenho. O gargalo do
Repply é o Supabase, onde vivem os 11.906 negócios, as políticas de segurança por linha e as
consultas pesadas. Trocar de host não acelera nem desacelera nada disso.

---

## 2. Vercel, Cloudflare Pages ou servidor próprio

### "Vercel é melhor para Next.js e SaaS" — verdade, e não se aplica aqui

O que a Vercel faz de melhor no mercado é **renderização no servidor, funções sem servidor
coladas na aplicação e middleware na borda**. São exatamente as coisas que um app Next.js
precisa e que este projeto **não usa**: ele é Vite, gera arquivos estáticos, e todo o código
de servidor já mora no Supabase.

"SaaS" naquele conselho quer dizer "SaaS feito em Next.js" — é sobre a arquitetura, não sobre
o modelo de negócio. Cobrar assinatura não muda o que a hospedagem precisa entregar.

### A comparação honesta

| | Cloudflare Pages | Vercel | Servidor próprio (VPS) |
|---|---|---|---|
| Publica a cada envio ao GitHub | sim | sim | você monta |
| HTTPS automático e renovado | sim | sim | você instala e renova |
| Entrega global (arquivo vem de perto) | sim | sim | não, sem CDN na frente |
| Voltar versão anterior | um clique | um clique | você reconstrói |
| Prévia de cada branch | sim | sim | você monta |
| Atualização de segurança do sistema | não existe pra você | não existe pra você | **sua, para sempre** |
| Uso comercial no plano grátis | **permitido** | **proibido** (exige Pro) | n/a |
| Custo | grátis | ~US$ 20/membro/mês | ~R$ 30–50/mês fixo |

> Confirme preços e limites antes de decidir — mudam com o tempo.

### Quando a resposta vira "Vercel"

Só há dois motivos legítimos, e nenhum vale hoje:

1. **Se o Repply CRM for reescrito em Next.js.** Aí a Vercel deixa de ser conveniência e
   passa a ser a casa natural do framework.
2. **Se a Repply quiser uma plataforma só para todos os produtos** e os outros forem Next.js.

### Quando a resposta vira "servidor próprio"

Quando o servidor for servir **mais de uma coisa**. Um VPS pago uma vez, hospedando o site
institucional, uma ferramenta interna e o CRM, ganha da soma de assinaturas. Para um produto
só, e estático, não ganha — e cobra em plantão: certificado que vence, backup que ninguém
testa até precisar, disco que enche, e quem levanta às três da manhã é você.

> **Se a Repply já opera um VPS para outro produto**, some esta opção às duas de cima: a
> consolidação passa a valer, porque a conta do plantão já está sendo paga.

**A recomendação original deste documento era a Cloudflare Pages.** O Lucas escolheu a
Vercel da Repply, e a escolha não prende: sair depois é questão de horas, porque o que se move
é uma pasta de arquivos que o `npm run build` reconstrói em 20 segundos.

O que a escolha custou, e vale ter escrito: o plano gratuito da Vercel não conecta repositório
de organização, então **a publicação virou manual** (`CLAUDE.md` §16). Na Cloudflare Pages a
publicação automática funcionaria com repositório de organização e sem custo. Se um dia o
passo manual incomodar, as duas saídas são: pagar o plano da Vercel, ou revisitar este
capítulo.

---

## 3. O que quebra ao trocar de domínio — leia antes de qualquer passo

**É aqui que migração dá errado, não no arquivo.** O app em si se adapta: o único redirecionamento
do frontend usa `window.location.origin` (`src/pages/EsqueciSenha.tsx:22`), então ele acompanha
o domínio sozinho. O que **não** se adapta são os serviços externos, que guardam o endereço do
lado deles.

### 3.1 `APP_URL` nas funções do Supabase — o mais perigoso

Três integrações montam URLs de retorno a partir de uma variável `APP_URL` guardada **no
Supabase**, não na hospedagem:

| Função | O que quebra se `APP_URL` ficar velha |
|---|---|
| `stripe-checkout` | **quem pagar volta para o endereço errado** depois do cartão |
| `stripe-portal` | idem, ao gerenciar a assinatura |
| `email-callback` | a caixa CONECTA, mas o navegador cai no site velho no fim |
| `gmail-callback` (legado) | idem, no caminho antigo |

> **Correção de uma versão anterior deste documento:** ele dizia que conectar caixa de e-mail
> pararia de funcionar. **Não para.** O endereço de retorno do OAuth é montado a partir de
> `SUPABASE_URL` (`_shared/nylas.ts:53`), que é fixo — o provedor devolve para o Supabase. O
> `APP_URL` só decide para onde o navegador é mandado **depois**. Menos grave do que estava
> escrito, e ainda assim ruim.

O `stripe-checkout` monta `success_url` e `cancel_url` com ela (`index.ts:143-144`). Cliente
novo assinando e caindo numa página morta é o pior jeito de descobrir isso.

**Ação:** atualizar `APP_URL` nos segredos do projeto Supabase **no mesmo momento** da virada
de domínio.

> **Situação em 22/08/2026: nada a fazer.** O `APP_URL` está em `https://crm.repplyhub.com.br`
> — o domínio próprio, não um endereço temporário de hospedagem. Confirmado comparando o
> SHA256 que o painel exibe. Domínio próprio não muda quando se troca de hospedagem: só se
> reaponta o DNS. **A regra que fica: só há problema se o `APP_URL` apontar para um endereço
> `.vercel.app` ou equivalente.**

### 3.2 Endereços autorizados de login no Supabase

O Supabase só aceita redirecionar o login para endereços que estejam na lista de permitidos
(*Site URL* e *Redirect URLs*, em Authentication → URL Configuration). Domínio novo fora da
lista = **recuperação de senha e confirmação de e-mail param**, sem erro claro.

**Ação:** acrescentar o domínio novo **antes** da virada, mantendo o antigo até desligar.

### 3.3 Restrição de origem da chave do Google Maps

Se a chave (`VITE_GOOGLE_MAPS_API_KEY`) tiver restrição por endereço de origem, o mapa some
no domínio novo.

**Ação:** acrescentar o domínio novo à lista de origens permitidas no Google Cloud.

### 3.4 Nylas e Stripe, do lado deles

Nylas guarda a URL de retorno no aplicativo cadastrado; Stripe guarda endpoints de webhook.
Confirme os dois nos painéis.

---

## 4. As variáveis do build

Só quatro chegam ao navegador. Elas são **embutidas no arquivo publicado** — tudo que tem
prefixo `VITE_` é público por definição.

| Variável | Para quê |
|---|---|
| `VITE_SUPABASE_URL` | endereço do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave pública (a que respeita as regras de segurança por linha) |
| `VITE_GOOGLE_MAPS_API_KEY` | mapas |
| `VITE_PAYWALL_ATIVO` | liga/desliga o portão de assinatura |

> 🔴 **`SUPABASE_SERVICE_ROLE_KEY` NÃO entra aqui.** Ela ignora todas as regras de segurança
> do banco. Não tem prefixo `VITE_`, então o build não a embute — mas não a configure na
> hospedagem mesmo assim. O lugar dela é nos segredos do Supabase, junto das funções.

---

## 5. Passo a passo

### Passo 1 — Publicar sem trocar o domínio

No painel da Cloudflare Pages, conectar o repositório da organização da Repply e configurar:

| Campo | Valor |
|---|---|
| Comando de build | `npm run build` |
| Pasta de saída | `dist` |
| Versão do Node | 20 ou superior |

Cadastrar as quatro variáveis `VITE_` do item 4.

O resultado é um endereço `<projeto>.pages.dev` funcionando em paralelo, **sem tocar no que
está no ar**. Nada de risco até aqui.

### Passo 2 — Traduzir o `vercel.json`

O `vercel.json` faz duas coisas, e as duas precisam de equivalente. **Não deixe para depois:**
a segunda protege contra um defeito que já aconteceu neste projeto (`CLAUDE.md` §7.6).

**Arquivo `public/_headers`** — o cache:

```
/assets/*
  Cache-Control: public, max-age=604800

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/
  Cache-Control: public, max-age=0, must-revalidate
```

**Arquivo `public/_redirects`** — o roteamento:

```
/assets/*  /assets/:splat  404
/*         /index.html     200
```

A segunda linha é o que faz link direto (`/clientes`, `/pedidos/:id/editar`) funcionar num app
de página única. **A primeira linha é a parte que ninguém lembra e que já custou caro aqui:**
sem ela, um arquivo de código que não existe mais devolve a página inteira com status de
sucesso, e o navegador guarda página no lugar de código — com cura só por limpeza manual de
cache no computador de cada usuário.

> ⚠️ **Eu não consegui verificar daqui se a Cloudflare Pages aceita `404` como status no
> `_redirects`.** O passo 4 tem o teste que resolve isso. Se não aceitar, a alternativa é uma
> Function de roteamento — mas **teste antes de virar o domínio**, porque este é o erro que
> não dá para consertar do lado do servidor depois.

### Passo 3 — Preparar os serviços externos

Ainda sem trocar nada de lugar, **acrescentar** (não substituir) o domínio novo em:

- Supabase → Authentication → URL Configuration → *Redirect URLs*
- Google Cloud → restrições de origem da chave do Maps
- Nylas → URL de retorno do aplicativo
- Stripe → endpoints de webhook

Manter o domínio antigo em todos, para os dois funcionarem durante a virada.

### Passo 4 — Verificar no endereço `.pages.dev` antes de virar

Este passo é o que separa uma migração de um incidente.

| O que testar | Como | Esperado |
|---|---|---|
| **A armadilha do `/assets`** | abrir `/assets/nao-existe-123.js` | **404**, nunca a página com status 200 |
| Link direto | abrir `/clientes` e `/negocios` direto na barra | a tela carrega, sem 404 |
| Login | entrar com um usuário de teste | entra |
| Recuperar senha | pedir o e-mail de redefinição | o link chega e abre no domínio certo |
| Dashboard | período em agosto/2026, MD Representações | R$ 1.009.359,42 · 45 fechados · R$ 22.430,21 · 57% |
| Mapa | abrir uma obra com endereço | o mapa aparece |
| WhatsApp | abrir uma conversa | histórico carrega |

Só siga quando os sete passarem.

### Passo 5 — Virar o domínio

1. **Um dia antes**, baixar o TTL do DNS para 300 segundos. É o que encurta a janela de
   inconsistência.
2. Acrescentar o domínio no projeto da Cloudflare Pages e apontar o DNS.
3. **Atualizar `APP_URL` nos segredos do Supabase** — item 3.1. Fazer isto **junto** com a
   virada, não antes nem depois.
4. **Não desligar a Vercel.** Enquanto o DNS propaga, parte dos usuários ainda cai lá, e um
   sistema no ar é melhor que dois pela metade.
5. Repetir o passo 4 no domínio real.
6. Só então desligar a Vercel — sugestão: **uma semana depois**, sem pressa.

### Passo 6 — Limpar

- Remover `vercel.json` do repositório **só depois** de desligar a Vercel
- Tirar o domínio antigo das listas do item 3, se ele deixar de existir
- Atualizar `README.md` e [`colocar-no-ar.md`](colocar-no-ar.md) com a hospedagem nova
- Marcar o item 2 da dívida técnica conforme o que ficou resolvido

---

## 6. Como voltar atrás

Até o passo 5, não há o que desfazer: são dois sistemas no ar em paralelo.

Depois do passo 5, voltar é apontar o DNS de volta para a Vercel e restaurar o `APP_URL`
antigo no Supabase. Com TTL em 300 segundos, isso leva minutos.

**Nada de dado se move nesta migração.** O banco continua onde está, os usuários continuam
onde estão, os arquivos anexados continuam no Storage do Supabase. O que muda de lugar é uma
pasta de 4,7 MB que o `npm run build` reconstrói do zero em 20 segundos. É por isso que esta
é uma das mudanças de infraestrutura menos arriscadas que existem — desde que os itens do
capítulo 3 sejam feitos.

---

## 7. O que é mais urgente que isto

A hospedagem move arquivos reconstruíveis. **O projeto Supabase, não.** Ele segue em
organização de terceiro (`divida-tecnica.md` §2) e é onde vivem os dados dos clientes: 11.906
negócios, 1.305 clientes, as conversas de WhatsApp e os anexos.

Se houver energia para uma transferência de infraestrutura por vez, a do Supabase vale mais.
