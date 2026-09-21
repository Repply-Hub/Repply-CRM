# E-mail — três consertos: tamanho de imagem, espaçamento no envio, conversa mais recente primeiro

Data: 2026-09-21. Autor: Lucas + Claude (Opus 4.8). Status: aguardando aprovação.

Três consertos independentes na seção de E-mail, vindos da validação da MD. São a primeira
leva ("ganhos rápidos") antes da reforma maior (compositor inline, menu de ações, autocompletar).

## A — Tamanho da imagem no editor (assinatura e corpo)

### Problema
A imagem inserida no editor (`EditorTextoRico`) não tem largura definida. A assinatura da Érika é
uma imagem grande; sem largura, a caixa de quem recebe (Gmail) renderiza no **tamanho natural** e
ela chega **gigante**. O menu "Tamanho" existente age só em TEXTO (mark `fontSize`), não em imagem.

### Decisão (do Lucas)
Tamanho em **pixels** (a % é relativa ao contexto e varia na caixa de quem recebe). Teto automático
ao inserir + **botões de tamanho** quando a imagem está selecionada (sem alças de arrastar por agora).

### Desenho
1. **Extensão de imagem com `width`.** A extensão `Image` do TipTap traz só `src/alt/title`.
   Estender para carregar um atributo `width` (número, px), renderizado como atributo HTML `width`
   no `<img>` e com `style="max-width:100%;height:auto"` inline (segurança na caixa de quem recebe).
   Espelha o padrão que já usamos para `fontSize` (extensão de `TextStyle`).
2. **Teto ao inserir.** Em `aoEscolherImagem` (após o upload devolver a URL), carregar a imagem em
   memória (`new Image()`) para ler `naturalWidth` e inserir com `width = min(naturalWidth, 500)`.
   Imagem menor que 500 mantém o tamanho natural; a gigante é limitada a 500px. Fallback: se o
   `naturalWidth` não vier, usa 500.
3. **Botões de tamanho.** Quando um nó de imagem está selecionado (`editor.isActive("image")`),
   a barra mostra um controle "Tamanho da imagem" (mesmo padrão de `MenuBarra`): **Pequena 150 ·
   Média 300 · Grande 500 · Original** (Original = remove o `width`, volta ao natural). Aplica via
   `editor.chain().updateAttributes("image", { width }).run()`.
4. `sanitizarHtmlEmail` já permite o atributo `width` e `style` — nada a mudar lá.

### Arquivos
- `src/components/shared/EditorTextoRico.tsx` (extensão de imagem + botões + teto no insert).
- Teste: a extensão renderiza `width`; `caminho`/insert aplica teto (o headless prova o render).

## B — Conversa: mensagem mais recente primeiro

### Problema
Ao abrir um e-mail com conversa, o leitor mostra o e-mail aberto no topo e a seção "Nesta conversa"
com as demais **da mais antiga para a mais nova** (`src/pages/Emails.tsx:1673`, `.order("data_mensagem",
{ ascending: true })`). Para achar a resposta mais recente, o usuário rola até o fim.

### Decisão (do Lucas)
Forma **mínima (1)**: inverter a lista "Nesta conversa" para **mais nova primeiro**. O e-mail aberto
segue no topo; as demais aparecem da mais recente para a mais antiga logo abaixo.

### Desenho
Trocar `ascending: true` por `ascending: false` na consulta da conversa (`Emails.tsx:~1673`). Uma
linha. Não mexe no e-mail aberto (que continua sendo o clicado) nem na ordem das listas de
Recebidos/Enviados (que já são mais-novo-primeiro).

### Arquivos
- `src/pages/Emails.tsx` (a ordenação da consulta da conversa).

## F — Espaçamento entre linhas some no envio

### Problema
A pessoa dá espaçamento (linhas em branco / parágrafos) no editor do Repply, mas ao chegar no Gmail
o espaçamento **some**. Causa provável (a confirmar com `systematic-debugging` olhando o HTML real
enviado): o editor gera `<p>` por parágrafo e `<p></p>` para linha em branco; as caixas de e-mail
**zeram a margem padrão dos `<p>`** e **colapsam parágrafos vazios**, então tudo cola. O envio hoje
(`Emails.tsx`, `htmlBody`) embrulha `sanitizarHtmlEmail(data.corpo)` num `<div>` com `line-height`,
mas o espaçamento ENTRE parágrafos depende da margem, que é o que o cliente de e-mail descarta.

### Desenho
Novo helper `src/lib/html-para-email.ts` → `prepararHtmlParaEmail(html: string): string`, aplicado
na geração do corpo de envio (e reutilizável). Ele, sobre o HTML já sanitizado:
1. Dá a cada `<p>` um **espaçamento inline** (ex.: `style="margin:0 0 1em 0"`), que sobrevive à
   caixa de quem recebe (estilo inline não é descartado como o CSS de folha).
2. Preserva **linha em branco**: `<p></p>` vazio vira um parágrafo com altura real (ex.:
   `<p style="margin:0 0 1em 0">&nbsp;</p>` ou `<br>`), para não colapsar.
3. Mantém o que já existe (imagens com `max-width`, etc.).

Implementação com `DOMParser` (existe no navegador e no jsdom dos testes) — percorre os `<p>`,
injeta o `style`, trata os vazios, e re-serializa. É o mesmo espírito do `sanitizarHtmlEmail`
(transforma HTML → HTML), mas para FIDELIDADE, não segurança.

Aplicar em `Emails.tsx` no `sendEmailMutation`: `htmlBody` passa a embrulhar
`prepararHtmlParaEmail(sanitizarHtmlEmail(data.corpo))`.

🔴 Antes de escrever o conserto, confirmar a causa de verdade (olhar o HTML que sai hoje e o que o
Gmail mostra) — se o espaçamento já for `<br>` e o problema for outro, o desenho muda.

### Arquivos
- `src/lib/html-para-email.ts` (novo) + teste.
- `src/pages/Emails.tsx` (usar o helper no envio).

## Não-objetivos (YAGNI)
- Alças de arrastar para redimensionar imagem (fica para depois).
- Reordenar a conversa inteira numa lista só (a forma "completa" (2) foi descartada — o Lucas
  escolheu a mínima).
- Mexer no compositor inline / menu de ações / autocompletar (são a reforma C/D/E, à parte).

## Verificação
- `npm run test` não cai; `tsc -p tsconfig.app.json` no baseline; `build` ok.
- Testes novos: extensão de imagem renderiza `width`; `prepararHtmlParaEmail` dá margem inline aos
  parágrafos e preserva linha em branco (entra "p sem margem" → sai "p com margin inline"; entra
  "<p></p>" → sai espaçador que não colapsa; remove nada do conteúdo).
- Conferência visual do Lucas (não logo com senha): assinatura da Érika não chega mais gigante;
  botões de tamanho funcionam; e-mail enviado com linhas em branco chega com o espaçamento; a
  conversa mostra a mais recente logo abaixo do aberto.
