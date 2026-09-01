import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Contact, Loader2, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWaEnviarContatos } from "@/hooks/use-whatsapp-inbox";

type ContatoSelecionavel = { chave: string; nome: string; telefone: string; sub?: string };

const TETO = 400;
const soDigitos = (t: string) => (t ?? "").replace(/\D/g, "");

export function EnviarContatoDialog({
  open,
  onClose,
  conversaAtiva,
}: {
  open: boolean;
  onClose: () => void;
  /** Conversa que vai receber os cartões. `null` desabilita o envio. */
  conversaAtiva: { id: string; telefone: string } | null;
}) {
  const enviar = useWaEnviarContatos();
  const [aba, setAba] = useState<"contatos" | "conversas">("contatos");
  const [busca, setBusca] = useState("");
  // Chave -> contato. Guardar o objeto (não só a chave) mantém a seleção viva ao
  // trocar de aba e ao filtrar a lista.
  const [selecionados, setSelecionados] = useState<Map<string, ContatoSelecionavel>>(new Map());

  useEffect(() => {
    if (open) {
      setSelecionados(new Map());
      setBusca("");
      setAba("contatos");
    }
  }, [open]);

  const contatosQ = useQuery({
    queryKey: ["enviar-contato", "contatos"],
    enabled: open,
    queryFn: async (): Promise<ContatoSelecionavel[]> => {
      const { data, error } = await supabase
        .from("contatos")
        .select("id, nome_contato, empresa, telefone")
        .not("telefone", "is", null)
        .neq("telefone", "")
        .order("nome_contato")
        .limit(TETO);
      if (error) throw error;
      return (data ?? [])
        .filter((c) => soDigitos(c.telefone ?? "").length >= 10)
        .map((c) => ({
          chave: `contato:${c.id}`,
          nome: (c.nome_contato ?? "").trim() || (c.telefone ?? ""),
          telefone: c.telefone ?? "",
          sub: c.empresa ?? undefined,
        }));
    },
  });

  const conversasQ = useQuery({
    queryKey: ["enviar-contato", "conversas"],
    enabled: open,
    queryFn: async (): Promise<ContatoSelecionavel[]> => {
      // Abertas E fechadas, individuais (grupo não vira cartão de contato).
      const { data, error } = await supabase
        .from("whatsapp_conversas")
        .select("id, nome_contato, telefone, is_group")
        .eq("is_group", false)
        .not("telefone", "is", null)
        .order("ultima_mensagem_at", { ascending: false, nullsFirst: false })
        .limit(TETO);
      if (error) throw error;
      return (data ?? [])
        .filter((c) => soDigitos(c.telefone ?? "").length >= 10)
        .filter((c) => c.id !== conversaAtiva?.id)
        .map((c) => ({
          chave: `conversa:${c.id}`,
          nome: (c.nome_contato ?? "").trim() || (c.telefone ?? ""),
          telefone: c.telefone ?? "",
          sub: (c.nome_contato ?? "").trim() ? (c.telefone ?? undefined) : undefined,
        }));
    },
  });

  const carregando = aba === "contatos" ? contatosQ.isLoading : conversasQ.isLoading;

  const filtrada = useMemo(() => {
    const lista = aba === "contatos" ? contatosQ.data ?? [] : conversasQ.data ?? [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        c.telefone.toLowerCase().includes(termo) ||
        (c.sub ?? "").toLowerCase().includes(termo),
    );
  }, [aba, contatosQ.data, conversasQ.data, busca]);

  const toggle = (c: ContatoSelecionavel) =>
    setSelecionados((prev) => {
      const next = new Map(prev);
      if (next.has(c.chave)) next.delete(c.chave);
      else next.set(c.chave, c);
      return next;
    });

  const handleEnviar = async () => {
    if (!conversaAtiva || selecionados.size === 0) return;
    // Dedupe por telefone: o mesmo número pode estar em Contatos e numa conversa.
    const porTelefone = new Map<string, { nome: string; telefone: string }>();
    for (const c of selecionados.values()) {
      const k = soDigitos(c.telefone);
      if (!porTelefone.has(k)) porTelefone.set(k, { nome: c.nome, telefone: c.telefone });
    }
    try {
      await enviar.mutateAsync({
        conversa: conversaAtiva,
        contatos: [...porTelefone.values()],
      });
      onClose();
    } catch {
      // onError da mutation já avisou; mantém o diálogo aberto.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <Contact className="h-5 w-5 text-primary" />
            Enviar contato
          </DialogTitle>
        </CabecalhoDialogo>
        <CorpoDialogo className="space-y-3">
          <Tabs value={aba} onValueChange={(v) => setAba(v as "contatos" | "conversas")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="contatos" className="text-xs">
                Contatos de clientes
              </TabsTrigger>
              <TabsTrigger value="conversas" className="text-xs">
                Conversas
              </TabsTrigger>
            </TabsList>

            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Uma lista só, guiada pela aba — o conteúdo das duas abas é idêntico
                em layout, muda só a origem dos dados; não vale um TabsContent por aba. */}
            <div className="mt-3">
              <ScrollArea className="h-[280px] rounded-lg border p-2">
                <div className="space-y-1">
                  {carregando && (
                    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Carregando...</span>
                    </div>
                  )}
                  {!carregando && filtrada.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                      <Users className="h-8 w-8 opacity-30" />
                      <p className="text-xs">
                        {aba === "contatos"
                          ? "Nenhum contato com telefone encontrado."
                          : "Nenhuma conversa encontrada."}
                      </p>
                    </div>
                  )}
                  {!carregando &&
                    filtrada.map((c) => (
                      <label
                        key={c.chave}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selecionados.has(c.chave)}
                          onCheckedChange={() => toggle(c)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {c.nome}
                          </p>
                          {c.sub && (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {c.sub}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                </div>
              </ScrollArea>
            </div>
          </Tabs>
        </CorpoDialogo>
        <RodapeDialogo>
          <Button
            onClick={handleEnviar}
            disabled={!conversaAtiva || selecionados.size === 0 || enviar.isPending}
            className="w-full"
          >
            {enviar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Contact className="mr-2 h-4 w-4" />
            )}
            {selecionados.size === 0
              ? "Enviar contato"
              : `Enviar ${selecionados.size}`}
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
