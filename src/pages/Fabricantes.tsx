import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFabricantes } from "@/hooks/use-clientes";
import { useCreateFabricante } from "@/hooks/use-mutations";
import {
  useTabelaPrecos,
  useCreatePreco,
  useUpdatePreco,
  useDeletePreco,
  useBulkDeletePrecos,
  useUpdateFabricante,
  useDeleteFabricante,
  useCategorias,
} from "@/hooks/use-fabricantes";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Loader2,
  CheckCircle2,
  Search,
  Pencil,
  Trash2,
  Factory,
  Package,
  Phone,
  Mail,
  User,
  ArrowLeft,
  Hash,
  Upload,
  ImageIcon,
  Eye,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ColumnSettings,
  type ColumnDefinition,
} from "@/components/shared/ColumnSettings";
import { useTableSettings } from "@/hooks/use-table-settings";
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
import { ListPagination } from "@/components/shared/ListPagination";
import { ResizableTh } from "@/components/shared/ResizableTh";
import { ProductImageUpload } from "@/components/catalogo/ProductImageUpload";
import { ImportCatalogoDialog } from "@/components/catalogo/ImportCatalogoDialog";
import { GlobalImportCatalogoDialog } from "@/components/catalogo/GlobalImportCatalogoDialog";
import { cn } from "@/lib/utils";
import { FilterButton } from "@/components/shared/FilterButton";
import { Filter } from "lucide-react";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { SearchWithRecent } from "@/components/shared/SearchWithRecent";
import { ProductForm } from "@/components/catalogo/ProductForm";

