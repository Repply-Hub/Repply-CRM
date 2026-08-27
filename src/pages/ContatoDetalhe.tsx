import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useContatos, useClientes } from '@/hooks/use-clientes';
import { useUpdateContato, useDeleteContato } from '@/hooks/use-mutations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConteudoDialogo } from '@/components/shared/DialogoResponsivo';
import { EmpresaSelector } from '@/components/shared/EmpresaSelector';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, User, Mail, Phone, Loader2, Pencil, Trash2, Building2, Calendar, Clock, MessageSquare, History, Factory, DollarSign, Plus, ListChecks, HardHat } from 'lucide-react';
import { toast } from 'sonner';
import { slugify } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePedidos } from '@/hooks/use-pedidos';
import { useHistoricoContatos } from '@/hooks/use-pedidos';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useTarefas } from '@/hooks/use-tarefas';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { useTarefasKanbanColunas } from '@/hooks/use-tarefas-kanban-colunas';
import { TarefaFormDialog } from '@/components/tarefas/TarefaFormDialog';
import { ListPagination } from '@/components/shared/ListPagination';
import { CargoSelect } from '@/components/shared/CargoSelect';
import { ConfirmarEnviarEmailDialog } from '@/components/email/ConfirmarEnviarEmailDialog';
import { useObrasDoContato, useSalvarObrasDoContato } from '@/hooks/use-obra-contatos';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Os ids das obras que já vieram embutidos no próprio contato (`useContatos`), como
 * rede para a consulta dedicada que pode não ter voltado ainda. Devolve `null` quando
 * o embed não veio — que é diferente de "veio e está vazio".
 */
function obrasDoEmbed(contato: unknown): string[] | null {
  const vinculos = (contato as { vinculos_obra?: { obra?: { id?: string } }[] } | undefined)?.vinculos_obra;
  if (!Array.isArray(vinculos)) return null;
  return vinculos.map((v) => v.obra?.id).filter((id): id is string => !!id);
}

const TAREFAS_PAGE_SIZE = 5;

