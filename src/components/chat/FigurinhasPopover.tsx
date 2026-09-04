import { useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sticker, ImagePlus, Loader2, X } from "lucide-react";
import {
  useFigurinhasDoNumero,
  useRemoverFigurinha,
  type FigurinhaWa,
} from "@/hooks/use-figurinhas-whatsapp";
import { cn } from "@/lib/utils";

interface FigurinhasPopoverProps {
  instanciaId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** Envia uma figurinha que já está na coleção do número. */
  onEnviarFigurinha: (fig: FigurinhaWa) => void;
  /** Envia uma imagem nova como figurinha (o pai converte para webp e sobe). */
  onEnviarImagem: (file: File) => void;
  /** Um envio de figurinha está em andamento (mostra spinner, trava a grade). */
  enviando?: boolean;
  /**
   * Quem pode TIRAR figurinha da grade — some para todos que atendem o número, então é
   * decisão de gestor. Sem isto o "x" nem é desenhado: o banco recusaria o clique
   * (`wa_figurinhas_update`) e a pessoa só veria um erro seco depois de já ter clicado.
   */
  podeGerenciar?: boolean;
}

const ACEITA_IMAGEM = "image/png,image/jpeg,image/webp,image/gif";

export function FigurinhasPopover({
  instanciaId,
  open,
  onOpenChange,
  disabled,
  onEnviarFigurinha,
  onEnviarImagem,
  enviando,
  podeGerenciar,
}: FigurinhasPopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: figurinhas, isLoading } = useFigurinhasDoNumero(
    open ? instanciaId : undefined,
  );
  const remover = useRemoverFigurinha(instanciaId);
  // A figurinha que está esperando confirmação para sair da grade.
  const [aTirarDaGrade, setATirarDaGrade] = useState<FigurinhaWa | null>(null);

  function escolherImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (file) onEnviarImagem(file);
  }

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={disabled}
            title="Figurinhas"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sticker className="h-4 w-4" />
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent side="top" align="start" className="w-[300px] p-2">
          <div className="px-1 pb-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Figurinhas deste número
            </p>
            {/* A pergunta que todo mundo faz ao abrir isto pela primeira vez é "de onde
                vêm estas figurinhas?". A resposta em uma linha, sempre visível — e não só
                no estado vazio, que quem já tem figurinha nunca vê. */}
            <p className="text-[11px] leading-snug text-muted-foreground/80">
              As que você manda pelo celular entram aqui sozinhas.
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACEITA_IMAGEM}
            className="hidden"
            onChange={escolherImagem}
          />

          <ScrollArea className="h-[240px]">
            <div className="grid grid-cols-4 gap-1.5 pr-2">
              {/* Adicionar uma imagem nova como figurinha */}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={enviando}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground",
                  "hover:border-primary hover:text-primary transition-colors disabled:opacity-50",
                )}
                title="Enviar imagem como figurinha"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px] leading-tight">Imagem</span>
              </button>

              {isLoading && (
                <div className="col-span-3 flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}

              {!isLoading &&
                (figurinhas ?? []).map((fig) => (
                  <div key={fig.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onEnviarFigurinha(fig)}
                      disabled={enviando}
                      className="flex aspect-square w-full items-center justify-center rounded-lg border border-transparent bg-muted/40 p-1 hover:border-border hover:bg-muted disabled:opacity-50"
                    >
                      <img
                        src={fig.media_url}
                        alt="figurinha"
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    </button>
                    {podeGerenciar && (
                      <button
                        type="button"
                        // Fecha a grade ANTES de perguntar. O popover é z-[1100] e o diálogo
                        // é z-[1050] (ui/popover.tsx:20 e ui/alert-dialog.tsx:19), os dois
                        // portados para o body — deixar os dois abertos faz a pergunta nascer
                        // POR BAIXO da grade, com os botões escondidos. Mesmo caminho de
                        // ProjetoSelect.tsx:130.
                        onClick={() => {
                          onOpenChange(false);
                          setATirarDaGrade(fig);
                        }}
                        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex hover:bg-destructive/80"
                        title="Tirar da grade"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
            </div>

            {!isLoading && (figurinhas ?? []).length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                Nenhuma figurinha ainda. Para guardar uma que um cliente mandou,
                use "Salvar figurinha" no menu da mensagem.
              </p>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Tirar da grade some para todos que atendem o número, então pergunta antes.
          Irmão do Popover, nunca dentro dele — ver o comentário do botão "x". */}
      <AlertDialog
        open={!!aTirarDaGrade}
        onOpenChange={(aberto) => {
          if (!aberto) setATirarDaGrade(null);
        }}
      >
        <AlertDialogContent
          // A página inteira escuta Escape no window para fechar a conversa aberta
          // (WhatsAppInbox.tsx, handleKeyDownGlobal). O Radix escuta antes, em captura no
          // document, então parar a propagação aqui impede que desistir da pergunta
          // feche junto a conversa que a pessoa estava atendendo.
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar esta figurinha da grade?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela some para todos que atendem este número, não só para você. A
              figurinha continua nas conversas em que já foi usada, e volta para
              a grade se alguém escolher "Salvar figurinha" nela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aTirarDaGrade) remover.mutate(aTirarDaGrade.id);
                setATirarDaGrade(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Tirar da grade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