const PRECOS_COLUMNS: ColumnDefinition[] = [
  { id: "descricao", label: "Produto", locked: false },
  { id: "imagem", label: "Fotos", locked: false },
  { id: "estoque", label: "Estoque Disponível", locked: false },
  { id: "unidade", label: "Unidade de Medida", locked: false },
  { id: "preco", label: "Preço de Varejo", locked: false },
  { id: "categoria", label: "Categoria", locked: false },
  { id: "referencia", label: "Referência", locked: false },
  { id: "status", label: "Status", locked: false },
  { id: "acoes", label: "Ações", locked: false },
];

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
  const sessionRef = useRef(0);

  const reset = () => {
    sessionRef.current += 1;
    setCnpj("");
    setCnpjStatus("idle");
    setNome("");
    setContato("");
    setTelefone("");
  };

  useEffect(() => {
    if (open) {
      sessionRef.current += 1;
      setCnpj(editData?.cnpj ?? "");
      setCnpjStatus("idle");
      setNome(editData?.nome ?? "");
      setContato(editData?.nome_contato ?? "");
      setTelefone(editData?.telefone ?? "");
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
        });
        toast.success("Fabricante atualizado!");
      } else {
        await createFabricante.mutateAsync({
          nome,
          cnpj: cnpj || undefined,
          nome_contato: contato || undefined,
          telefone: telefone || undefined,
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
      <DialogContent className="sm:max-w-[425px]">
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
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ProductForm component is now imported from @/components/catalogo/ProductForm

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
          <p className="font-semibold text-sm text-foreground truncate">
            {fab.nome}
          </p>
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
              <h2 className="text-foreground font-bold text-base sm:text-lg truncate">
                {fab.nome}
              </h2>
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
  const [precoDialog, setPrecoDialog] = useState(false);
  const [editPreco, setEditPreco] = useState<any>(null);
  const [importDialog, setImportDialog] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [globalImportOpen, setGlobalImportOpen] = useState(false);
  const [selectedPrecoIds, setSelectedPrecoIds] = useState<string[]>([]);
  const [confirmBulkDeletePrecos, setConfirmBulkDeletePrecos] = useState(false);
  const [deleteAlert, setDeleteAlert] = useState<{
    type: "fab" | "preco";
    id: string;
  } | null>(null);

  const {
    columns: precoColumns,
    visibleColumns: visiblePrecoColumns,
    setVisibleColumns: setVisiblePrecoColumns,
    pageSize: precoPageSize,
    setPageSize: setPrecoPageSize,
    handleRename: handlePrecoRename,
    handleTypeChange: handlePrecoTypeChange,
    handleAddColumn: handleAddPrecoColumn,
    handleRemoveColumn: handleRemovePrecoColumn,
    handleReorder: handlePrecoReorder,
    getLabel: getPrecoLabel,
    presets: precoPresets,
    savePreset: savePrecoPreset,
    loadPreset: loadPrecoPreset,
    deletePreset: deletePrecoPreset,
    columnWidths: precoColumnWidths,
    setColumnWidth: setPrecoColumnWidth,
  } = useTableSettings({
    key: "fabricantes_precos",
    defaultColumns: PRECOS_COLUMNS,
  });

  const deleteFabricante = useDeleteFabricante();
  const deletePreco = useDeletePreco();
  const bulkDeletePrecos = useBulkDeletePrecos();
  const { data: precos, isLoading: loadingPrecos } =
    useTabelaPrecos(selectedFabId);

  const selectedFab = fabricantes?.find((f) => f.id === selectedFabId);
  const fabricantesList = [...(fabricantes ?? [])]
    .filter((f) => (f.nome || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  const categoriasPreco = Array.from(
    new Set((precos ?? []).map((p: any) => p.categoria).filter(Boolean)),
  ) as string[];
  const precosFiltrados = (precos ?? []).filter(
    (p: any) => filtroCategoria === "todas" || p.categoria === filtroCategoria,
  );

  const hasFilters = filtroCategoria !== "todas";
  const activeFilterCount = filtroCategoria !== "todas" ? 1 : 0;

  // Larguras resolvidas na mesma ordem das colunas visíveis, usadas no <colgroup> e nos
  // cabeçalhos — a tabela precisa de largura própria explícita (não w-full/auto) + colgroup,
  // senão o navegador redistribui as larguras proporcionalmente ao redimensionar uma coluna.
  const PRECO_CHECKBOX_COL_WIDTH = 40;
  const resolvedPrecoColWidths = visiblePrecoColumns.map(
    (colId) => precoColumnWidths[colId] ?? (colId === "imagem" ? 64 : colId === "acoes" ? 80 : 150),
  );
  const precoTableTotalWidth = PRECO_CHECKBOX_COL_WIDTH + resolvedPrecoColWidths.reduce((a, b) => a + b, 0);

  // precoColumns is now handled by the hook

  const handleSearchChange = (val: string) => {
    setSearch(val);
  };

  useEffect(() => {
    setSelectedPrecoIds([]);
  }, [selectedFabId]);

  const togglePrecoSelection = (id: string) => {
    setSelectedPrecoIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleSelectAllPrecos = () => {
    setSelectedPrecoIds((prev) =>
      prev.length === precosFiltrados.length
        ? []
        : precosFiltrados.map((p: any) => p.id),
    );
  };

  const handleBulkDeletePrecos = async () => {
    try {
      await bulkDeletePrecos.mutateAsync(selectedPrecoIds);
      toast.success(`${selectedPrecoIds.length} produto(s) excluído(s) com sucesso!`);
      setSelectedPrecoIds([]);
      setConfirmBulkDeletePrecos(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir produtos em massa");
    }
  };

  const handleDelete = async () => {
    if (!deleteAlert) return;
    try {
      if (deleteAlert.type === "fab") {
        // Não apagar tabela_precos manualmente antes: fabricantes.id tem ON DELETE CASCADE
        // sobre tabela_precos, então o próprio delete do fabricante já cuida disso. Apagar
        // antes separadamente arriscava excluir o catálogo mesmo quando o delete do
        // fabricante era bloqueado (RLS ou FK), deixando o fabricante órfão sem produtos.
        await deleteFabricante.mutateAsync(deleteAlert.id);
        if (selectedFabId === deleteAlert.id) setSelectedFabId(null);
        toast.success("Fabricante excluído!");
      } else {
        await deletePreco.mutateAsync(deleteAlert.id);
        toast.success("Item excluído!");
      }
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

  return (
    <AppLayout
      title="Fabricantes & Tabelas de Preço"
      subtitle={`${fabricantes?.length ?? 0} fabricantes cadastrados`}
      mainClassName="flex-1 overflow-hidden flex flex-col"
    >
      <div className="p-4 md:p-6 w-full flex-1 flex flex-col min-h-0 h-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 h-full lg:grid-rows-1">
          {/* ── Left Panel: Fabricantes List ─────────────────────── */}
          <div
            className={`lg:col-span-4 xl:col-span-3 flex flex-col min-h-0 self-start ${showingDetail ? "hidden lg:block" : ""}`}
          >
            <Card className="rounded-xl border-border/60 flex flex-col overflow-hidden h-[795px] w-full">
              <CardHeader className="pb-3 flex-none">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Factory className="h-4 w-4 text-primary" /> Fabricantes
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {fabricantesList.length} cadastrado
                      {fabricantesList.length !== 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setGlobalImportOpen(true)}
                      className="h-9 w-9"
                      title="Importar fabricantes"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditFab(null);
                        setFabDialog(true);
                      }}
                      className="gap-1.5 h-9 bg-primary hover:bg-primary/90"
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
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Clique em "Novo Fabricante" para adicionar.
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
            className={`lg:col-span-8 xl:col-span-9 flex flex-col gap-4 min-h-0 h-full ${!showingDetail ? "hidden lg:block" : ""}`}
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

                {/* Price Table */}
                <Card className="rounded-xl border-border/60 flex-1 flex flex-col min-h-0 overflow-hidden">
                  <CardHeader className="pb-3 flex-none">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" /> Catálogo
                          de Produtos
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {precos?.length ?? 0} produto
                          {(precos?.length ?? 0) !== 1 ? "s" : ""} cadastrado
                          {(precos?.length ?? 0) !== 1 ? "s" : ""}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <FilterButton
                          hasFilters={hasFilters}
                          activeFilterCount={activeFilterCount}
                          onClear={() => setFiltroCategoria("todas")}
                          className="h-9"
                        >
                          <div className="space-y-2">
                            <Label className="text-xs uppercase text-muted-foreground font-semibold">
                              Categoria
                            </Label>
                            <SearchableSelect
                              options={[
                                { value: "todas", label: "Todas categorias" },
                                ...categoriasPreco.map((c) => ({
                                  value: c,
                                  label: c,
                                })),
                              ]}
                              value={filtroCategoria}
                              onValueChange={setFiltroCategoria}
                              placeholder="Filtrar por categoria"
                            />
                          </div>
                        </FilterButton>

                        <ColumnSettings
                          columns={precoColumns}
                          visibleColumns={visiblePrecoColumns}
                          onChange={setVisiblePrecoColumns}
                          onRename={handlePrecoRename}
                          onTypeChange={handlePrecoTypeChange}
                          onReorder={handlePrecoReorder}
                          onAdd={handleAddPrecoColumn}
                          onRemove={handleRemovePrecoColumn}
                          presets={precoPresets}
                          onSavePreset={savePrecoPreset}
                          onLoadPreset={loadPrecoPreset}
                          onDeletePreset={deletePrecoPreset}
                          className="h-9"
                        />

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setNewCategoryOpen(true)}
                          className="gap-1.5 h-9"
                          title="Criar nova categoria para este fabricante"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Nova Categoria</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setImportDialog(true)}
                          className="gap-1.5 h-9"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>Importar</span>
                        </Button>

                        {selectedPrecoIds.length > 0 && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedPrecoIds([])}
                              className="gap-1.5 h-9"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Cancelar</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={bulkDeletePrecos.isPending}
                              onClick={() => setConfirmBulkDeletePrecos(true)}
                              className="gap-1.5 h-9"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>
                                Excluir Selecionados (
                                {selectedPrecoIds.length})
                              </span>
                            </Button>
                          </>
                        )}

                        <Button
                          size="sm"
                          onClick={() => {
                            setEditPreco(null);
                            setPrecoDialog(true);
                          }}
                          className="gap-1.5 h-9 bg-primary hover:bg-primary/90"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Novo Produto</span>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 flex-1 flex flex-col min-h-0 pb-4">
                    {loadingPrecos ? (
                      <div className="flex justify-center items-center flex-1 py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : precosFiltrados.length > 0 ? (
                      <div className="rounded-lg border border-border/50 overflow-auto flex-1 min-h-0">
                        <Table className="table-fixed" style={{ width: precoTableTotalWidth }}>
                          <colgroup>
                            <col style={{ width: PRECO_CHECKBOX_COL_WIDTH }} />
                            {visiblePrecoColumns.map((colId, i) => (
                              <col key={colId} style={{ width: resolvedPrecoColWidths[i] }} />
                            ))}
                          </colgroup>
                          <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 shadow-sm">
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead className="w-10 px-4 py-3">
                                <Checkbox
                                  checked={
                                    precosFiltrados.length > 0 &&
                                    selectedPrecoIds.length ===
                                      precosFiltrados.length
                                  }
                                  onCheckedChange={toggleSelectAllPrecos}
                                  aria-label="Selecionar todos"
                                />
                              </TableHead>
                              {visiblePrecoColumns.map((colId, i) => (
                                <ResizableTh
                                  key={colId}
                                  width={resolvedPrecoColWidths[i]}
                                  onResize={(w) => setPrecoColumnWidth(colId, w)}
                                  className="text-xs font-semibold whitespace-nowrap px-4 py-3"
                                >
                                  {getPrecoLabel(colId)}
                                </ResizableTh>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {precosFiltrados.map((p: any) => {
                              const camposExtras = p.campos_extras || {};
                              return (
                                <TableRow
                                  key={p.id}
                                  className={cn(
                                    "group",
                                    selectedPrecoIds.includes(p.id) &&
                                      "bg-primary/5",
                                  )}
                                >
                                  <TableCell className="w-10 px-4">
                                    <Checkbox
                                      checked={selectedPrecoIds.includes(p.id)}
                                      onCheckedChange={() =>
                                        togglePrecoSelection(p.id)
                                      }
                                      aria-label="Selecionar produto"
                                    />
                                  </TableCell>
                                  {visiblePrecoColumns.map((colId) => {
                                    const isCustom =
                                      colId.startsWith("custom_");
                                    if (isCustom) {
                                      return (
                                        <TableCell
                                          key={colId}
                                          className="text-xs text-muted-foreground"
                                        >
                                          {camposExtras[colId] || "—"}
                                        </TableCell>
                                      );
                                    }

                                    switch (colId) {
                                      case "imagem":
                                        return (
                                          <TableCell key={colId}>
                                            <div className="h-10 w-10 rounded-md bg-muted/40 border border-border/40 overflow-hidden flex items-center justify-center">
                                              {p.imagem_url ? (
                                                <img
                                                  src={p.imagem_url}
                                                  alt={p.descricao_material}
                                                  className="h-full w-full object-cover"
                                                  loading="lazy"
                                                />
                                              ) : (
                                                <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                                              )}
                                            </div>
                                          </TableCell>
                                        );
                                      case "descricao":
                                        return (
                                          <TableCell
                                            key={colId}
                                            className="font-medium text-sm"
                                          >
                                            {p.descricao_material}
                                          </TableCell>
                                        );
                                      case "estoque":
                                        return (
                                          <TableCell
                                            key={colId}
                                            className="text-sm text-muted-foreground"
                                          >
                                            {p.estoque_disponivel ?? 0}
                                          </TableCell>
                                        );
                                      case "categoria":
                                        return (
                                          <TableCell
                                            key={colId}
                                            className="text-xs"
                                          >
                                            {p.categoria ? (
                                              <Badge
                                                variant="secondary"
                                                className="font-normal"
                                              >
                                                {p.categoria}
                                              </Badge>
                                            ) : (
                                              <span className="text-muted-foreground">
                                                -
                                              </span>
                                            )}
                                          </TableCell>
                                        );
                                      case "referencia":
                                        return (
                                          <TableCell
                                            key={colId}
                                            className="text-sm text-muted-foreground"
                                          >
                                            {p.referencia ?? "-"}
                                          </TableCell>
                                        );
                                      case "preco":
                                        return (
                                          <TableCell
                                            key={colId}
                                            className="text-sm font-semibold text-foreground"
                                          >
                                            {Number(
                                              p.preco_unitario,
                                            ).toLocaleString("pt-BR", {
                                              style: "currency",
                                              currency: "BRL",
                                            })}
                                          </TableCell>
                                        );
                                      case "unidade":
                                        return (
                                          <TableCell
                                            key={colId}
                                            className="text-sm text-muted-foreground"
                                          >
                                            {p.unidade ?? "-"}
                                          </TableCell>
                                        );
                                      case "status":
                                        return (
                                          <TableCell key={colId}>
                                            <Badge
                                              variant={
                                                p.vigente
                                                  ? "default"
                                                  : "secondary"
                                              }
                                              className={
                                                p.vigente
                                                  ? "bg-success/15 text-success border-success/20 hover:bg-success/20"
                                                  : ""
                                              }
                                            >
                                              {p.vigente
                                                ? "Vigente"
                                                : "Inativo"}
                                            </Badge>
                                          </TableCell>
                                        );
                                      case "acoes":
                                        return (
                                          <TableCell key={colId}>
                                            <div className="flex justify-center">
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditPreco(p);
                                                  setPrecoDialog(true);
                                                }}
                                                title="Visualizar/Editar produto"
                                              >
                                                <Eye className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                        );
                                      default:
                                        return (
                                          <TableCell key={colId}>—</TableCell>
                                        );
                                    }
                                  })}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-12 text-center">
                        <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground font-medium">
                          Nenhum produto cadastrado
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Adicione produtos ao catálogo deste fabricante
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                          <Button
                            variant="outline"
                            className="gap-2 h-10 px-6"
                            onClick={() => setImportDialog(true)}
                          >
                            <Upload className="h-4 w-4" /> Importar planilha
                          </Button>
                          <Button
                            className="gap-2 h-10 px-6 bg-primary hover:bg-primary/90"
                            onClick={() => {
                              setEditPreco(null);
                              setPrecoDialog(true);
                            }}
                          >
                            <Plus className="h-4 w-4" /> Adicionar produto
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
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
                    Escolha um fabricante na lista ao lado para visualizar seus
                    detalhes e tabela de preços
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
      {selectedFabId && (
        <ProductForm
          open={precoDialog}
          onOpenChange={setPrecoDialog}
          fabricanteId={selectedFabId}
          editData={editPreco}
          initialCategory={newCategoryName}
          onDeleteClick={(id) => {
            setPrecoDialog(false);
            setDeleteAlert({ type: "preco", id });
          }}
        />
      )}

      {selectedFabId && (
        <ImportCatalogoDialog
          open={importDialog}
          onOpenChange={setImportDialog}
          fabricanteId={selectedFabId}
          fabricanteNome={selectedFab?.nome}
        />
      )}

      <GlobalImportCatalogoDialog
        open={globalImportOpen}
        onOpenChange={setGlobalImportOpen}
        onFabricanteChange={(id) => {
          setSelectedFabId(id);
          setGlobalImportOpen(false);
        }}
      />

      <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
        <DialogContent className="w-[95vw] max-w-md sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da Categoria</Label>
              <Input
                placeholder="Ex: Cerâmicas, Ferramentas..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Dica: Você também pode criar categorias diretamente ao adicionar
                ou editar um produto.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setNewCategoryOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  if (newCategoryName.trim()) {
                    setEditPreco(null);
                    setPrecoDialog(true);
                  }
                }}
              >
                Continuar para Novo Produto
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <AlertDialog
        open={confirmBulkDeletePrecos}
        onOpenChange={setConfirmBulkDeletePrecos}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selectedPrecoIds.length} produtos?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os{" "}
              {selectedPrecoIds.length} produtos selecionados serão removidos
              permanentemente do catálogo deste fabricante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeletePrecos}
              disabled={bulkDeletePrecos.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeletePrecos.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Excluir Todos"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Fabricantes;
