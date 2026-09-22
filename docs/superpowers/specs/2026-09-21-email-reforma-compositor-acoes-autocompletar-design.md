# E-mail — Reforma "estilo Gmail": compositor inline, menu de ações, autocompletar de destinatário

Data: 2026-09-21. Autor: Lucas + Claude (Opus 4.8). Status: aguardando aprovação.

Reforma da experiência de escrever/responder na seção de E-mail, vinda da validação da MD. Três
frentes que se conversam: **C** compositor não-modal (encaixado + inline), **D** menu de ações no
e-mail aberto (com responder a todos e encaminhar), **E** autocompletar de destinatário com fichinhas.

## Decisões do Lucas (21/09, não reabrir)

- **C.** E-mail NOVO → cartão **encaixado** (flutuante no canto, não trava o fundo, **minimizar +
  fechar**, sem tela cheia; celular = tela cheia). Responder → caixa **inline no topo da conversa**
  (logo abaixo do e-mail aberto, coerente com a conversa mais-recente-primeiro). **Um compositor de
  cada vez** (abrir outro com rascunho sujo pergunta salvar/descartar). Vários juntos e tela cheia
  ficam fora por agora.
- **D.** Modelo **Gmail**: **Responder · Responder a todos · Encaminhar** em botões + **⋮ mais**
  (Marcar não lida · Mover · Excluir). Encaminhar **leva os anexos** do original. Spam e "discutir
  no chat" ficam fora.
- **E.** **Fichinhas** (chips) em Para/Cc/Cco. Autocompletar na ordem: **equipe (usuarios) →
  clientes/contatos → recentes** (dos enviados). E-mail digitado fora da base **vira fichinha e
  pronto** (não cria contato no CRM).

## Estado atual (mapa)

- **Compositor:** `src/components/email/CompositorEmail.tsx` é um `<Dialog>` (modal), com o
  formulário (Para/Cc/Cco em `<Input>` texto, assunto, `EditorTextoRico`, anexos, Enviar). Injetado
  em DOIS pontos de `Emails.tsx` (branch da lista e branch do leitor), como instância única
  (`{compositor}`), guardada em `Emails.tsx` (~`1769`).
- **Layout:** `Emails.tsx` troca tela cheia entre LISTA e LEITURA por early-return
  (`if (selectedEmail) return <leitor/>` senão `<lista/>`). Não há lista+leitura lado a lado.
- **Estado do rascunho:** um só — `formData {destinatario, assunto, corpo, cc, cco}` (strings),
  autosave em `email_rascunhos`. Envio em `sendEmailMutation`: `parseEnderecos` quebra a string
  "Nome <email>, ..." nos arrays; corpo passa por `sanitizarHtmlEmail` + `prepararHtmlParaEmail`.
- **Ações do leitor** (`LeitorEmail.tsx:622-668`): Voltar, Responder, Marcar não lido, Mover,
  Excluir. **Não existe** Responder a todos nem Encaminhar. `responderMensagem` (`Emails.tsx`) põe
  só o remetente no Para e zera Cc/Cco.
- **Destinatário:** `<Input>` texto puro, sem autocomplete. `parseEnderecos` só no envio.
- **Fontes de pessoas:** `usuarios.email`/`nome`; `contatos.email`/`nome_contato`/`cliente_id`;
  `clientes.email`/`nome_contato`/`razao_social`. Recentes: `email_mensagens` (direcao='enviado')
  campo `destinatarios` (jsonb `{name?,email}`). NÃO há RPC de busca de pessoa (padrão a seguir:
  `wa_buscar_mensagens`, SECURITY DEFINER + trigram, CLAUDE.md §7.4).
- **Envio no servidor:** `supabase/functions/email-enviar/index.ts` puxa os anexos do rascunho de um
  balde privado e monta o envio ao Nylas. Não sabe carregar anexo de OUTRA mensagem (o do original).

## C — Compositor não-modal (encaixado + inline)

