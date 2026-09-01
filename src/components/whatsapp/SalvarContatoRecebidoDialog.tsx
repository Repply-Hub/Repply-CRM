import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from "@/components/shared/DialogoResponsivo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { useClientes } from "@/hooks/use-clientes";
import { useCreateContato } from "@/hooks/use-mutations";
import { mensagemDeErro } from "@/lib/mensagem-de-erro";
import { slugify } from "@/lib/utils";

/**
 * Salvar em Contatos uma pessoa que veio num cartão de contato do WhatsApp.
 * Nome e telefone já vêm preenchidos do cartão e são editáveis; o cliente é
 * opcional (dá pra vincular depois na tela de Contatos).
 */
export function SalvarContatoRecebidoDialog({
  dados,
  onClose,
}: {
  /** `null` mantém o diálogo fechado. */
  dados: { nome: string; telefone: string } | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const criar = useCreateContato();
  const { data: clientes } = useClientes({ enabled: !!dados });
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [clienteId, setClienteId] = useState("");

  useEffect(() => {
    if (dados) {
      setNome(dados.nome ?? "");
      setTelefone(dados.telefone ?? "");
      setClienteId("");
    }
  }, [dados]);

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Escreva o nome do contato");
      return;
    }
    if (!telefone.trim()) {
      toast.error("O contato precisa de um telefone");
      return;
    }
    try {
      const criado = await criar.mutateAsync({
        nome_contato: nome.trim(),
        telefone: telefone.trim(),
        cliente_id: clienteId || undefined,
      });
      toast.success("Contato salvo");
      onClose();
      if (criado?.id) {
        navigate(`/contatos/${slugify(nome.trim() || "contato")}-${criado.id}`);
      }
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível salvar o contato"));
    }
  };

  return (
    <Dialog open={!!dados} onOpenChange={(v) => !v && onClose()}>
      <ConteudoDialogo className="sm:max-w-sm">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Salvar em Contatos
          </DialogTitle>
        </CabecalhoDialogo>
        <CorpoDialogo className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cliente (opcional)</Label>
            <SearchableSelect
              options={(clientes ?? []).map((c) => ({ value: c.id, label: c.empresa }))}
              value={clienteId}
              onValueChange={setClienteId}
              placeholder="Vincular a um cliente"
              emptyMessage="Nenhum cliente encontrado."
            />
          </div>
        </CorpoDialogo>
        <RodapeDialogo>
          <Button onClick={salvar} disabled={criar.isPending} className="w-full">
            {criar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
