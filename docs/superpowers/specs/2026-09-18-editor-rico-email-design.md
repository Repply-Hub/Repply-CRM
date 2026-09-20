# Editor de texto rico para e-mail (corpo + assinatura) — Desenho

Data: 2026-09-18. Autor: Lucas + Claude (Opus 4.8). Status: aguardando aprovação do Lucas.

## 1. Objetivo

Dar à seção de E-mail um editor de texto com formatação (estilo Gmail/Bitrix), usado
tanto ao **escrever** a mensagem quanto ao **configurar a assinatura**, e trazer a
assinatura para **dentro** do corpo (como no Gmail) em vez de uma área separada. Todos os
pedidos vieram do período de teste da MD.

## 2. Decisões do Lucas (18/09/2026 — não reabrir)

1. **Ferramentas: conjunto Essencial (estilo Gmail).** Negrito, itálico, sublinhado,
   tachado, cor do texto, fonte, tamanho, lista com marcador, lista numerada, alinhamento,
   link, imagem, limpar formatação. **Sem** tabela, bloco de código, citação, editar-HTML-na-mão
   nem tela cheia (o conjunto "Completo" do Bitrix ficou de fora — mais simples e mais seguro).
2. **Imagem no corpo: sim.** Inserir imagem no meio do texto do e-mail, além da assinatura.
3. **Assinatura no corpo: sempre.** E-mail novo, responder e encaminhar já abrem com a
   assinatura dentro do corpo, pronta para editar ou apagar.
4. Barra de ferramentas **responsiva**: o que não couber na largura vai para um menu de
   três pontos (⋯).
5. Atalhos de teclado precisam funcionar em **Windows/Linux (Ctrl) e Mac (Cmd)**.

## 3. O que muda para o usuário

- **Escrever:** o campo de texto simples vira um editor com barra de ferramentas. Ctrl/Cmd+B,
  I, U funcionam. A barra colapsa num ⋯ quando não cabe.
- **Assinatura no corpo:** a área separada "Assinatura (adicionada automaticamente ao enviar)"
  com o botão "Remover" **deixa de existir**. A assinatura passa a ser inserida no corpo ao
  abrir a composição (novo/responder/encaminhar); apagar/editar é decisão do usuário, ali mesmo.
- **Configurar assinatura:** some a divisão em abas "Texto / Imagem". Vira **um editor único**
  (o mesmo do corpo), onde a pessoa monta a assinatura com texto, **várias imagens**, cores,
  links etc.

## 4. Não-objetivos (YAGNI)

- Tabela, bloco de código, citação, "editar HTML", tela cheia.
- Editor colaborativo, histórico de versões, rascunho com formatação versionada.
- Sanitização de HTML no **servidor** de envio (hoje não existe; segue como está — ver §12).
- Reescrever `LeitorEmail` (a leitura já sanitiza e já renderiza HTML — item 5 do mapa).

## 5. Estado atual (mapa, com arquivo:linha)

- **Corpo ao escrever:** `<Textarea>` puro em `src/components/email/CompositorEmail.tsx:174-181`;
  estado em `RascunhoEmail.corpo` (`CompositorEmail.tsx:15-19`) e `Emails.tsx:361-365`
  (`useState({destinatario,assunto,corpo})`). Não há campo HTML no rascunho.
- **Corpo → HTML só no envio:** `Emails.tsx:1059-1064` faz `data.corpo.replace(/\n/g,"<br>")`
  **sem escapar** `<`/`>`/`&` do texto do usuário (bug latente de correção/segurança) e
  concatena com o rodapé.
- **Assinatura — configuração:** `src/components/configuracoes/AssinaturaEmailEditor.tsx`
  (dentro de `src/pages/Configuracoes.tsx:442-452`). Duas ABAS exclusivas "Texto" (`contentEditable`
  + `document.execCommand`, linhas 283-294) e "Imagem" (upload de **um** arquivo para o bucket
  `email-assets`, path fixo `assinaturas/{userId}.png`, linhas 296-344). Ambas gravam no **mesmo**
  campo `usuarios.assinatura_email` (HTML). Colunas auxiliares: `assinatura_imagem_mostrar_nome`,
  `assinatura_imagem_mostrar_empresa` (booleans, só do modo imagem).
