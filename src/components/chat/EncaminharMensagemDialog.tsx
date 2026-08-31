import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from "@/components/shared/DialogoResponsivo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Forward, Loader2, Search, Users } from "lucide-react";
import {
  useWaEncaminharMensagem,
  type WaConversa,
  type WaMensagem,
} from "@/hooks/use-whatsapp-inbox";

// Rótulo do que vai ser encaminhado, só para a pessoa conferir antes de mandar.
function resumoMensagem(msg: WaMensagem): string {
  if (msg.tipo === "imagem") return msg.conteudo && msg.conteudo !== "[Imagem]" ? `Imagem — ${msg.conteudo}` : "Imagem";
  if (msg.tipo === "video") return msg.conteudo && msg.conteudo !== "[Vídeo]" ? `Vídeo — ${msg.conteudo}` : "Vídeo";
  if (msg.tipo === "audio") return "Áudio";
  if (msg.tipo === "documento") return `Documento — ${msg.conteudo}`;
  if (msg.tipo === "sticker") return "Figurinha";
  return msg.conteudo;
}

export function EncaminharMensagemDialog({
  mensagem,
  conversas,
  conversaAtualId,
  onClose,
}: {
  /** Mensagem a encaminhar. `null` mantém o diálogo fechado. */
  mensagem: WaMensagem | null;
  /** Lista de conversas já carregada na página (evita uma segunda assinatura). */
  conversas: WaConversa[];
  /** Conversa aberta agora — sai da lista de destinos. */
  conversaAtualId: string | null;
  onClose: () => void;
}) {
  const encaminhar = useWaEncaminharMensagem();
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  // Zera a seleção sempre que abre com outra mensagem.
  useEffect(() => {
    if (mensagem) {
      setSelecionadas([]);
      setBusca("");
    }
  }, [mensagem]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return conversas
      .filter((c) => c.id !== conversaAtualId)
      .filter((c) => {
        if (!termo) return true;
        return (
          (c.nome_contato ?? "").toLowerCase().includes(termo) ||
          c.telefone.toLowerCase().includes(termo)
        );
      });
  }, [conversas, conversaAtualId, busca]);

  const toggle = (id: string) =>
    setSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleEncaminhar = async () => {
    if (!mensagem || selecionadas.length === 0) return;
    const destinos = conversas
      .filter((c) => selecionadas.includes(c.id))
      .map((c) => ({ id: c.id, telefone: c.telefone }));
    try {
      await encaminhar.mutateAsync({ mensagem, destinos });
      onClose();
    } catch {
      // O onError da mutation já mostrou o motivo; mantém o diálogo aberto.
    }
  };

  return (
    <Dialog open={!!mensagem} onOpenChange={(v) => !v && onClose()}>
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5 text-primary" />
            Encaminhar mensagem
          </DialogTitle>
        </CabecalhoDialogo>
        <CorpoDialogo className="space-y-3">
          {mensagem && (
            <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="line-clamp-2 break-words">{resumoMensagem(mensagem)}</span>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <ScrollArea className="h-[260px] rounded-lg border p-2">
            <div className="space-y-1">
              {lista.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Users className="h-8 w-8 opacity-30" />
                  <p className="text-xs">Nenhuma conversa encontrada.</p>
                </div>
              )}
              {lista.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selecionadas.includes(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {c.nome_contato || c.telefone}
                    </p>
                    {c.nome_contato && (
                      <p className="truncate text-[10px] text-muted-foreground">
                        {c.telefone}
                      </p>
                    )}
                  </div>
                  {c.is_group && (
                    <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </label>
              ))}
            </div>
          </ScrollArea>
        </CorpoDialogo>
        <RodapeDialogo>
          <Button
            onClick={handleEncaminhar}
            disabled={selecionadas.length === 0 || encaminhar.isPending}
            className="w-full"
          >
            {encaminhar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Forward className="mr-2 h-4 w-4" />
            )}
            {selecionadas.length === 0
              ? "Encaminhar"
              : `Encaminhar para ${selecionadas.length}`}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