const ContatoDetalhe = () => {
  const { slug } = useParams<{ slug: string }>();
  const id = useMemo(() => {
    if (!slug) return null;
    
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = slug.match(uuidRegex);
    
    if (match) return match[0];
    return slug;
  }, [slug]);

  const navigate = useNavigate();
  const [emailParaConfirmar, setEmailParaConfirmar] = useState<string | null>(null);
  const { data: contatos, isLoading } = useContatos();

  // Debug log
  console.log('ContatoDetalhe - slug:', slug, 'extracted id:', id);
  if (contatos) {
    const found = contatos.find(c => c.id === id);
    console.log('ContatoDetalhe - contato encontrado:', !!found);
  }
  const { data: clientes } = useClientes();
  const { data: todosPedidosResult } = usePedidos(undefined, 0, 500);
  const todosPedidos = todosPedidosResult?.data ?? [];
  const updateContato = useUpdateContato();
  const deleteContato = useDeleteContato();
  const [editOpen, setEditOpen] = useState(false);

  const contato = contatos?.find(c => c.id === id);
  const clienteVinculado = clientes?.find(c => c.empresa === contato?.empresa);
  // As obras vêm da tabela de vínculo, não mais de `contatos.obra_id` (que virou
  // coluna órfã em 27/08/2026) — ver `use-obra-contatos.ts`.
  const { data: obrasDoContato } = useObrasDoContato(contato?.id);
  const salvarObrasDoContato = useSalvarObrasDoContato();
  const [vincularOpen, setVincularOpen] = useState(false);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');

  const pedidosRelacionados = todosPedidos?.filter(p => p.cliente_id === clienteVinculado?.id) || [];
  const { data: historico } = useHistoricoContatos(null); // Just for structure, we might need a specific filter or mock if no direct link exists yet.

  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const { data: tarefas, isLoading: loadingTarefas } = useTarefas();
  const { ligada: temTarefas } = useSecaoLigada('tarefas');
  const { ligada: temEmails } = useSecaoLigada('emails');
  // Empresa que não contratou a seção Obras não deve ver o cartão de obras nem o
  // campo de vínculo na edição — o mesmo gate que ClienteDetalhe já aplica.
  const { ligada: temObras } = useSecaoLigada('obras');
  const { data: tarefasKanbanColunas = [] } = useTarefasKanbanColunas(empresaId);
  const tarefaKanbanStages = useMemo(
    () => tarefasKanbanColunas.map(c => ({ key: c.slug, label: c.nome })),
    [tarefasKanbanColunas]
  );
  const [addTarefaOpen, setAddTarefaOpen] = useState(false);
  const [tarefasPage, setTarefasPage] = useState(1);
  const tarefasRelacionadas = useMemo(
    () => (tarefas ?? []).filter(t => t.cliente_id === clienteVinculado?.id),
    [tarefas, clienteVinculado]
  );
  const totalTarefasPages = Math.max(1, Math.ceil(tarefasRelacionadas.length / TAREFAS_PAGE_SIZE));
  const paginatedTarefas = useMemo(
    () => tarefasRelacionadas.slice((tarefasPage - 1) * TAREFAS_PAGE_SIZE, tarefasPage * TAREFAS_PAGE_SIZE),
    [tarefasRelacionadas, tarefasPage]
  );
  
  const copyInfo = async (label: string, value?: string | null) => {
    if (!value?.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      toast.success(`${label} copiado!`);
    } catch {
      toast.error('Não foi possível copiar a informação.');
    }
  };

  const [editData, setEditData] = useState({
    nome_contato: '',
    email: '',
    telefone: '',
    cargo: '',
    empresa: '',
    // Lista, e não mais um id só: o vínculo virou N:N em 27/08/2026. `null` enquanto
    // as obras não chegaram — gravar a lista completa com `[]` apagaria os vínculos
    // existentes de quem abrisse e salvasse antes da consulta voltar.
    obraIds: null as string[] | null,
  });

  const openEdit = () => {
    if (!contato) return;
    setEditData({
      nome_contato: contato.nome_contato ?? '',
      email: contato.email ?? '',
      telefone: contato.telefone ?? '',
      cargo: (contato as any).cargo ?? '',
      empresa: contato.empresa ?? '',
      // A marcação sai de uma foto tirada no clique de "Editar" — e não há efeito que
      // a atualize depois. Se a consulta dedicada ainda não voltou, cai no vínculo que
      // JÁ veio junto com o contato (o embed da lista, que é o que libera esta página):
      // sem essa rede, o campo ficaria eternamente "carregando" e o salvar pularia os
      // vínculos em silêncio. `null` só sobra quando nenhuma das duas fontes tem dado —
      // e aí a gravação do vínculo é pulada de propósito, para não apagar nada.
      obraIds: obrasDoContato
        ? obrasDoContato.map((o) => o.id)
        : obrasDoEmbed(contato) ?? null,
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await updateContato.mutateAsync({
        id,
        nome_contato: editData.nome_contato,
        email: editData.email || undefined,
        telefone: editData.telefone || undefined,
        cargo: editData.cargo || undefined,
        empresa: editData.empresa || undefined,
      });
      // O vínculo com obras mora em outra tabela: grava em seguida, e um erro aqui
      // não pode fazer parecer que a edição do contato inteira falhou.
      if (editData.obraIds !== null) {
        try {
          await salvarObrasDoContato.mutateAsync({ contatoId: id, obraIds: editData.obraIds });
        } catch {
          toast.warning('Contato salvo, mas não deu para atualizar as obras vinculadas.');
        }
      }
      toast.success('Contato atualizado com sucesso!');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!contato) {
    return (
      <AppLayout>
        <div className="p-3 sm:p-4 md:p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <p className="text-muted-foreground mt-8 text-center">Contato não encontrado.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      headerContent={
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <SidebarTrigger className="shrink-0 h-8 w-8 md:hidden" />
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">
              {contato.nome_contato}
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-muted-foreground truncate">{contato.empresa || 'Sem empresa'}</span>
              {(contato as any).cargo && <Badge variant="secondary" className="text-[10px]">{(contato as any).cargo}</Badge>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 ml-auto">
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. O contato "{contato.nome_contato}" será removido permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      try {
                        await deleteContato.mutateAsync(id!);
                        toast.success('Contato excluído com sucesso!');
                        navigate('/clientes');
                      } catch (err: any) {
                        toast.error(err.message);
                      }
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      }
    >
      <div className="p-3 sm:p-4 md:p-6 space-y-6 w-full">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Card: Perfil e Empresa */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Vínculo Corporativo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-xs text-muted-foreground mb-1">Empresa</p>
                <p className="text-base font-bold text-foreground truncate">{contato.empresa || 'Não informada'}</p>
                {clienteVinculado ? (
                  <Button 
                    variant="link" 
                    className="p-0 h-auto text-xs text-primary font-semibold mt-2 hover:no-underline"
                    onClick={() => {
                      const slug = slugify(clienteVinculado.empresa || 'cliente');
                      navigate(`/clientes/${slug}-${clienteVinculado.id}`);
                    }}
                  >
                    Ver perfil da empresa →
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2 w-full text-xs gap-1.5"
                    onClick={() => setVincularOpen(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Vincular Empresa
                  </Button>
                )}
              </div>
              {/* LISTA de obras, não uma só: desde 27/08/2026 a mesma pessoa pode
                  responder por vários canteiros do mesmo cliente. Quem cria e desfaz o
                  vínculo é a ficha da OBRA — aqui é a visão de leitura, com atalho. */}
              {temObras !== false && obrasDoContato && obrasDoContato.length > 0 && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <HardHat className="h-3.5 w-3.5" />
                    {obrasDoContato.length === 1 ? 'Obra' : `Obras (${obrasDoContato.length})`}
                  </p>
                  <div className="space-y-2">
                    {obrasDoContato.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        // Abre a FICHA da obra, igual ao que a ficha do cliente e a de
                        // negócios já fazem — a mesma ação tem que levar ao mesmo lugar.
                        onClick={() => navigate('/obras', { state: { selectedObraId: o.id } })}
                        className="block w-full text-left group"
                      >
                        <span className="text-sm font-bold text-foreground truncate block group-hover:text-primary transition-colors">
                          {o.nomeObra || 'Obra sem nome'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cargo</span>
                  <span className="font-medium">{(contato as any).cargo || '—'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Criado em</span>
                  <span className="font-medium">
                    {contato.created_at ? format(new Date(contato.created_at), "dd/MM/yyyy", { locale: ptBR }) : '—'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Contato Direto */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Canais de Comunicação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-muted/30 flex items-start gap-3 group hover:border-primary/30 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center border shadow-sm shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">E-mail Corporativo</p>
                    <p className="text-sm font-semibold text-foreground truncate">{contato.email || 'Não informado'}</p>
                    {/* Some só o atalho de envio, que levaria a uma tela que a rota recusa.
                        O endereço logo acima é dado cadastral do contato e fica. */}
                    {temEmails === true && contato.email && (
                      <Button
                        variant="link"
                        className="p-0 h-auto text-[11px] mt-1"
                        onClick={() => setEmailParaConfirmar(contato.email)}
                      >
                        Enviar e-mail
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-xl border bg-muted/30 flex items-start gap-3 group hover:border-primary/30 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center border shadow-sm shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">Telefone / WhatsApp</p>
                    <p className="text-sm font-semibold text-foreground truncate">{contato.telefone || 'Não informado'}</p>
                    {contato.telefone && (
                      <Button variant="link" className="p-0 h-auto text-[11px] mt-1" onClick={() => copyInfo('Telefone', contato.telefone)}>
                        Copiar número
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Card: Resumo de Negócios */}
          <Card className="md:col-span-3">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <History className="h-4 w-4" /> Histórico de Negócios (Via Empresa)
              </CardTitle>
              <Badge variant="outline">{pedidosRelacionados.length} Registros</Badge>
            </CardHeader>
            <CardContent>
              {pedidosRelacionados.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed rounded-xl">
                  <p className="text-sm text-muted-foreground">Nenhum negócio vinculado a esta empresa.</p>
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Fabricante</TableHead>
                        <TableHead className="text-xs">Valor</TableHead>
                        <TableHead className="text-xs">Etapa</TableHead>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-right text-xs">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pedidosRelacionados.slice(0, 5).map(p => (
                        <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="font-medium text-sm">{(p as any).fabricante?.nome || '—'}</TableCell>
                          <TableCell className="text-sm font-semibold text-primary">
                            {(p.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] capitalize">{p.status.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(p.data_pedido), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/app`)} className="h-8 text-xs">
                              Ver Negócio
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {pedidosRelacionados.length > 5 && (
                    <div className="p-3 bg-muted/10 text-center border-t">
                      <Button variant="link" className="text-xs h-auto p-0" onClick={() => clienteVinculado && navigate(`/clientes/${clienteVinculado.id}`)}>
                        Ver todos os {pedidosRelacionados.length} negócios na página da empresa
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* A grade inteira sai quando a empresa não contratou Tarefas: ela só contém este
            card, então não sobra div vazia nem espaçamento fantasma. O TarefaFormDialog
            também está dentro e some junto, que é o desejado. */}
        {temTarefas === true && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Card: Tarefas Vinculadas */}
          <Card className="md:col-span-3">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Tarefas Vinculadas (Via Empresa)
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{tarefasRelacionadas.length} Registros</Badge>
                {clienteVinculado && (
                  <Button size="sm" onClick={() => setAddTarefaOpen(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Nova Tarefa
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!clienteVinculado ? (
                <div className="py-10 text-center border-2 border-dashed rounded-xl">
                  <p className="text-sm text-muted-foreground">Vincule este contato a uma empresa para ver e criar tarefas.</p>
                </div>
              ) : loadingTarefas ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Tarefa</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Prazo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tarefasRelacionadas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                            Nenhuma tarefa vinculada a esta empresa.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedTarefas.map(t => (
                          <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate('/tarefas')}>
                            <TableCell className="font-medium text-sm">{t.titulo}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-[10px]">{t.status.replace(/_/g, ' ')}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {t.prazo_final ? format(new Date(t.prazo_final), "dd/MM/yyyy", { locale: ptBR }) : '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  {tarefasRelacionadas.length > TAREFAS_PAGE_SIZE && (
                    <ListPagination
                      page={tarefasPage}
                      totalPages={totalTarefasPages}
                      totalItems={tarefasRelacionadas.length}
                      pageSize={TAREFAS_PAGE_SIZE}
                      onPageChange={setTarefasPage}
                      onPageSizeChange={() => {}}
                      itemLabel="tarefa"
                      className="mt-4 border-t pt-4"
                    />
                  )}
                </div>
              )}
            </CardContent>

            {clienteVinculado && (
              <TarefaFormDialog
                open={addTarefaOpen}
                onOpenChange={setAddTarefaOpen}
                editingTarefa={null}
                kanbanStages={tarefaKanbanStages}
                extraFields={{ cliente_id: clienteVinculado.id }}
              />
            )}
          </Card>
        </div>
        )}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <ConteudoDialogo>
            <DialogHeader>
              <DialogTitle>Editar Contato</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label>Nome do Contato</Label>
                <Input 
                  value={editData.nome_contato} 
                  onChange={e => setEditData(d => ({ ...d, nome_contato: e.target.value }))} 
                  required 
                />
        </div>

        <Dialog open={vincularOpen} onOpenChange={setVincularOpen}>
          <ConteudoDialogo className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Vincular Empresa</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Selecione a Empresa</Label>
                <EmpresaSelector 
                  value={selectedEmpresaId} 
                  onValueChange={setSelectedEmpresaId} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVincularOpen(false)}>Cancelar</Button>
              <Button 
                onClick={async () => {
                  const emp = clientes?.find(c => c.id === selectedEmpresaId);
                  if (emp && id) {
                    try {
                      await updateContato.mutateAsync({
                        id,
                        empresa: emp.empresa,
                        // Grava também a CHAVE, não só o nome em texto. Vincular só pelo
                        // texto era o que deixava o contato invisível em toda consulta
                        // que filtra por `cliente_id` — inclusive o seletor de contatos
                        // da obra, onde a pessoa some e acaba recadastrada em duplicata.
                        cliente_id: emp.id,
                      });
                      toast.success('Empresa vinculada com sucesso!');
                      setVincularOpen(false);
                    } catch (err: any) {
                      toast.error('Erro ao vincular: ' + err.message);
                    }
                  }
                }}
                disabled={!selectedEmpresaId || updateContato.isPending}
              >
                {updateContato.isPending ? 'Vinculando...' : 'Vincular'}
              </Button>
            </DialogFooter>
          </ConteudoDialogo>
        </Dialog>
              <div>
                <Label>E-mail</Label>
                <Input 
                  type="email" 
                  value={editData.email} 
                  onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} 
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input 
                  value={editData.telefone} 
                  onChange={e => setEditData(d => ({ ...d, telefone: e.target.value }))} 
                />
              </div>
              <div>
                <Label>Cargo</Label>
                <CargoSelect
                  value={editData.cargo}
                  onValueChange={v => setEditData(d => ({ ...d, cargo: v }))}
                />
              </div>
              {/* Marcação múltipla no lugar do seletor de obra única: a mesma pessoa
                  pode responder por vários canteiros. Nenhuma marcada = contato da
                  empresa toda, que continua sendo o estado normal. */}
              {temObras !== false && clienteVinculado?.obras && clienteVinculado.obras.length > 0 && (
                <div>
                  <Label>Obras deste contato</Label>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {editData.obraIds === null && (
                      <p className="px-1.5 py-1 text-xs text-muted-foreground">
                        Não foi possível carregar os vínculos. Feche e abra a edição de novo — nada
                        será alterado nas obras deste contato.
                      </p>
                    )}
                    {editData.obraIds !== null && clienteVinculado.obras.map((obra) => {
                      const marcada = editData.obraIds!.includes(obra.id);
                      return (
                        <label
                          key={obra.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm transition-colors hover:bg-accent/50"
                        >
                          <Checkbox
                            checked={marcada}
                            onCheckedChange={() =>
                              setEditData(d => ({
                                ...d,
                                obraIds: marcada
                                  ? (d.obraIds ?? []).filter(x => x !== obra.id)
                                  : [...(d.obraIds ?? []), obra.id],
                              }))
                            }
                          />
                          <span className="min-w-0 truncate">{obra.nome_obra || 'Obra sem nome'}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sem nenhuma marcada, o contato vale para a empresa toda.
                  </p>
                </div>
              )}
              <div>
                <Label>Empresa</Label>
                <Input 
                  value={editData.empresa} 
                  onChange={e => setEditData(d => ({ ...d, empresa: e.target.value }))} 
                />
              </div>
              <Button type="submit" className="w-full" disabled={updateContato.isPending}>
                {updateContato.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </form>
          </ConteudoDialogo>
        </Dialog>
      </div>

      <ConfirmarEnviarEmailDialog
        endereco={emailParaConfirmar}
        onCancelar={() => setEmailParaConfirmar(null)}
        onConfirmar={(endereco) => navigate(`/emails?to=${encodeURIComponent(endereco)}`)}
      />
    </AppLayout>
  );
};

export default ContatoDetalhe;