### Desenho
- **Separar moldura do formulário.** O miolo do `CompositorEmail` (campos + editor + anexos + ações)
  vira um componente de formulário reutilizável; as MOLDURAS são duas:
  - **`CartaoEncaixado`** — `<div>` de posição fixa no canto inferior (não-modal, o fundo continua
    rolável), com cabeçalho (título + **minimizar** + **fechar**). Minimizado = só a barrinha do
    cabeçalho. Em tela estreita (`< sm`) ocupa a tela inteira (`fixed inset-0`).
  - **Inline** — o mesmo formulário renderizado EM FLUXO dentro do leitor, no **topo da conversa**
    (logo abaixo do cabeçalho/ações do e-mail aberto), empurrando as mensagens antigas para baixo.
- **Onde é renderizado.** O cartão encaixado é montado **UMA vez no nível da página** (fora do
  early-return lista/leitor), para trocar de tela NÃO perder o rascunho. A caixa inline é montada
  dentro do leitor.
- **Estado.** Continua um rascunho só (`formData`), mais `modoCompositor: "fechado" | "encaixado" |
  "inline"` e `minimizado: boolean`. `respondendoA` (id da mensagem original) já existe.
- **Um de cada vez.** Abrir um compositor com outro já sujo (algum campo preenchido) dispara um
  diálogo "Salvar rascunho / Descartar / Cancelar" antes de trocar.
- O `<Dialog>` some do `CompositorEmail`. O autosave e o envio não mudam de contrato.

### Arquivos
- `src/components/email/CompositorEmail.tsx` (moldura → cartão encaixado/inline; sai o Dialog).
- `src/pages/Emails.tsx` (render no nível da página + estado `modoCompositor`/`minimizado` + o
  diálogo "um de cada vez").
- `src/components/email/LeitorEmail.tsx` (ponto de montagem da caixa inline no topo da conversa).

## D — Menu de ações no e-mail aberto

### Desenho
- Barra no topo do leitor (`LeitorEmail`): **Responder · Responder a todos · Encaminhar** como
  botões visíveis + **⋮ mais** (Marcar não lida · Mover para marcador · Excluir). Responsivo: em
  tela estreita, o que não couber dos três de responder também recolhe no ⋮.
- As três abrem a **caixa inline** (C) no topo da conversa, com pré-preenchimento:
  - **Responder** → `Para` = remetente do original; Cc/Cco vazios; assunto "Re: …"; corpo com a
    citação (já existe em `responderMensagem`).
  - **Responder a todos** (`responderATodos`, novo) → `Para` = remetente; `Cc` = união de
    `destinatarios` + `cc` do original, **tirando** o endereço da própria caixa da empresa e o
    remetente (dedupe por e-mail, minúsculo).
  - **Encaminhar** (`encaminharMensagem`, novo) → `Para` vazio; assunto "Enc: …"; corpo com a
    citação; **carrega os anexos** do original (ver §Banco/Servidor).
- Handlers novos em `Emails.tsx`; o leitor recebe `onResponderATodos`/`onEncaminhar` por prop.

### Arquivos
- `src/components/email/LeitorEmail.tsx` (barra de ações + ⋮).
- `src/pages/Emails.tsx` (`responderATodos`, `encaminharMensagem`, props ao leitor).
- `supabase/functions/email-enviar/index.ts` (anexos do original no encaminhar — §Banco/Servidor).

## E — Fichinhas + autocompletar de destinatário

### Desenho
- **Componente `CampoDestinatarios`** (novo) para Para/Cc/Cco: mostra **fichinhas** (nome/e-mail,
  removível no "x") + um campo de digitação com **lista de sugestões** embaixo (Popover/Command do
  shadcn). Teclado: setas navegam, Enter/vírgula adiciona, Backspace no vazio remove a última.
  Internamente guarda `Array<{nome?: string; email: string}>` e **serializa para a MESMA string
  "Nome <email>, …"** que hoje mora em `formData.destinatario/cc/cco` — assim o envio
  (`parseEnderecos`) e o autosave NÃO mudam de contrato.
