# Colocar no ar — passo a passo

Tudo que foi feito está **apenas na sua máquina**: 62 arquivos, nenhum commit. Nada afeta
produção até você publicar.

São quatro blocos. Eles **não são totalmente independentes** — respeite a ordem:

| Bloco | O que resolve | Depende de | Risco |
|---|---|---|---|
| 1. Funções do WhatsApp | Prepara a correção do erro que você viu | — | Baixo |
| 2. Segurança do banco | Hoje qualquer usuário logado vira administrador | — | Baixo |
| 3. Site público + correções no app | Landing, cadastro e as mensagens de erro do WhatsApp | Bloco 1 | Médio |
| 4. Cobrança | Começar a cobrar R$ 2.997/mês | **Bloco 3** | Alto |

> **Não publique o Bloco 3 sem o Bloco 1**, e **não faça o Bloco 4 sem o Bloco 3**. Os motivos
> estão no início de cada um.

Pré-requisito:

```sh
supabase login
supabase link --project-ref hukeirrmsoiowvvrhivx
```

---

## Antes de qualquer alteração no banco

Confirme que existe backup recente: painel do Supabase → **Database → Backups**. Ou gere um:

```sh
supabase db dump -f backup-antes-das-mudancas.sql
```

E veja o que está pendente de aplicar — **o comando de aplicar sobe tudo que ainda não foi
aplicado, não só os arquivos novos**, e esta pasta tem mais de 100 migrations, várias criadas
fora do repositório:

```sh
supabase migration list
```

Se aparecer algo além das três de `20260803`, **pare e me avise** antes de continuar.

Guarde também o estado atual das permissões, para poder comparar depois (SQL Editor):

```sql
select polname, pg_get_expr(polqual, polrelid) as usando,
       pg_get_expr(polwithcheck, polrelid) as gravando
from pg_policy where polrelid = 'public.usuarios'::regclass;
```

---

## Bloco 1 — Publicar as funções do WhatsApp

```sh
supabase functions deploy whatsapp-send
supabase functions deploy whatsapp-send-reaction
supabase functions deploy whatsapp-delete-message
supabase functions deploy whatsapp-contact-rename
supabase functions deploy whatsapp-contact-photo
supabase functions deploy whatsapp-group-create
supabase functions deploy whatsapp-group-participants
supabase functions deploy whatsapp-participant-photo
supabase functions deploy whatsapp-provision
supabase functions deploy whatsapp-admin-provision
```

**Visualmente nada muda ainda.** A mensagem de erro em português só aparece com o Bloco 3, que
é onde está a parte do app que sabe ler a resposta. O que este bloco entrega agora é **rastro
do motivo no banco** — antes, os erros mais comuns não deixavam registro nenhum:

```sql
select created_at, payload from public.webhook_debug
where payload ? '_envio_recusado' order by created_at desc limit 20;
```

**Descobrir a causa do erro que você viu:**

```sql
select u.email, c.instance_name, c.status, c.provisionada
from public.usuarios u
left join public.wapi_instancia_usuarios iu on iu.usuario_auth_id = u.user_id
left join public.configuracoes_wapi c on c.id = iu.instancia_id
where u.email = 'EMAIL_DE_QUEM_VIU_O_ERRO';
```
Se `status` não for `connected`, era isso: a conexão caiu e a tela não percebeu.

---

## Bloco 2 — Fechar as falhas de segurança

Hoje **qualquer pessoa logada consegue virar administrador** por dois caminhos. É anterior a
este trabalho e vale corrigir mesmo que você nunca vá cobrar.

Para aplicar **só** a migration de segurança agora, tire as de cobrança da pasta — guardando
dentro do repositório, para elas não ficarem de fora do commit do Bloco 3:

```sh
mkdir -p supabase/_migrations-adiadas
mv supabase/migrations/20260803121000_billing_planos_e_assinaturas.sql supabase/_migrations-adiadas/
mv supabase/migrations/20260803122000_gate_plano_escrita.sql supabase/_migrations-adiadas/

supabase db push
```

(Se for fazer o Bloco 4 junto, pule o `mv` e aplique as três de uma vez.)

**Conferir** — no SQL Editor:

```sql
-- tem que aparecer usuarios_update COM a coluna "gravando" preenchida
select polname, pg_get_expr(polqual, polrelid) as usando,
       pg_get_expr(polwithcheck, polrelid) as gravando
from pg_policy where polrelid = 'public.usuarios'::regclass;

-- tem que listar trg_impedir_auto_escalacao_usuario
select tgname from pg_trigger
where tgrelid = 'public.usuarios'::regclass and not tgisinternal;
```

**Efeito colateral esperado, não é defeito:** ninguém consegue mais alterar o próprio nível de
acesso nem se auto-remover em Configurações → Usuários. Hoje isso falha **sem mensagem na
tela** (a tela não trata esse erro), então quem tentar vai achar que travou. É o comportamento
correto. Editar nome, telefone e foto do próprio perfil continua funcionando normalmente.

---

## Bloco 3 — Site público e correções no app

**Faça o Bloco 1 antes deste.** O app novo passa a ler a resposta das funções; se as funções
antigas ainda estiverem no ar, o usuário troca uma mensagem técnica em inglês por outra.

**Este é o bloco que muda a vida de quem já usa:** o endereço principal deixa de abrir o
sistema e passa a mostrar a página de vendas; o sistema vai para `/app`. Quem está logado é
levado para lá automaticamente e a barra lateral se corrige sozinha. Avise a equipe.

