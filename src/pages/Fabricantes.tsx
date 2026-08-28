import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DriveDaFabrica } from '@/components/fabricantes/DriveDaFabrica';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// Casca de modal com teto de altura: sem ela, formulário mais alto que a janela
// esconde o "Salvar" por baixo e o "X" por cima ao mesmo tempo — e como este
// projeto desliga Esc e clique-fora, a única saída seria recarregar a página.
import { ConteudoDialogo } from "@/components/shared/DialogoResponsivo";

import { useFabricantes } from "@/hooks/use-clientes";
// Criar, editar e excluir fabricante vêm todos do arquivo do domínio (CLAUDE.md §5.3).
// `use-mutations.ts` teve um `useCreateFabricante` até 28/08/2026; ele foi removido de lá
// porque não aceitava `ativo` e descartaria o status em silêncio — criar e editar têm de
// gravar exatamente os mesmos campos.
import {
  useCreateFabricante,
  useUpdateFabricante,
  useDeleteFabricante,
} from "@/hooks/use-fabricantes";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  compararFabricantes,
  fabricanteEstaAtivo,
} from "@/lib/ordem-de-fabricantes";

import { Plus, Loader2, CheckCircle2, Pencil, Trash2, Factory, Phone, User, ArrowLeft, Hash, X } from "lucide-react";
import { toast } from "sonner";

import {
  maskCnpj,
  unmaskCnpj,
  isValidCnpjDigits,
  fetchCnpjData,
} from "@/lib/cnpj";
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

import { SearchWithRecent } from "@/components/shared/SearchWithRecent";

