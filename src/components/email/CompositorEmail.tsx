import { Loader2, Mail, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface RascunhoEmail {
  destinatario: string;
  assunto: string;
  corpo: string;
}

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  valores: RascunhoEmail;
  onChange: (valores: RascunhoEmail) => void;
  onEnviar: (e: React.FormEvent) => void;
  onDescartar: () => void;
  isConnected: boolean;
  isEnviando: boolean;
  /** "Nova mensagem" na caixa; "Responder" quando sai de dentro de um e-mail. */
  titulo?: string;
  /**
   * HTML do rodapé (nome + assinatura + logo/empresa, conforme as
   * preferências salvas em Configurações) exatamente como vai sair no
   * e-mail — mostrado como prévia fixa abaixo da caixa de texto, não
   * editável aqui. O corpo continua sendo só o que a pessoa digita; o
   * rodapé é colado nele automaticamente no envio, como já era antes desta
   * prévia existir.
   */
  assinaturaPreviewHtml: string;
}

/**
 * Compositor de e-mail.
 *
 * Vive num componente próprio porque é montado em DOIS lugares: na listagem
 * (botão "Escrever") e dentro do leitor de uma mensagem (botão "Responder").
 * Enquanto ele existia solto no JSX da listagem, responder obrigava a fechar o
 * e-mail aberto para o diálogo ter onde aparecer — a pessoa clicava em
 * "Responder" e era jogada de volta para a caixa de entrada.
 *
 * SOBRE AS CORES: este diálogo já imitou o cromo do Gmail com hex fixos
 * (faixa #404040 no cabeçalho, botão #0b57d0). Eram as duas únicas superfícies
 * de diálogo pintadas à mão no app inteiro, e viviam quebrando contraste porque
 * cor chumbada não sabe em que tema está. Pior: o DialogOverlay é `bg-black/80`,
 * então o pop-up é visto sobre a página ESCURECIDA (no tema claro o fundo atrás
 * dele compõe para ~#333). Uma faixa #404040 contra esse #333 dá 1,22:1 — o topo
 * do diálogo simplesmente não existia, e o título parecia flutuar no escurecimento
 * da página. Agora tudo aqui sai dos tokens de tema (--muted, --border,
 * --foreground, --primary), que já são redefinidos em .dark: o diálogo fica certo
 * nos dois temas por construção, não por mais um ajuste pontual de contraste.
 */
