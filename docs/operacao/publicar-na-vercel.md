# Publicar o site

> ✅ **Enviar para o `main` publica.** Desde 24/08/2026, commit no `main` vira site no ar em
> cerca de 30 segundos, sem ninguém rodar comando nenhum. O ✓ ou ✗ ao lado do commit no
> GitHub é o resultado da publicação.

---

## Os dois dias em que não publicou, e o diagnóstico errado

Entre 22 e 24/08/2026 a publicação foi manual. O motivo escrito aqui na época — e repetido
no `CLAUDE.md`, no `README.md` e em três conversas — era:

> ~~"O plano gratuito da Vercel não **conecta** repositório que pertence a uma organização
> do GitHub."~~

**Isso é falso.** A conexão existia o tempo todo e disparava a cada commit. O que ela
recebia de volta era esta recusa, que estava em `commits/<sha>/status` da API do GitHub —
o ✗ vermelho ao lado de cada commit, que ninguém tinha aberto:

```
Cannot deploy from a private GitHub organization repository on the Hobby plan
```

A palavra que decide é **privado**, não "organização". O plano gratuito conecta repositório
de organização normalmente; ele se recusa a **publicar** quando esse repositório é privado.

O conserto foi tornar o repositório público, em 24/08/2026. Sem plano pago, sem reconectar
nada: as duas verificações que devolviam `failure` passaram a devolver
`success | Deployment has completed`.

### O erro de método, que é o que vale guardar

Três diagnósticos furados saíram do mesmo hábito: **ler ausência de informação como
informação.** O `vercel project inspect` não mostra bloco de Git, e isso foi lido como "não
há repositório conectado". O comando que respondeu de primeira foi o mais óbvio — tentar
conectar e escutar a resposta:

```bash
npx vercel git connect
# > Repply-Hub/Repply-CRM is already connected to your project.
```

Quando um lado diz "está tudo certo" e o resultado não aparece, **procure onde o outro lado
registra a recusa** — aqui, o status do commit no GitHub.

---

## 🔴 A Vercel do desenvolvedor anterior continua ligada

Cada commit dispara **duas** publicações, em duas contas:

| Verificação no commit | Conta |
|---|---|
| `Vercel – repply-crm` | `vercel.com/repply1` — a da Repply, serve `crm.repplyhub.com.br` |
| `Vercel – repply` | `vercel.com/arthurclimb` — **a do desenvolvedor anterior** |

Enquanto o repositório era privado, as duas falhavam. Agora as duas publicam com sucesso: a
conta do desenvolvedor anterior mantém uma cópia do CRM no ar, atualizada a cada commit.
Titularidade pendente — decisão do Lucas, não desconecte por conta própria.

> ⚠️ **O plano gratuito da Vercel veda uso comercial.** O Repply CRM é um SaaS com cliente
> pagante, então hoje o uso está fora dos termos e a Vercel pode suspender o projeto sem
> aviso. Isso é decisão de negócio, não técnica — está registrado aqui para não virar
> surpresa. As alternativas (Vercel Pro ou Cloudflare Pages, que permite uso comercial no
> plano grátis) estão comparadas em [`migrar-hospedagem.md`](migrar-hospedagem.md).

---

## Uma vez só, por máquina

> Só faz falta para o caminho manual da seção seguinte. Para o uso normal — commitar e
> deixar publicar sozinho — não é preciso instalar nem configurar nada.

```bash
npx vercel login
```

Abre o navegador para você entrar na conta da Repply. **Só você faz isso** — não é passo de
assistente nem de script.

```bash
npx vercel link
```

Liga esta pasta ao projeto da Vercel. Ele pergunta a conta e o projeto; escolha o projeto
existente do Repply CRM, **não crie um novo** — criar outro perde o domínio, as variáveis e
o histórico de versões.

Isso cria uma pasta `.vercel/` local, que **não vai para o repositório** (está no
`.gitignore`): ela guarda o vínculo da sua máquina com o projeto.

---

## Publicar à mão — só para o que NÃO está commitado

Em uso normal isto não é necessário: o `git push` já publica. O comando serve para provar
alguma coisa antes de commitar, ou se a publicação automática cair.

> ⚠️ **Nunca publique da pasta de trabalho quando houver outra sessão codando nela.** O
> `vercel --prod` manda o **disco**, não o commitado — sobe junto o que a outra sessão
> deixou pela metade. Publique de uma cópia limpa:
>
> ```bash
> git clone --local . /tmp/publicar && cd /tmp/publicar && npm ci
> ```
>
> E **apague o `.env` antes de mandar**: o `.env` das máquinas de desenvolvimento não tem
> `VITE_GOOGLE_MAPS_API_KEY`, e o site iria ao ar sem mapa e sem posicionamento das obras,
> sem nenhum erro aparecer.

### O comando

```bash
npx vercel --prod
```

É isso. O comando envia o código, a Vercel constrói e publica.

### Por que a Vercel constrói, e não a sua máquina

Existe um jeito de construir aqui e mandar pronto (`vercel build` + `vercel deploy
--prebuilt`). **Não use.**

O `.env` desta máquina tem 4 variáveis; a construção de produção precisa de mais. Falta
`VITE_GOOGLE_MAPS_API_KEY`, usada em `src/components/obras/MapaObras.tsx:33` e
`src/hooks/use-geocode-obras.ts:29`. Construir aqui publicaria um site **sem o mapa e sem o
posicionamento das obras**, sem nenhum erro aparecer no caminho.

Deixando a Vercel construir, ela usa as variáveis configuradas no projeto dela, que estão
completas.

> Se um dia alguém quiser mesmo construir localmente, o pré-requisito é ter as **cinco**
> variáveis `VITE_` do [`.env.example`](../../.env.example) preenchidas nesta máquina — e
> `SUPABASE_SERVICE_ROLE_KEY` **nunca** entra num arquivo que vira build.

---

## Depois de publicar, confira

A publicação demora de 1 a 2 minutos. Não confie no "pronto" do terminal: abra o site.

| O que conferir | Por quê |
|---|---|
| A tela que você mexeu está diferente | O óbvio, e o que mais se esquece |
| O mapa de uma obra carrega | Denuncia build feita sem a chave do Maps |
| Um link direto abre (`/clientes`) | Denuncia problema na regra de reescrita do `vercel.json` |
| Nada de "saiu versão nova" em loop | Denuncia arquivo de código faltando |

Se algo estiver errado, a Vercel guarda as versões anteriores: dá para voltar por lá em um
clique, sem mexer no código.

---

## Erros comuns

**"Commitei e não vejo a mudança."** Você não publicou. Rode `npx vercel --prod`.

**"Pede login toda vez."** O `vercel login` vale por máquina e por usuário do sistema. Se
você trocou de máquina ou de usuário, refaça.

**"Criei um projeto novo por engano no `vercel link`."** Apague o projeto criado no painel
da Vercel, apague a pasta `.vercel/` local e refaça o `link` escolhendo o projeto certo.

**"O comando publicou, mas o domínio não mudou."** `--prod` publica na produção do projeto
ligado. Se o domínio aponta para outro projeto, o `link` foi feito no lugar errado.

---

## O que isto NÃO resolve

**As funções de servidor do Supabase continuam sendo outro caminho.** `npx vercel --prod`
publica o site. As funções em `supabase/functions/` são publicadas no Supabase, à parte —
alterar uma delas e só publicar o site deixa a versão antiga rodando.