// ─── Fabricante Form Dialog ─────────────────────────────────────────
function FabricanteForm({
  open,
  onOpenChange,
  editData,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editData?: {
    id: string;
    nome: string;
    cnpj?: string | null;
    nome_contato?: string | null;
    telefone?: string | null;
    ativo?: boolean | null;
  };
}) {
  const createFabricante = useCreateFabricante();
  const updateFabricante = useUpdateFabricante();
  const [cnpj, setCnpj] = useState(editData?.cnpj ?? "");
  const [cnpjStatus, setCnpjStatus] = useState<
    "idle" | "loading" | "valid" | "invalid"
  >("idle");
  const [nome, setNome] = useState(editData?.nome ?? "");
  const [contato, setContato] = useState(editData?.nome_contato ?? "");
  const [telefone, setTelefone] = useState(editData?.telefone ?? "");
  // Fabricante novo nasce Ativa: quem cadastra uma marca é porque acabou de passar a
  // representá-la. `fabricanteEstaAtivo` cobre o cadastro antigo que ainda não tem o
  // campo — ausência de informação não vira "inativa".
  const [ativo, setAtivo] = useState(fabricanteEstaAtivo(editData));
  const sessionRef = useRef(0);

  const reset = () => {
    sessionRef.current += 1;
    setCnpj("");
    setCnpjStatus("idle");
    setNome("");
    setContato("");
    setTelefone("");
    setAtivo(true);
  };

  useEffect(() => {
    if (open) {
      sessionRef.current += 1;
      setCnpj(editData?.cnpj ?? "");
      setCnpjStatus("idle");
      setNome(editData?.nome ?? "");
      setContato(editData?.nome_contato ?? "");
      setTelefone(editData?.telefone ?? "");
      setAtivo(fabricanteEstaAtivo(editData));
    }
  }, [open, editData]);

  const handleCnpjBlur = async () => {
    const digits = unmaskCnpj(cnpj);
    if (digits.length !== 14) return;
    if (!isValidCnpjDigits(digits)) {
      setCnpjStatus("invalid");
      toast.error("CNPJ inválido");
      return;
    }
    const session = sessionRef.current;
    setCnpjStatus("loading");
    try {
      const data = await fetchCnpjData(digits);
      if (sessionRef.current !== session) return; // formulário foi fechado/reaberto enquanto a consulta rodava
      setCnpjStatus("valid");
      if (data.razao_social && !nome) setNome(data.razao_social);
      if (data.ddd_telefone_1 && !telefone) setTelefone(data.ddd_telefone_1);
      toast.success("CNPJ validado!");
    } catch {
      if (sessionRef.current !== session) return;
      setCnpjStatus("invalid");
      toast.error("CNPJ não encontrado");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      unmaskCnpj(cnpj).length === 14 &&
      !isValidCnpjDigits(unmaskCnpj(cnpj))
    ) {
      toast.error("CNPJ inválido");
      return;
    }
    try {
      if (editData) {
        await updateFabricante.mutateAsync({
          id: editData.id,
          nome,
          cnpj: cnpj || undefined,
          nome_contato: contato || undefined,
          telefone: telefone || undefined,
          ativo,
        });
        // O aviso diz o que mudou de verdade: desativar não apaga nada, e a pessoa
        // precisa saber disso na hora, não depois de procurar a marca na lista.
        toast.success(
          ativo
            ? "Fabricante atualizado!"
            : "Marca desativada. Ela sai do topo das listas, mas continua no sistema com todos os negócios dela.",
        );
      } else {
        await createFabricante.mutateAsync({
          nome,
          cnpj: cnpj || undefined,
          nome_contato: contato || undefined,
          telefone: telefone || undefined,
          ativo,
        });
        toast.success("Fabricante cadastrado!");
      }
      reset();
      onOpenChange(false);
    } catch (err: any) {
      // O texto cru da RLS ("new row violates row-level security policy...")
      // chegou à tela de um usuário real em inglês. A regra que barrava
      // vendedor foi derrubada, então este caminho ficou raro — mas qualquer
      // política futura deve falhar em português, não em erro de banco.
      const msg = err.message || "";
      toast.error(
        msg.includes("row-level security")
          ? "Você não tem permissão para isso."
          : msg || "Erro ao salvar fabricante.",
      );
    }
  };

  const isPending = createFabricante.isPending || updateFabricante.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <ConteudoDialogo className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {editData ? "Editar" : "Cadastrar"} Fabricante
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label>CNPJ</Label>
            <div className="relative">
              <Input
                value={cnpj}
                onChange={(e) => {
                  setCnpj(maskCnpj(e.target.value));
                  setCnpjStatus("idle");
                }}
                onBlur={handleCnpjBlur}
                placeholder="00.000.000/0000-00"
                className={
                  cnpjStatus === "invalid"
                    ? "border-destructive"
                    : cnpjStatus === "valid"
                      ? "border-green-500"
                      : ""
                }
              />
              {cnpjStatus === "loading" && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {cnpjStatus === "valid" && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
          <div>
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do fabricante"
            />
          </div>
          <div>
            <Label>Contato</Label>
            <Input
              value={contato}
              onChange={(e) => setContato(e.target.value)}
              placeholder="Nome do contato"
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 0000-0000"
            />
          </div>
          {/* Status Ativa/Inativa. É um interruptor e não uma lista de duas opções porque
              a pergunta é um fato do mundo — "eu represento esta marca?" —, tem resposta
              padrão óbvia e só dois estados; uma lista obrigaria a abrir um menu para
              escolher entre dois itens e ainda sugeriria um terceiro estado que não
              existe. O rótulo é a pergunta; a palavra Ativa/Inativa aparece ao lado para
              a tela do formulário usar o MESMO termo do selo da lista. */}
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
            <div className="min-w-0">
              <Label htmlFor="fab-ativo" className="cursor-pointer">
                Represento esta marca
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {ativo
                  ? "Ativa — aparece normalmente nas listas de escolha."
                  : "Inativa — vai para o fim das listas. Os negócios, o histórico e o faturamento dela continuam no sistema."}
              </p>
            </div>
            <Switch
              id="fab-ativo"
              checked={ativo}
              onCheckedChange={setAtivo}
              aria-label="Represento esta marca"
              className="mt-0.5 shrink-0"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </ConteudoDialogo>
    </Dialog>
  );
}

// ─── Fabricante Card Component ──────────────────────────────────────
function FabricanteCard({
  fab,
  isSelected,
  onClick,
}: {
  fab: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group
        ${
          isSelected
            ? "border-primary bg-primary/8 shadow-[var(--shadow-card-hover)] ring-1 ring-primary/20"
            : "border-border/60 hover:border-primary/30 hover:bg-muted/40 hover:shadow-[var(--shadow-card)]"
        }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center transition-colors duration-200
          ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}
        >
          <Factory className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {fab.nome}
            </p>
            {/* Sem este selo a marca desativada só estaria no fim da lista, e ninguém
                saberia por quê. `outline` e não `destructive`: inativa não é erro nem
                alerta — é uma marca que a empresa não representa mais. */}
            {!fabricanteEstaAtivo(fab) && (
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] font-medium px-1.5 py-0 text-muted-foreground border-border"
              >
                Inativa
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {fab.cnpj && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <Hash className="h-3 w-3 flex-shrink-0" />
                {fab.cnpj}
              </span>
            )}
          </div>
          {fab.nome_contato && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <User className="h-3 w-3 flex-shrink-0" />
              {fab.nome_contato}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Detail Header Component ────────────────────────────────────────
function FabricanteDetailHeader({
  fab,
  onEdit,
  onDelete,
}: {
  fab: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="rounded-xl border-border/60 overflow-hidden">
      <div className="h-1.5 w-full bg-[image:var(--gradient-brand)]" />
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Factory className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-foreground font-bold text-base sm:text-lg truncate">
                  {fab.nome}
                </h2>
                {!fabricanteEstaAtivo(fab) && (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] font-medium px-1.5 py-0 text-muted-foreground border-border"
                  >
                    Inativa
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 sm:mt-2">
                {fab.cnpj && (
                  <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                    <Hash className="h-3.5 w-3.5" />
                    {fab.cnpj}
                  </span>
                )}
                {fab.nome_contato && (
                  <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                    <User className="h-3.5 w-3.5" />
                    {fab.nome_contato}
                  </span>
                )}
                {fab.telefone && (
                  <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                    <Phone className="h-3.5 w-3.5" />
                    {fab.telefone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="gap-1.5 h-9"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Editar</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              className="gap-1.5 h-9"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
const Fabricantes = () => {
  const { data: fabricantes, isLoading } = useFabricantes();
  const [selectedFabId, setSelectedFabId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fabDialog, setFabDialog] = useState(false);
  const [editFab, setEditFab] = useState<any>(null);
  // `deleteAlert` perdeu o tipo "preco" junto com o catálogo de produtos: só se exclui
  // fabricante por aqui agora.
  const [deleteAlert, setDeleteAlert] = useState<{ type: "fab"; id: string } | null>(null);

  const deleteFabricante = useDeleteFabricante();

  const selectedFab = fabricantes?.find((f) => f.id === selectedFabId);
  // Esta reordenação no cliente DESFAZIA a ordem que a consulta já tinha montado — por
  // isso o critério de status vem junto, como primeiro desempate (ver
  // src/lib/ordem-de-fabricantes.ts). A busca continua alcançando marca inativa: ela não
  // some de lugar nenhum, só desce.
  const fabricantesList = [...(fabricantes ?? [])]
    .filter((f) => (f.nome || "").toLowerCase().includes(search.toLowerCase()))
    .sort(compararFabricantes);

  const handleSearchChange = (val: string) => {
    setSearch(val);
  };

  const handleDelete = async () => {
    if (!deleteAlert) return;
    try {
      await deleteFabricante.mutateAsync(deleteAlert.id);
      if (selectedFabId === deleteAlert.id) setSelectedFabId(null);
      toast.success("Fabricante excluído!");
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("violates foreign key") || msg.includes("referenced")) {
        toast.error(
          "Este fabricante possui negócios vinculados e não pode ser excluído.",
        );
      } else {
        toast.error(msg || "Erro ao excluir fabricante.");
      }
    }
    setDeleteAlert(null);
  };

  // Mobile: show detail view when a fabricante is selected
  const showingDetail = !!selectedFab;

  // Subtítulo descreve a tela, como no resto do sistema. Era a contagem de
  // representadas — número que a própria lista da esquerda já mostra.
  //
  // 🔴 O nome perdeu "& Tabelas de Preço" em 28/08/2026. O módulo de tabela de preços saiu
  // em 26/08 e a tabela nem existe mais no banco — o título continuava prometendo uma tela
  // que não abre em lugar nenhum, e quem procurasse preço aqui não acharia nada.
  return (
    <AppLayout
      title="Fabricantes"
      subtitle="Representadas, seus contatos e os arquivos de cada uma"
      mainClassName="flex-1 overflow-hidden flex flex-col"
    >
      <div className="p-4 md:p-6 w-full flex-1 flex flex-col min-h-0 h-full">
        {/* `grid-rows-1` em TODA largura (era só a partir de `lg`): é ele que dá
            altura DEFINIDA à linha. Sem isso, o card da esquerda — que agora usa
            `h-full` no lugar dos 795px fixos — cresceria com a lista inteira e
            estouraria a tela, em vez de rolar por dentro. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 h-full grid-rows-1">
          {/* ── Left Panel: Fabricantes List ─────────────────────── */}
          {/* `2xl:col-span-3` e não `xl:`: 3 de 12 colunas numa grade só um pouco
              maior dá MENOS pixels que 4 de 12, então cruzar 1280px ENCOLHIA esta
              coluna em ~100px. Era por isso que diminuir o zoom um passo piorava
              antes de melhorar, e o cliente precisava reduzir várias vezes.
              A barra lateral (64px recolhida, 256px aberta) come largura que os
              pontos de quebra do Tailwind não enxergam — eles medem a JANELA. */}
          <div
            className={`lg:col-span-4 2xl:col-span-3 flex flex-col min-h-0 ${showingDetail ? "hidden lg:block" : ""}`}
          >
            {/* Altura pelo espaço que existe, não por número mágico: `h-[795px]`
                exigia janela de ~931px de altura e o pé do card ficava fora da
                tela em qualquer notebook, sem rolagem para alcançar. */}
            <Card className="rounded-xl border-border/60 flex flex-col overflow-hidden h-full max-h-full w-full">
              <CardHeader className="pb-3 flex-none">
                {/* O botão "Novo" era LITERALMENTE recortado: sem `flex-wrap`, sem
                    `min-w-0` no título e sem `shrink-0` nos botões, a linha
                    estourava para a direita e o `overflow-hidden` do Card cortava
                    o excedente — e o app não tem rolagem horizontal em lugar
                    nenhum. Agora o título vira reticências primeiro; se ainda
                    faltar espaço, os botões descem para a linha de baixo. */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base font-bold flex items-center gap-2 min-w-0">
                      <Factory className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">Fabricantes</span>
                    </CardTitle>
                    <CardDescription className="text-xs truncate">
                      {fabricantesList.length} cadastrado
                      {fabricantesList.length !== 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditFab(null);
                        setFabDialog(true);
                      }}
                      className="gap-1.5 h-9 bg-primary hover:bg-primary/90"
                      title="Cadastrar novo fabricante"
                      aria-label="Cadastrar novo fabricante"
                    >
                      <Plus className="h-4 w-4" /> Novo
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col min-h-0 gap-3 pb-3">
                <div className="flex-none">
                  <SearchWithRecent
                    placeholder="Buscar fabricante..."
                    value={search}
                    onValueChange={handleSearchChange}
                    storageKey="fabricantes_recent_searches"
                  />
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-12 flex-1">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : fabricantesList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 text-center">
                    <Factory className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">
                      Nenhum fabricante cadastrado
                    </p>
                    {/* O botão se chama "Novo", não "Novo Fabricante". Mandar
                        procurar um rótulo que não existe faz a pessoa concluir
                        que o botão sumiu. */}
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Clique em "Novo", no topo desta lista, para adicionar.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                    {fabricantesList.map((f) => (
                      <div key={f.id} id={`fab-card-${f.id}`}>
                        <FabricanteCard
                          fab={f}
                          isSelected={selectedFabId === f.id}
                          onClick={() => setSelectedFabId(f.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right Panel: Details + Price Table ───────────────── */}
          <div
            className={`lg:col-span-8 2xl:col-span-9 flex flex-col gap-4 min-h-0 h-full ${!showingDetail ? "hidden lg:block" : ""}`}
          >
            {selectedFab ? (
              <>
                {/* Mobile back button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden gap-1.5 mb-2 -ml-1 text-muted-foreground flex-none"
                  onClick={() => setSelectedFabId(null)}
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>

                <div className="flex-none">
                  <FabricanteDetailHeader
                    fab={selectedFab}
                    onEdit={() => {
                      setEditFab(selectedFab);
                      setFabDialog(true);
                    }}
                    onDelete={() =>
                      setDeleteAlert({ type: "fab", id: selectedFab.id })
                    }
                  />
                </div>

                {/* O drive ocupa o lugar do antigo cartão "Catálogo de Produtos", que saiu
                    em 26/08/2026 (commit acbcb415) sem nunca ter tido dado real — zero linhas
                    nas 8 empresas. A tabela nem existe mais no banco. */}
                <DriveDaFabrica fabricanteId={selectedFab.id} empresaId={selectedFab.empresa_id} />
              </>
            ) : (
              <Card className="rounded-xl border-border/60 flex-1 flex flex-col min-h-0 overflow-hidden">
                <CardContent className="flex flex-col items-center justify-center flex-1 text-center py-24">
                  <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                    <Factory className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-base font-medium text-muted-foreground">
                    Selecione um fabricante
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1 max-w-sm">
                    Escolha um fabricante na lista ao lado para ver os dados dele e os
                    arquivos do drive
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <FabricanteForm
        open={fabDialog}
        onOpenChange={setFabDialog}
        editData={editFab}
      />
      <AlertDialog
        open={!!deleteAlert}
        onOpenChange={(o) => !o && setDeleteAlert(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppLayout>
  );
};

export default Fabricantes;