- **Busca (RPC nova).** `email_buscar_destinatarios(p_termo text, p_limite int)` SECURITY DEFINER
  (padrão §7.4), escopada por `get_my_empresa_id()`, devolve `{nome, email, origem}` unindo:
  1. `usuarios` da empresa (origem 'equipe'),
  2. `contatos`/`clientes` da empresa com e-mail (origem 'cliente'),
  3. **recentes**: e-mails distintos de `email_mensagens` (direcao='enviado', empresa) dos últimos
     N enviados (origem 'recente').
  Casa por nome OU e-mail (ilike/trigram), dedupe por e-mail (minúsculo), ordenado por origem
  (equipe → cliente → recente) e depois por relevância. Índices trigram novos onde faltar
  (`usuarios`, `contatos`, `clientes` por nome/e-mail) para não estourar o tempo limite (§7.4/§7.15).
- A lista some quando o termo tem menos de 2 caracteres; debounce ~200ms.

### Arquivos
- `src/components/email/CampoDestinatarios.tsx` (novo) + teste.
- `src/hooks/use-buscar-destinatarios.ts` (novo, chama a RPC) — ou dentro do componente.
- `src/components/email/CompositorEmail.tsx` (troca os 3 `<Input>` pelo `CampoDestinatarios`).
- `supabase/migrations/<nova>.sql` (RPC + índices) — **muda o banco**, aplicar com "pode" (ensaio).
- `src/integrations/supabase/types.ts` (RPC nova à mão).

## Banco / Servidor

- **RPC `email_buscar_destinatarios`** — migration nova (RLS não se aplica a função; SECURITY
  DEFINER com `search_path` fixo; `EXECUTE` só para `authenticated`, revogar de `anon/public`).
  Medir antes de aplicar; ensaiar (RAISE que desfaz); só aplicar com o "pode" do Lucas.
- **Encaminhar com anexos** — `email-enviar` passa a aceitar, no encaminhar, uma referência à
  mensagem original (ex.: `nylas_message_id`); a função **busca os anexos do original no Nylas** e
  os inclui no envio. 🔴 Confirmar na implementação o mecanismo exato do Nylas v3 (baixar e
  reanexar vs. anexar por id de anexo existente) — é função de servidor, sobe à parte do `git push`
  (CLAUDE.md §16). Sem dado real em teste.

## Não-objetivos (YAGNI)
- Vários compositores abertos ao mesmo tempo; tela cheia do cartão.
- Criar contato no CRM a partir do compositor.
- "Marcar como spam", "discutir no chat".
- Lista + leitura lado a lado (o layout segue troca de tela).

## Riscos
- **`Emails.tsx` é grande** e a mudança de C mexe na estrutura de render — fazer em passos, com
  verificação a cada um.
- **Encaminhar anexos** depende do Nylas; se o mecanismo for caro, cai para "sem anexos" com aviso
  (mas a decisão do Lucas foi COM anexos — confirmar viabilidade cedo).
- **Desempenho da busca** — seguir §7.4 (RPC + trigram), medir como usuário logado (§7.15).
- **Um de cada vez** — cuidar para o diálogo salvar/descartar não perder rascunho.

## Testes
- `CampoDestinatarios`: adiciona/remove fichinha; serializa para "Nome <email>, …"; Enter/vírgula
  adiciona; sugestão clicada vira fichinha.
- `responderATodos`/`encaminharMensagem`: montam Para/Cc/assunto certos (com dado inventado).
- RPC: teste de fumaça (ensaio) mostrando que ordena equipe→cliente→recente e dedupa.
- Guarda: `npm run test` não cai; `tsc` baseline; `build`.
- Conferência visual do Lucas (não logo com senha): cartão encaixado não trava o fundo; responder
  inline no topo; responder a todos com os Cc certos; encaminhar chega com os anexos; fichinhas +
  autocompletar puxando equipe/clientes/recentes.

## Ordem de implementação sugerida
C (fundação do compositor) → D (ações, que abrem o compositor) → E (fichinhas + RPC). E pode ter a
RPC começada em paralelo (é backend independente). Cada frente vira seu próprio plano/execução.