- **Assinatura — no compositor:** área fixa `CompositorEmail.tsx:270-317` (prévia via
  `dangerouslySetInnerHTML`, botão Remover/Adicionar). HTML montado em `Emails.tsx:413-438`
  (`assinaturaPreviewHtml`) por `montarRodapeEmailHtml` (`src/lib/assinatura-email.ts:124-171`),
  a MESMA função usada no envio (`Emails.tsx:1038-1057`); concatenação string+string.
- **Sanitização de leitura:** `LeitorEmail.tsx:392-401` já usa `DOMPurify.sanitize(...)` com
  allowlist e injeta em `:475`.
- **Envio no servidor:** `supabase/functions/email-enviar/index.ts:211-215` manda `body.body`
  literal ao Nylas; grava em `email_mensagens.corpo_html` (`:379`). Sem sanitização no servidor.
- **Dependências:** `dompurify ^3.4.13`; React 18.3.1; Vite. **Nenhuma** lib de editor rico.
- **Rascunho:** `email_rascunhos.corpo` é `TEXT` (comporta HTML).

## 6. Arquitetura

### 6.1 Componente `EditorTextoRico` (novo, compartilhado)

`src/components/shared/EditorTextoRico.tsx`, sobre **TipTap** (ProseMirror). Entrada/saída em
**HTML** (`value: string` / `onChange(html: string)`), para casar com `assinatura_email` e
`corpo_html` sem conversão. Props: `value`, `onChange`, `placeholder`, `onEnviarImagem` (callback
de upload que devolve URL pública), `minHeight`, `disabled`, `aria-label`.

Por que TipTap: React-nativo, mantido, gera HTML limpo, trata Ctrl/Cmd automaticamente,
extensível para exatamente o conjunto Essencial. Alternativas descartadas: `contentEditable`+
`execCommand` (o que a aba "Texto" usa hoje — API depreciada, inconsistente entre navegadores,
difícil de controlar a saída), Quill (modelo Delta, exige conversão para HTML, `react-quill`
pouco mantido).

Extensões (conjunto Essencial): StarterKit (parágrafo, negrito, itálico, tachado, listas,
histórico), Underline, Link (com `openOnClick:false`, alvo seguro), Image, TextAlign, TextStyle +
Color, FontFamily (lista curta segura), e um mark de tamanho de fonte via TextStyle
(`fontSize` inline). Saída: estilos **inline** (e-mail descarta `<style>`/classes).

### 6.2 Barra de ferramentas responsiva (`BarraEditor`)

Ferramentas prioritárias sempre visíveis; o excedente vai para um `DropdownMenu` (⋯). A
medição é por `ResizeObserver` sobre a largura do editor, com uma ordem de prioridade fixa
(negrito/itálico/sublinhado/link primeiro; fonte/tamanho/cor/alinhamento/imagem depois). Botões
refletem o estado ativo (`editor.isActive(...)`). Ícones do `lucide-react` já no projeto.

### 6.3 Atalhos multiplataforma

TipTap/ProseMirror já mapeiam `Mod-b/i/u` etc., onde `Mod` = Cmd no Mac e Ctrl no resto. Nada
específico a implementar; um teste cobre o mapeamento para não regredir.

### 6.4 Imagens (upload)

Helper `enviarImagemEmail(file, userId) → Promise<string>` (`src/lib/imagem-email.ts`):
valida tipo/tamanho, sobe para `email-assets` em `imagens/{userId}/{uuid}.{ext}` e devolve a
**URL pública** (o bucket já é público — a imagem única da assinatura hoje é servida por URL
pública). Usado tanto pelo corpo quanto pela assinatura (permite **várias** imagens, cada uma
com path único — supera o path fixo `assinaturas/{userId}.png` de hoje). Inserção no editor via
extensão Image (`<img src=URL>`), com `width` opcional. Limite de tamanho e tipos definidos no
plano (ex.: png/jpg/gif/webp, teto de alguns MB).

