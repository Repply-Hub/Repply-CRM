import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  ConfiguracaoCampo,
  EntidadeCampos,
  useConfiguracoesCampos,
  useToggleObrigatorioCampo,
  useCreateCampoCustomizado,
  useDeleteCampoCustomizado,
  useSetObrigatorioEscopo,
  useSetCampoEtapas,
  resolveFieldLabel,
} from '@/hooks/use-configuracoes-campos';
import { useKanbanColunasEmpresa, type KanbanColunaComFunil } from '@/hooks/use-kanban-colunas';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS } from '@/lib/toggle-group-styles';
import { cn } from '@/lib/utils';
import { Loader2, Trash2, Briefcase, Building2, Contact, HardHat, Plus, Settings2 } from 'lucide-react';

// Campos padrão de Negócios cujo valor não está disponível no card do Kanban em memória
// (vivem em outras tabelas — itens_pedido, historico_contatos — ou não têm coluna própria
// persistida). A obrigatoriedade por etapa continua valendo ao criar/editar, só não é
// checada ao arrastar o card no board.
const CAMPOS_SEM_GARANTIA_DRAG = ['origem_lead', 'itens', 'proximo_contato'];

function EscopoEtapasControl({ campo, colunasPorFunil }: { campo: ConfiguracaoCampo; colunasPorFunil: [string, KanbanColunaComFunil[]][] }) {
  const setEscopo = useSetObrigatorioEscopo();
  const setEtapas = useSetCampoEtapas();

  const toggleEtapa = (kanbanColunaId: string, checked: boolean) => {
    const next = checked
      ? [...campo.etapasObrigatorias, kanbanColunaId]
      : campo.etapasObrigatorias.filter(id => id !== kanbanColunaId);
    setEtapas.mutate({ configuracaoCampoId: campo.id, kanbanColunaIds: next });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground">
          <Settings2 className="h-3 w-3" />
          {campo.obrigatorio_escopo === 'etapas' ? `${campo.etapasObrigatorias.length} etapa(s)` : 'Sempre'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Obrigatório em quais etapas do funil?</Label>
          <RadioGroup
            value={campo.obrigatorio_escopo}
            onValueChange={(v) => setEscopo.mutate({ id: campo.id, escopo: v as 'global' | 'etapas' })}
          >
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="global" /> Sempre
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="etapas" /> Apenas em etapas específicas
            </label>
          </RadioGroup>
        </div>
        {campo.obrigatorio_escopo === 'etapas' && (
          <div className="space-y-2 border-t pt-2 max-h-56 overflow-y-auto">
            {colunasPorFunil.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma etapa de funil encontrada.</p>
            ) : (
              colunasPorFunil.map(([funilNome, colunas]) => (
                <div key={funilNome} className="space-y-1">
                  {colunasPorFunil.length > 1 && (
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{funilNome}</p>
                  )}
                  {colunas.map(col => (
                    <label key={col.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                      <Checkbox
                        checked={campo.etapasObrigatorias.includes(col.id)}
                        onCheckedChange={(checked) => toggleEtapa(col.id, checked === true)}
                      />
                      {col.nome}
                    </label>
                  ))}
                </div>
              ))
            )}
            {CAMPOS_SEM_GARANTIA_DRAG.includes(campo.campo_key) && (
              <p className="text-[10px] text-muted-foreground border-t pt-1.5">
                Este campo não é checado ao arrastar o card no Kanban — a obrigatoriedade por etapa só é aplicada ao criar ou editar o negócio.
              </p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const ENTIDADE_OPCOES: { value: EntidadeCampos; label: string; icon: typeof Briefcase }[] = [
  { value: 'pedidos', label: 'Negócios', icon: Briefcase },
  { value: 'clientes', label: 'Empresas', icon: Building2 },
  { value: 'contatos', label: 'Contatos', icon: Contact },
  { value: 'obras', label: 'Obras', icon: HardHat },
];

// Campos que já eram obrigatórios de forma fixa no código antes de virarem
// configuráveis por aqui — desmarcar o switch muda um comportamento que já
// existia no sistema, então vale avisar.
const CAMPOS_JA_OBRIGATORIOS_ANTES: Record<EntidadeCampos, string[]> = {
  pedidos: ['cliente_id', 'fabricante_id', 'vendedor_id', 'anexo_pdf', 'data_pedido'],
  clientes: ['cnpj', 'nome'],
  contatos: ['nome_contato'],
  obras: ['nome_obra', 'cliente_id'],
};

function EntidadeCamposPanel({ entidade, empresaId, meuUsuarioId }: { entidade: EntidadeCampos; empresaId: string; meuUsuarioId?: string }) {
  const { data: campos, isLoading } = useConfiguracoesCampos(entidade, empresaId);
  const toggleObrigatorio = useToggleObrigatorioCampo();
  const createCampo = useCreateCampoCustomizado();
  const deleteCampo = useDeleteCampoCustomizado();

  // Obrigatoriedade por etapa só existe para Negócios — é a única entidade com conceito
  // de funil/etapa kanban (clientes/contatos/obras não têm pipeline).
  const { data: kanbanColunasEmpresa } = useKanbanColunasEmpresa(entidade === 'pedidos' ? empresaId : undefined);
  const colunasPorFunil = useMemo(() => {
    const grupos = new Map<string, KanbanColunaComFunil[]>();
    for (const col of kanbanColunasEmpresa ?? []) {
      const nome = col.funil?.nome ?? 'Funil';
      if (!grupos.has(nome)) grupos.set(nome, []);
      grupos.get(nome)!.push(col);
    }
    return Array.from(grupos.entries());
  }, [kanbanColunasEmpresa]);

  const [novoLabel, setNovoLabel] = useState('');
  const [novoObrigatorio, setNovoObrigatorio] = useState(false);

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const padrao = (campos ?? []).filter(c => c.origem === 'padrao');
  const customizados = (campos ?? []).filter(c => c.origem === 'customizado');

  // Agrupa os campos padrão por etapa do wizard (Negócios e Empresas têm múltiplos
  // passos); entidades sem etapa (Contatos, Obras) caem todas no grupo "sem etapa"
  // e são renderizadas como lista única, sem subtítulo.
  const etapasOrdenadas = Array.from(new Set(padrao.map(c => c.etapa ?? '')));
  const gruposPorEtapa = etapasOrdenadas.map(etapa => ({
    etapa: etapa || null,
    campos: padrao.filter(c => (c.etapa ?? '') === etapa),
  }));
  const temEtapas = gruposPorEtapa.some(g => g.etapa);

  const handleAdicionar = () => {
    if (!novoLabel.trim()) return;
    createCampo.mutate(
      { entidade, label: novoLabel.trim(), obrigatorio: novoObrigatorio },
      { onSuccess: () => { setNovoLabel(''); setNovoObrigatorio(false); } }
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Campos padrão
        </Label>
        {padrao.length === 0 ? (
          <div className="rounded-md border border-border">
            <p className="text-sm text-muted-foreground px-4 py-3">Nenhum campo configurável para esta entidade.</p>
          </div>
        ) : (
          gruposPorEtapa.map(grupo => (
            <div key={grupo.etapa ?? '_sem_etapa'} className="space-y-1.5">
              {temEtapas && grupo.etapa && (
                <p className="text-xs font-medium text-muted-foreground pl-1">Etapa: {grupo.etapa}</p>
              )}
              <div className="rounded-md border border-border divide-y divide-border">
                {grupo.campos.map(campo => (
                  <div key={campo.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-sm">{resolveFieldLabel(campo)}</span>
                      {campo.obrigatorio && CAMPOS_JA_OBRIGATORIOS_ANTES[entidade].includes(campo.campo_key) && (
                        <p className="text-xs text-muted-foreground">Recomendamos manter este campo como obrigatório.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {entidade === 'pedidos' && campo.obrigatorio && (
                        <EscopoEtapasControl campo={campo} colunasPorFunil={colunasPorFunil} />
                      )}
                      <span className="text-xs text-muted-foreground">{campo.obrigatorio ? 'Obrigatório' : 'Opcional'}</span>
                      <Switch
                        checked={campo.obrigatorio}
                        onCheckedChange={checked => toggleObrigatorio.mutate({ id: campo.id, obrigatorio: checked })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Campos customizados
        </Label>
        <div className="rounded-md border border-border divide-y divide-border">
          {customizados.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-3">Nenhum campo customizado criado ainda.</p>
          ) : (
            customizados.map(campo => (
              <div key={campo.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{campo.label}</span>
                  <Badge variant={campo.obrigatorio ? 'default' : 'outline'} className="text-[10px] px-1.5">
                    {campo.obrigatorio ? 'Obrigatório' : 'Opcional'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {entidade === 'pedidos' && campo.obrigatorio && (
                    <EscopoEtapasControl campo={campo} colunasPorFunil={colunasPorFunil} />
                  )}
                  <Switch
                    checked={campo.obrigatorio}
                    onCheckedChange={checked => toggleObrigatorio.mutate({ id: campo.id, obrigatorio: checked })}
                  />
                  {campo.created_by === meuUsuarioId && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover campo "{campo.label}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Essa ação não pode ser desfeita. Valores já preenchidos nesse campo em registros existentes serão mantidos, mas o campo deixará de aparecer nos formulários.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteCampo.mutate(campo.id)}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Adicionar campo customizado
        </Label>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="novo-campo-label" className="text-xs">Nome do campo</Label>
            <Input
              id="novo-campo-label"
              value={novoLabel}
              onChange={e => setNovoLabel(e.target.value)}
              placeholder="Ex: Segmento de mercado"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={novoObrigatorio} onCheckedChange={setNovoObrigatorio} />
            <Label className="text-xs text-muted-foreground">Obrigatório</Label>
          </div>
          <Button onClick={handleAdicionar} disabled={!novoLabel.trim() || createCampo.isPending}>
            {createCampo.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CamposTab() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;
  const meuUsuarioId = profile?.id;
  const [entidade, setEntidade] = useState<EntidadeCampos>('pedidos');

  if (!empresaId) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma empresa vinculada ao seu perfil.</p>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Campos dos formulários</CardTitle>
        <CardDescription>
          Defina quais campos são obrigatórios e crie campos customizados para Negócios, Empresas e Contatos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={entidade} onValueChange={v => setEntidade(v as EntidadeCampos)}>
          <TabsList className={TOGGLE_LIST_CLASS}>
            {ENTIDADE_OPCOES.map(opt => (
              <TabsTrigger key={opt.value} value={opt.value} className={cn(TOGGLE_TRIGGER_CLASS, 'gap-1.5')}>
                <opt.icon className="h-4 w-4" /> {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {ENTIDADE_OPCOES.map(opt => (
            <TabsContent key={opt.value} value={opt.value} className="mt-4">
              <EntidadeCamposPanel entidade={opt.value} empresaId={empresaId} meuUsuarioId={meuUsuarioId} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