export function CompositorEmail({
  open,
  onOpenChange,
  valores,
  onChange,
  onEnviar,
  onDescartar,
  isConnected,
  isEnviando,
  titulo = 'Nova mensagem',
  assinaturaPreviewHtml,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `gap-0`: o DialogContent é um grid com `gap-4`. Com `p-0`, essa calha de
          1rem aparecia como uma tira de bg-background entre o cabeçalho e o
          formulário — mais uma costura visível no topo do pop-up.

          Sem `border-none`: a borda padrão (--border) é justamente o que separa o
          diálogo do overlay escurecido (8,7:1 no tema claro). Removê-la deixava a
          separação por conta da cor de cada superfície, o que funcionava no corpo
          branco e falhava na faixa escura. A sombra não substitui a borda: como é
          deslocada 25px para baixo, o alfa efetivo na aresta SUPERIOR é ~0,017.

          O "X" é o do próprio DialogContent (o Radix desenha um em todo diálogo;
          já houve um segundo botão desenhado à mão aqui e os dois se empilhavam no
          mesmo canto). Ele não é mais recolorido: como o cabeçalho passou a ser
          uma superfície CLARA no tema claro e escura no escuro, a cor herdada do
          content já resolve os dois casos — `text-white` fixo era o que o apagava. */}
      {/* 820px em vez de 600: responder num quadrado de 600 obrigava a quebrar
          linha cedo demais, e o trecho citado do e-mail original (que já vem com
          as quebras do remetente) ficava picotado. É a largura de leitura de um
          e-mail, não a de um formulário. */}
      <DialogContent className="sm:max-w-[820px] gap-0 overflow-hidden p-0 shadow-2xl">
        {/* Cabeçalho no padrão das telas de importação do app: token com faixa
            (`bg-muted`) + `border-b`, título herdando --foreground. Usar o
            DialogHeader de verdade (e não uma <div>) preserva a estrutura que o
            Radix associa ao aria-labelledby/aria-describedby. O `pr-12` reserva a
            coluna do botão de fechar para o título não passar por baixo dele. */}
        <DialogHeader className="space-y-0 border-b bg-muted px-6 py-4 pr-12">
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">
            Preencha destinatário, assunto e mensagem para enviar pela caixa da empresa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onEnviar} className="flex flex-col">
          {/* Campos sem moldura (silhueta de compositor), mas COM anel de foco: a
              className não pode voltar a trazer `focus-visible:ring-0`. O cn() usa
              tailwind-merge, então aquele ring-0 apagava o `ring-2 ring-ring` do
              primitivo e o campo focado ficava idêntico ao não-focado — falha de
              WCAG 2.4.7, sem nenhum feedback ao navegar por Tab. Os rótulos são
              <label htmlFor> para o clique/leitor de tela chegarem ao input mesmo
              sem borda visível. */}
          <div className="border-b px-6">
            <div className="flex items-center gap-2 py-2">
              <label htmlFor="to" className="min-w-[60px] text-sm text-muted-foreground">
                Para
              </label>
              <Input
                id="to"
                placeholder="email@exemplo.com"
                className="h-8 border-none bg-transparent px-0 shadow-none"
                value={valores.destinatario}
                onChange={(e) => onChange({ ...valores, destinatario: e.target.value })}
              />
            </div>
          </div>

          <div className="border-b px-6">
            <div className="flex items-center gap-2 py-3">
              <label htmlFor="subject" className="min-w-[60px] text-sm text-muted-foreground">
                Assunto
              </label>
              <Input
                id="subject"
                placeholder="Assunto"
                className="h-8 border-none bg-transparent px-0 font-medium shadow-none"
                value={valores.assunto}
                onChange={(e) => onChange({ ...valores, assunto: e.target.value })}
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <Textarea
              id="body"
              placeholder="Escreva sua mensagem aqui..."
              className="min-h-[380px] resize-none border-none bg-transparent p-0 text-base"
              value={valores.corpo}
              onChange={(e) => onChange({ ...valores, corpo: e.target.value })}
            />
          </div>

          {/* Prévia fixa do rodapé — não é campo do formulário, só mostra o
              que `sendEmailMutation` vai colar embaixo do corpo no envio.
              `bg-white`/`colorScheme: light` fixos: o HTML do rodapé usa
              cores hex pensadas pra fundo branco (é o mesmo que sai no
              e-mail de verdade), então no tema escuro do app ficaria
              ilegível sem isso — mesma solução já usada na prévia de
              Configurações. `pointer-events-none` fica só no CONTEÚDO (o
              `dangerouslySetInnerHTML` de dentro), não neste wrapper: um
              link ou imagem da assinatura não deve ser clicável nesta tela,
              mas o wrapper precisa continuar recebendo roda do mouse/arraste
              pra rolar — `pointer-events-none` aqui fora desativava a régua
              de rolagem inteira (aparecia a barrinha, mas nada respondia). */}
          <div className="border-t px-6 py-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Assinatura (adicionada automaticamente ao enviar)
            </p>
            <div
              className="max-h-40 overflow-y-auto rounded-md border bg-white p-3 text-sm"
              style={{ colorScheme: 'light' }}
            >
              <div
                className="pointer-events-none"
                dangerouslySetInnerHTML={{ __html: assinaturaPreviewHtml }}
              />
            </div>
          </div>

          {/* Rodapé no padrão do app (NovoNegocioDialog/EventDialog): `border-t` e
              nada de fundo. O `bg-muted/10` de antes era 10% de um token que no
              tema claro já é 96% — compunha para #FEFEFE sobre branco (1,01:1),
              uma barra de ações que não existia na tela. Quem separa a região é a
              linha, não uma faixa diluída.

              <div> em vez de DialogFooter: o primitivo nasce `flex-col-reverse
              sm:flex-row sm:justify-end`, que empurraria os DOIS botões pro
              canto direito juntos. Aqui é `justify-between` de propósito —
              Descartar fica ancorado à esquerda e Enviar/Conectar à direita,
              não colados um no outro. DialogFooter não carrega semântica de
              acessibilidade — é só um div com classes. */}
          <div className="flex flex-row items-center justify-between gap-2 border-t px-6 py-4">
            {/* Ghost puro: sem `hover:text-destructive`. O tailwind-merge derrubava
                só a cor do texto da variante e mantinha o `hover:bg-accent`, então
                no tema escuro o hover pintava vermelho-escuro (--destructive 40%)
                sobre marrom-escuro (--accent 18%) = 1,93:1 — o ícone sumia no exato
                instante anterior ao clique numa ação destrutiva. O par accent/
                accent-foreground do hover padrão dá 4,65:1 no claro e 10,5:1 no
                escuro; o caráter destrutivo fica no ícone, no title e no aria-label. */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDescartar}
              title="Descartar rascunho"
              aria-label="Descartar rascunho"
            >
              <Trash2 className="h-5 w-5" />
            </Button>

            {!isConnected ? (
              // Sem caixa conectada não há de onde enviar. O caminho para
              // conectar fica na própria aba de e-mails, atrás deste diálogo —
              // daí fechar em vez de navegar para fora.
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Conectar uma caixa para enviar
              </Button>
            ) : (
              /* Voltou a ser `bg-primary` (o laranja da marca, variante padrão
                 do Button) a pedido — antes era um azul (#0b57d0) hex fixo,
                 justamente para fugir do laranja: rótulo branco sobre
                 #FF5A1F mede 3,12:1, abaixo dos 4,5:1 que a WCAG 1.4.3 exige
                 de texto (o azul dava 6,39:1). Essa é a MESMA combinação já
                 usada em botão "default" no app inteiro — inclusive o
                 "Escrever" que abre este compositor —, então este botão só
                 volta a carregar o mesmo débito de contraste que o resto do
                 app já carrega, não um novo. */
              <Button type="submit" disabled={isEnviando} className="gap-2">
                {isEnviando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