### 6.5 Sanitização de escrita

Novo `sanitizarHtmlEmail(html)` (`src/lib/sanitizar-html-email.ts`, DOMPurify — já é dependência)
com allowlist do conjunto Essencial: tags `p,br,div,span,strong,b,em,i,u,s,a,ul,ol,li,img,h1-h3`;
atributos `href,src,alt,title,width,height` e `style` restrito a `color,font-family,font-size,
text-align,font-weight,font-style,text-decoration`. Aplicado (a) na saída do editor antes de
gravar rascunho e antes de enviar; (b) na assinatura antes de gravar. Substitui/estende o
`sanitizarAssinaturaEmail` atual (`assinatura-email.ts:33-45`), que é mais restrito do que o
Essencial precisa. A leitura segue com o DOMPurify que já existe em `LeitorEmail`.

## 7. Mudanças por arquivo

- **`src/components/shared/EditorTextoRico.tsx`** (novo) — o editor + barra.
- **`src/components/shared/BarraEditor.tsx`** (novo, ou interno ao editor) — barra responsiva ⋯.
- **`src/lib/imagem-email.ts`** (novo) — upload de imagem, path único, URL pública.
- **`src/lib/sanitizar-html-email.ts`** (novo) — allowlist do Essencial.
- **`CompositorEmail.tsx`** — troca `<Textarea>` por `<EditorTextoRico>`; **remove** a área de
  prévia da assinatura (270-317) e o botão Remover; `RascunhoEmail.corpo` passa a carregar HTML.
- **`Emails.tsx`** — (a) remove o `replace(/\n/g,"<br>")` ingênuo; envia o HTML do editor
  (sanitizado) direto; (b) ao abrir composição (novo/responder/encaminhar) **semeia** o corpo com
  a assinatura (HTML) + área de digitação; (c) autosave grava HTML em `email_rascunhos.corpo`;
  (d) `incluirAssinatura`/`assinaturaPreviewHtml` saem.
- **`AssinaturaEmailEditor.tsx`** — troca as duas abas por **um** `<EditorTextoRico>` com upload
  de várias imagens; remove a inferência de modo texto/imagem; grava HTML em `assinatura_email`.
- **`src/lib/assinatura-email.ts`** — `montarRodapeEmailHtml` deixa de ser "append no envio";
  passa a servir para **semear** o editor de assinatura na primeira abertura (continuidade, §11).
  `sanitizarAssinaturaEmail` passa a delegar para `sanitizarHtmlEmail`.
- **`use-email-empresa.ts`** — sem mudança de contrato (o `body` já é HTML pronto); só deixa de
  receber o corpo "texto + rodapé" e passa a receber o HTML único do editor.
- **Servidor `email-enviar`** — **sem mudança** (já aceita HTML pronto). Ver §12.

## 8. Assinatura no corpo (comportamento)

- Ao abrir o compositor para **e-mail novo, responder e encaminhar**, o corpo é semeado com:
  uma linha vazia de digitação no topo + a assinatura (HTML de `usuarios.assinatura_email`).
  Em responder/encaminhar, se houver citação do original, a ordem é: digitação → assinatura →
  original citado (a citação em si segue o comportamento atual; se hoje não há citação, nada muda
  além da assinatura entrar).
- A assinatura fica **editável/apagável** no corpo. Não há mais botão "Remover assinatura":
  apagar no corpo é suficiente (padrão Gmail).
- No envio, manda-se o HTML do editor como está (inclui o que a pessoa deixou da assinatura).

## 9. Configuração da assinatura (editor único)

- Um `<EditorTextoRico>` só, sem abas. Toolbar idêntica à do corpo (padrão).
- **Várias imagens**: cada upload gera um path único; o HTML da assinatura pode ter N `<img>`.
- As colunas `assinatura_imagem_mostrar_nome/empresa` ficam **obsoletas** (a pessoa monta a
  assinatura inteira, inclusive nome, se quiser). Não são apagadas (não editar migration antiga);
  apenas deixam de ser lidas/escritas pela tela.

