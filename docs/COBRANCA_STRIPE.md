# Cobrança — o que precisa ser feito fora do código

O código da Fase 3 está pronto, mas nada cobra ninguém até estes passos serem
executados. A ordem importa.

---

## 1. Aplicar as migrations

```sh
supabase db push
```

Sobem três arquivos, nesta ordem:

| Arquivo | O que faz |
|---|---|
| `20260803120000_blindagem_rls_usuarios.sql` | Fecha os dois caminhos de escalada de privilégio |
| `20260803121000_billing_planos_e_assinaturas.sql` | Cria `planos`, `empresa_assinaturas` e `stripe_eventos` |
| `20260803122000_gate_plano_escrita.sql` | Exige plano ativo para gravar dados |

**Verificação imediata depois do push** — todas as empresas atuais precisam ter
entrado como ativas, senão a base fica trancada:

```sql
select origem, plan_status, count(*)
from empresa_assinaturas
group by 1, 2;
-- Esperado: uma linha 'legacy' / 'active' com o total de empresas existentes.

select count(*) from empresas;  -- tem que bater com o número acima
```

**Teste de segurança**, logado como um vendedor comum (não admin), no console do
navegador. Os dois têm que falhar:

```js
await supabase.from('usuarios').update({ role: 'admin' }).eq('user_id', (await supabase.auth.getUser()).data.user.id)
await supabase.rpc('restaurar_usuario_por_email', { p_email: 'seu@email.com', p_nome: 'x', p_role: 'admin', p_empresa_id: null })
```

---

## 2. Configurar o Stripe

Faça tudo primeiro em **modo de teste**. O painel tem uma chave para alternar.

1. **Produto e preço.** Products → Add product: nome "Repply — Plano de
   Lançamento", preço **R$ 2.997,00**, **recorrente mensal**, moeda BRL.
   Copie o ID do preço (começa com `price_`) e grave no banco:

   ```sql
   update public.planos
   set stripe_price_id = 'price_...'
   where slug = 'lancamento';
   ```

   Sem isso o checkout responde `sem_price_id` e não abre.

2. **Webhook.** Developers → Webhooks → Add endpoint:

   ```
   https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/stripe-webhook
   ```

   Eventos a assinar:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

   Copie o **signing secret** (começa com `whsec_`).

3. **Portal do cliente.** Settings → Billing → Customer portal: ative e permita
   trocar cartão, ver faturas e cancelar. Sem isso o botão "Gerenciar
   assinatura" retorna erro.

4. **Chave restrita.** Developers → API keys → Create restricted key. Permissões
   de escrita em Customers, Checkout Sessions e Billing Portal; leitura em
   Subscriptions, Products, Prices e Invoices. Uma chave dedicada importa porque
   a conta pode ser compartilhada com outros produtos — todos os objetos criados
   aqui levam `metadata.app = "repply"`, e o webhook ignora o que não for dele.

---

## 3. Secrets e deploy das funções

```sh
supabase secrets set STRIPE_SECRET_KEY=rk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# APP_URL já existe (o retorno do OAuth do Gmail usa). Confira que aponta para o
# domínio público e SEM barra no final — ela vira o destino de volta do checkout.
supabase secrets list

supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
```

O `config.toml` já marca **apenas** o `stripe-webhook` com `verify_jwt = false`:
o Stripe não manda JWT do Supabase, e a autenticidade vem da assinatura no
cabeçalho, conferida dentro da função. As outras duas exigem sessão.

---

## 4. Testar antes de ligar

Com tudo no ar e ainda em modo de teste:

1. Crie uma empresa nova pelo cadastro e confirme que ela nasce inativa:
   ```sql
   select plan_status, origem from empresa_assinaturas order by updated_at desc limit 1;
   ```
2. Entre com essa conta, abra `/assinar` e clique em assinar. Use o cartão de
   teste `4242 4242 4242 4242`, validade futura, CVC qualquer.
3. Confirme que o webhook chegou (Developers → Webhooks → o endpoint → tentativas
   recentes, todas com 200) e que o banco mudou:
   ```sql
   select plan_status, subscription_status, plano_slug, current_period_end
   from empresa_assinaturas where empresa_id = '...';
   ```
4. De volta no app, clique em "Já paguei, verificar" — tem que liberar.
5. Teste o cancelamento pelo portal e confirme que o acesso volta a bloquear.

---

## 5. Só então, ligar o paywall

O bloqueio nasce desligado. Para ativar, defina na Vercel:

```
VITE_PAYWALL_ATIVO=true
```

**A variável é fixada no momento do build**, então mudá-la exige um redeploy —
não basta salvar no painel. Pelo mesmo motivo, desligar às pressas também custa
um deploy: não existe interruptor instantâneo.

Antes de ligar, confirme que a barreira do banco está de pé — é ela que vale,
não o redirecionamento da tela. Logado como usuário de uma empresa inativa, isto
tem que falhar:

```js
await supabase.from('clientes').insert({ nome: 'teste' })
```

Se passar, o paywall é só enfeite: quem bloquear uma requisição no navegador
contorna a tela e continua usando o sistema.

---

## Decisões registradas

- **`past_due` não bloqueia.** Quando o cartão falha, o Stripe ainda faz novas
  tentativas por alguns dias. Cortar o acesso na primeira falha gera
  cancelamento em vez de pagamento. Para mudar, é uma linha em
  `STATUS_BLOQUEADOS` (`src/lib/plano-gate.ts`) e outra em `STATUS_LIBERAM`
  (`supabase/functions/stripe-webhook/index.ts`).
- **Leitura continua liberada para inadimplentes.** Só escrita é bloqueada. Um
  cliente que vê os próprios dados sumirem entende como perda de dados, não como
  cobrança pendente.
- **Empresa sem linha de assinatura conta como ativa.** Vale tanto no banco
  quanto na tela. Um erro que libera alguém a mais por algumas horas é muito mais
  barato que um que tranca a base pagante inteira.
- **Assinatura recorrente no Brasil aceita só cartão.** Boleto e PIX não são
  suportados pelo Checkout em modo assinatura; exigiriam fatura avulsa a cada
  ciclo.
