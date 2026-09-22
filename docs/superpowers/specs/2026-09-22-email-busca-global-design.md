# E-mail — Busca global (em todos os e-mails) — Design

**Data:** 2026-09-22
**Pedido do Lucas:** "independente da seção que estiver, quando for fazer uma
busca deve ser em todos os emails" — como o Gmail.

## Problema

Hoje a busca do topo fica presa à **aba** (Recebidos/Enviados/Rascunhos) e ao
**marcador** selecionado: procurar dentro de um marcador (ou em Enviados) só
acha o que está ali. Deveria varrer **tudo**.

## Decisões (fechadas com o Lucas)

1. **Busca unificada.** Com um termo digitado, aparece **uma lista única de
   resultados** com todos os e-mails que casam — **recebidos e enviados, de
   qualquer marcador** —, mais recente primeiro, no lugar das abas.
2. **Resultados simples (abrir ao clicar).** Cada resultado abre a conversa ao
   clicar. **Sem** caixinhas de seleção / excluir-mover em massa dentro dos
   resultados (essas ações seguem nas abas normais). Limpar a busca volta às
   abas/marcadores.
3. **Casa em** assunto, prévia e remetente (nome/e-mail) — os mesmos campos que
   Recebidos já usa hoje. (Buscar e-mail ENVIADO pelo destinatário fica como
   melhoria futura — hoje o enviado casa por assunto/prévia.)

## Design

### Consulta `resultadosBusca` (Emails.tsx)

`useQuery`, habilitada só quando `isConnected && !!buscaAplicada`. Sobre
`email_mensagens`, **ambas as direções**, `excluido = false`, sem filtro de
marcador (varre tudo), `.or(assunto/snippet/remetente_nome/remetente_email ilike)`,
`order data_mensagem desc`, paginada (`pageBusca`, mesmo `PAGE_SIZE`). Devolve o
que a linha precisa para exibir E para abrir (id, direcao, data, assunto,
snippet, remetente, destinatarios, cc, bcc, nylas_message_id, nylas_thread_id,
caixa_origem, lido).

Mesma abordagem `.or(ilike)` da busca atual de Recebidos (não é RPC): o volume de
`email_mensagens` é modesto perto de `pedidos`, e a busca de Recebidos já roda
assim. `pageBusca` reinicia em 0 quando o termo muda.

### Componente `ResultadosBusca` (novo, `src/components/email/ResultadosBusca.tsx`)

Lista simples. Cada item é um botão (clique → `onAbrir(resultado)`):
`[ícone direção] quem   assunto — trecho …                     data   [• não lida]`
- ícone: caixa (recebido) / seta (enviado);
- **quem**: remetente (recebido) ou "Para: destinatários" (enviado) —
  função pura `quemDoResultado(resultado)` testável;
- ponto de não lida quando recebido e `lido === false`.
Paginação simples (anterior/próxima) igual às listas atuais, com o total.

### Abrir um resultado (`abrirResultado` em Emails.tsx)

Monta o `EmailAberto` a partir da linha (recebido ou enviado) e chama
`abrirComCorpo` — o MESMO leitor por conversa. Se for recebido não lido, marca
lido. Reusa `normalizarEnderecos`, `connectedEmail`, `threadsRespondidos`.

### Render

Dentro do `<Tabs>`, no lugar dos `TabsContent`, quando `buscaAplicada` vier:
mostra `<ResultadosBusca>`. A fileira de abas some durante a busca e dá lugar a
um rótulo "Resultados em todos os e-mails" (a caixa de busca continua no
cabeçalho; limpá-la volta às abas). `selectedIds` é zerado ao entrar em busca
(não há seleção em massa nos resultados).

## O que NÃO muda

- As três abas e o filtro de marcador, quando NÃO há busca.
- As consultas de Recebidos/Enviados/Rascunhos (seguem por aba/marcador).
- O leitor por conversa (abrir um resultado abre a conversa como sempre).

## Testes

- `quemDoResultado`: recebido → nome do remetente; enviado → "Para: …".
- `ResultadosBusca`: renderiza itens, mostra "quem" certo, chama `onAbrir`.
- Verificação padrão (§9): `tsc` baseline (36), `vitest` não cai, build.

## Riscos

- Nada de servidor nem de banco: só leitura, com a mesma RLS das listas atuais.
- Não regredir a busca das abas: a `.or()` das consultas de Recebidos/Enviados
  continua como está; a global é uma consulta À PARTE.