## 10. Dados e banco

- **Nenhuma migration de tabela esperada.** `assinatura_email` já é HTML; `email_rascunhos.corpo`
  é TEXT e comporta HTML; `corpo_html` já guarda HTML.
- **A confirmar no plano:** a política do bucket `email-assets` (Storage) precisa permitir que o
  usuário logado grave em `imagens/{userId}/...` (várias imagens) e leitura pública. Se a política
  atual só cobrir o path fixo `assinaturas/{userId}.png`, será um ajuste de política de Storage
  (não é dado de produção; é permissão) — medir e, se preciso, aplicar com o "pode" do Lucas.

## 11. Continuidade das assinaturas existentes

- O editor novo carrega `assinatura_email` como está — ninguém perde o que já tem.
- Como o "rodapé automático" (nome+assinatura+logo, montado no envio) deixa de existir, na
  **primeira** abertura das configurações o editor é semeado com o resultado de
  `montarRodapeEmailHtml(...)` (a assinatura efetiva de hoje) **quando** o campo salvo estiver
  vazio ou for legado, para a pessoa ver e ajustar o conjunto completo antes de salvar.
- Recado ao usuário: quem já tinha assinatura deve reabrir as Configurações uma vez para conferir
  (nome/logo agora fazem parte do que a pessoa monta). Impacto pequeno para a MD, que está validando.

## 12. Segurança (analisar por todas as perspectivas)

- **Corrige** o `replace(/\n/g,"<br>")` sem escape de hoje (texto do usuário ia cru para o HTML).
- **Sem "editar HTML"** → o usuário não injeta HTML arbitrário; a saída é sempre do editor,
  passada por `sanitizarHtmlEmail`.
- **Leitura** já sanitiza (`LeitorEmail`), então mesmo HTML malicioso vindo de fora não executa.
- **Servidor sem sanitização** continua como hoje (item 6 do mapa) — é dívida pré-existente, não
  introduzida aqui. A confiança está no client (editor + `sanitizarHtmlEmail`) e na leitura
  sanitizada. Sanitização no servidor (Deno) fica registrada como melhoria futura.
- **Imagens públicas**: assinatura/corpo servem imagens por URL pública (necessário para o app de
  quem recebe carregar). Nada sensível deve ir como imagem; é o mesmo modelo de hoje.
- **Multi-empresa**: nada muda por empresa; o editor é por usuário/mensagem, sem vazamento entre
  empresas.

## 13. Testes

- `sanitizar-html-email.test.ts`: mantém o Essencial (negrito, cor, link, img, listas,
  alinhamento) e remove o proibido (`<script>`, `onerror`, `javascript:`, `<style>`, `<iframe>`).
- `imagem-email.test.ts`: monta path único por usuário; rejeita tipo/tamanho inválido.
- `EditorTextoRico` (Testing Library): digitar aplica negrito via botão e via atalho Mod+B;
  `onChange` devolve HTML; inserir link/imagem; limpar formatação.
- Semear assinatura no corpo: abrir novo/responder/encaminhar injeta a assinatura uma vez.
- Guarda de bateria: `npm run test` não cai; `tsc -p tsconfig.app.json` no baseline; `build` ok.

## 14. Riscos e mitigações

- **Tamanho do bundle** (TipTap): aceitável para uma funcionalidade central; só o conjunto
  Essencial é carregado. Editor entra por carregamento sob demanda se pesar no primeiro paint.
- **HTML do editor ≠ render em todo cliente de e-mail**: por isso estilos **inline** e fonte/tamanho
  de lista curta e segura.
- **Rascunhos antigos** (texto puro) abrem no editor como texto — sem quebra.
- **Política do Storage** pode precisar de ajuste (§10) — medir antes.

## 15. Fora de escopo / próximos

- Sanitização no servidor de envio (Deno).
- "Editar HTML", tabela, tela cheia (conjunto Completo) — se um dia pedirem.
- Imagem colada da área de transferência (paste) — pode entrar no plano se for barato; senão, depois.
