import { useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
}: FigurinhasPopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: figurinhas, isLoading } = useFigurinhasDoNumero(
    open ? instanciaId : undefined,
  );
  const remover = useRemoverFigurinha(instanciaId);

  function escolherImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (file) onEnviarImagem(file);
  }

  return (
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

      <PopoverContent
        side="top"
        align="start"
        className="w-[300px] p-2"
      >
        <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
          Figurinhas deste número
        </p>

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
                  <button
                    type="button"
                    onClick={() => remover.mutate(fig.id)}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex hover:bg-destructive/80"
                    title="Tirar da grade"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
          </div>

          {!isLoading && (figurinhas ?? []).length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              Nenhuma figurinha ainda. Envie uma imagem como figurinha e ela
              aparece aqui — e toda figurinha recebida neste número também.
            </p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
