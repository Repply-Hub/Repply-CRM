# Publicar o site — pela linha de comando

> 🔴 **Enviar para o `main` NÃO publica mais nada.** Desde 22/08/2026 a publicação é um
> passo manual, feito por quem enviou o código. Se você commitou e não rodou o comando
> abaixo, **o que você fez não está no ar.**

---

## Por que mudou

Duas coisas aconteceram no mesmo dia:

1. **O repositório mudou de dono.** Saiu de `viniciusgodoy99/mdrepresentacoes` (conta
   pessoal do desenvolvedor anterior) e passou a ser `Repply-Hub/Repply-CRM`. A ligação da
   Vercel apontava para o endereço antigo e se perdeu.
2. **O plano da Vercel é o gratuito**, e ele não conecta repositório que pertence a uma
   organização do GitHub — só a repositório de conta pessoal.

Enquanto não houver plano pago, a saída é publicar pela linha de comando: ela não depende
da ligação com o GitHub.

> ⚠️ **O plano gratuito da Vercel veda uso comercial.** O Repply CRM é um SaaS com cliente
> pagante, então hoje o uso está fora dos termos e a Vercel pode suspender o projeto sem
> aviso. Isso é decisão de negócio, não técnica — está registrado aqui para não virar
> surpresa. As alternativas (Vercel Pro ou Cloudflare Pages, que permite uso comercial no
> plano grátis) estão comparadas em [`migrar-hospedagem.md`](migrar-hospedagem.md).

---

## Uma vez só, por máquina

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

## A cada publicação

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
