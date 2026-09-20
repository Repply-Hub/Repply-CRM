# E-mail — Grupo 1.5 (3 ajustes de tela) — desenho e plano

> Status: DESENHO APROVADO em 16/09/2026 (Lucas). Só tela; **não toca banco nem função de
> servidor**. Base: `origin/main` = `2265784d` (já com o Grupo 1).

## Decisões do dono do produto (16/09 — não reabrir)
1. **Atalho da assinatura para quem NÃO é gestor**: uma engrenagem no topo da tela de e-mail para
   TODOS. Gestor → abre "Gerenciar caixa" (como hoje, e lá dentro já tem o atalho da assinatura).
   Quem não é gestor → a engrenagem vai DIRETO para `/configuracoes?tab=perfil`. Sem botão novo; a
   tela fica igual para todo mundo. Motivo: a tela de e-mail já é poluída — quanto mais limpa, melhor.
2. **Janela "escrever e-mail" responsiva**: hoje ela não tem teto de altura nem rolagem própria
   (armadilha §7.11 do CLAUDE.md), então em tela menor transborda e o botão Enviar some — obriga a
   diminuir o zoom. Os campos de Cc/Cco do Grupo 1 pioraram. Conserto: usar a peça responsiva da casa
   (`ConteudoDialogo`/`CorpoDialogo` de `src/components/shared/DialogoResponsivo.tsx`) com altura em
   `dvh` e rolagem só no meio; título e botões ficam fixos. Vale para notebook, celular e qualquer zoom.
3. **Mostrar Cc/Cco ao abrir um e-mail** (padrão Gmail):
   - E-mail RECEBIDO: mostrar "Para" (todos) e "Cc" (todos). **Cco nunca** — é oculta por natureza.
   - E-mail ENVIADO por mim: mostrar "Para", "Cc" e "Cco" (o remetente vê a própria cópia oculta).
   Hoje o leitor (`LeitorEmail`, tipo `EmailAberto`) só tem `destinatario` (um) e mostra "De/Para".
   O dado já é gravado em `email_mensagens.cc`/`bcc`/`destinatarios` (jsonb) no recebimento e no envio.

## Plano de implementação (só `src/`)

### T1 — engrenagem para todos (`src/pages/Emails.tsx`)
- Achar o botão de engrenagem do topo (abre `GerenciarCaixaDialog`, hoje sob `podeGerenciarCaixa`,
  região ~2132-2143). Passar a renderizar a engrenagem SEMPRE (na mesma condição em que ela hoje
  aparece — conferir se é `isConnected`; a assinatura é por usuário, mas manter a engrenagem no mesmo
  ponto/condição do gestor para não inventar caso novo). Se `podeGerenciarCaixa` → mantém o clique de
  hoje (abre o diálogo). Senão → `onClick={() => navigate('/configuracoes?tab=perfil')}` (o `navigate`
  já existe no arquivo). Mesmo ícone/tamanho/posição; `title`/`aria-label`: gestor "Gerenciar caixa",
  não-gestor "Configurar assinatura".

### T2 — janela responsiva (`src/components/email/CompositorEmail.tsx`)
- LER antes `src/components/shared/DialogoResponsivo.tsx` para usar a API certa. Trocar o
  `<DialogContent>` cru por `<ConteudoDialogo>` (+ `<CorpoDialogo>` no miolo que rola). Preservar:
  largura ~820px, o cabeçalho `bg-muted border-b` (fica fixo no topo), o rodapé Descartar/Enviar (fixo
  embaixo). O que rola no meio: Para/Cc/Cco/Assunto + corpo + anexos + prévia da assinatura. Manter as
  classes e comentários de contraste já ajustados. Critério: em janela baixa (ex.: 1366x600) o botão
  Enviar continua visível e só o meio rola.

### T3 — Cc/Cco no leitor (`src/pages/Emails.tsx`, `src/components/email/LeitorEmail.tsx`)
- Onde o e-mail aberto vira `EmailAberto` (achar `abrirComCorpo`/`abrirRecebido` e o `.select(...)` da
  linha de `email_mensagens`): incluir `cc`, `bcc`, `destinatarios`. Conferir o FORMATO dessas colunas
  (provável array de `{ email, name? }`, formato Nylas — ver `mensagemParaLinha`/migration
  `20260804121322_email_nylas.sql`); tratar o formato real, não presumir string.
- `EmailAberto` ganha `cc?`, `bcc?`, `destinatarios?` (mesmo tipo do dado). No cabeçalho do leitor
  (~505-660), depois de "Para": linha "Cc: ..." quando houver; linha "Cco: ..." **só** quando
  `email.type === 'sent'` e houver. Reusar a formatação "Nome <email>" e a troca por "mim" já usada em
  "Para". Em "Para", usar a lista `destinatarios` inteira se vier (senão o `destinatario` singular de hoje).

## Verificação (antes de publicar)
- `npx tsc --noEmit -p tsconfig.app.json` — sem erro novo (base 36).
- `npx vitest run` — bateria inteira verde (era 1986), número não cai.
- `npm run build` — compila.
- (Visual é do Lucas, ao vivo — eu não logo.)