```sh
git pull
git checkout -b landing-e-cobranca
npm run test && npm run build   # confirme que passam antes de commitar
git add -A
git commit -m "feat: landing page pública, cadastro com paywall e correção dos erros do WhatsApp"
git push -u origin landing-e-cobranca
```

Abra o Pull Request. **Antes de juntar na branch principal, confirme no painel da Vercel qual
branch é a de produção** — não há nada no repositório que comprove o deploy automático, e o
README ainda menciona publicação pelo Lovable.

Teste no endereço de pré-visualização que a Vercel cria:

- Entrar no sistema leva ao funil, não à página de vendas.
- **Com uma conta que já tenha a barra lateral personalizada**, conferir que "Negócios" abre o
  sistema. É o caso que mais importa.
- Criar e salvar um negócio: tem que voltar para o funil.
- Sair leva à **tela de login** (não à página de vendas — só a saída pela tela de assinatura vai
  para a landing).
- Uma mensagem de WhatsApp que falhe mostra o motivo em português, uma vez só.

> O paywall **não** liga aqui. Ele nasce desligado e só é ativado no Bloco 4.

---

## Bloco 4 — Começar a cobrar

**Pré-requisito obrigatório: o Bloco 3 já publicado em produção.** A tela `/assinar` só existe
nele. Sem ela, uma empresa nova nasce sem plano, é bloqueada pelo banco e **não tem nenhuma
tela onde pagar**.

Detalhes em [COBRANCA_STRIPE.md](COBRANCA_STRIPE.md). A ordem:

**1. Aplicar as migrations de cobrança**

```sh
mv supabase/_migrations-adiadas/*.sql supabase/migrations/   # se você adiou no Bloco 2
supabase migration list                                       # confira o que falta
supabase db push
```

Confira **imediatamente** que ninguém foi trancado do lado de fora:
```sql
select origem, plan_status, count(*) from empresa_assinaturas group by 1,2;
select count(*) from empresas;
```
Os números têm que bater, com tudo em `legacy` / `active`.

**Atenção à janela:** a partir daqui, empresa nova nasce sem plano e recebe um erro técnico ao
tentar salvar cliente ou negócio — porque o aviso amigável só aparece depois do passo 6. Se for
cadastrar cliente novo nesse intervalo, libere na mão:
```sql
update public.empresa_assinaturas set plan_status='active', origem='legacy'
where empresa_id = 'ID_DA_EMPRESA';
```
O mesmo vale se você criar uma empresa direto pelo painel do Supabase: ela nasce bloqueada.

**2. Configurar o Stripe em modo de TESTE** — produto de R$ 2.997 recorrente mensal, webhook,
portal do cliente e chave restrita. Gravar o preço:
```sql
update public.planos set stripe_price_id = 'price_...' where slug = 'lancamento';
```

**3. Secrets e funções (teste)**
```sh
supabase secrets set STRIPE_SECRET_KEY=rk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets list
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
```
No painel → Edge Functions → `stripe-webhook`, confirme **"Verify JWT: disabled"**. Se estiver
ligado, o pagamento é aprovado e ninguém é liberado, sem nenhum sinal.

**4. Testar** com o cartão `4242 4242 4242 4242` e conferir que a assinatura virou ativa.

**5. Repetir tudo em modo REAL** — é o passo que falta na maioria dos roteiros e sem ele
ninguém consegue pagar de verdade:
- Criar o mesmo produto e preço em modo live e atualizar `planos.stripe_price_id` com o novo id.
- Recriar o webhook em live (o segredo é outro) e uma chave restrita live.
- `supabase secrets set STRIPE_SECRET_KEY=rk_live_...` e `STRIPE_WEBHOOK_SECRET=whsec_...`
- Publicar as três funções de novo e fazer **uma cobrança real** de verificação.

**6. Só então ligar o paywall:** na Vercel, criar `VITE_PAYWALL_ATIVO=true` e **fazer novo
deploy** — o valor é fixado na compilação, salvar no painel não basta. Desligar também exige
novo deploy.

---

## Se algo travar

```sql
-- liberar uma empresa específica
update public.empresa_assinaturas set plan_status='active', origem='legacy'
where empresa_id = 'ID_DA_EMPRESA';

-- emergência: desligar o bloqueio por plano em todo o sistema
drop policy if exists pedidos_exige_plano_insert  on public.pedidos;
drop policy if exists pedidos_exige_plano_update  on public.pedidos;
drop policy if exists clientes_exige_plano_insert on public.clientes;
drop policy if exists clientes_exige_plano_update on public.clientes;
drop policy if exists contatos_exige_plano_insert on public.contatos;
drop policy if exists contatos_exige_plano_update on public.contatos;
drop policy if exists obras_exige_plano_insert    on public.obras;
drop policy if exists obras_exige_plano_update    on public.obras;
```

Reverter o site é mais simples: na Vercel, **Deployments → o anterior → Promote to Production**.

---

## O que ainda depende de você

- **Domínio público definitivo.** Removi uma etiqueta do site que apontava para o endereço
  antigo de testes e atrapalharia o Google. Ela volta quando o domínio estiver definido.
- **Imagem de compartilhamento.** Ao mandar o link no WhatsApp, ainda aparece a arte com a
  marca antiga (`mdrepresentações`), hospedada num serviço de terceiros. Trocar junto com o
  domínio.
- **Chave do Supabase para desenvolver na sua máquina.** O `.env.local` tem uma chave de
  exemplo: as telas públicas abrem, mas o login não funciona. Troque pela chave real em
  Settings → API → `anon public`.
- **Não regenere `src/integrations/supabase/types.ts` antes do Bloco 4** — as tabelas novas
  foram escritas à mão e sumiriam. Depois de aplicar as migrations, regenerar é seguro.
