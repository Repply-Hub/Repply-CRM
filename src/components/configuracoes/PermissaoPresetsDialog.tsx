import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Settings, Plus, Pencil, Trash2, Loader2, ChevronLeft, Shield, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePermissaoPresets, useUpdatePermissaoPreset, useCreatePermissaoPreset, useDeletePermissaoPreset,
  type PermissaoPreset, type PresetModuloPermissoes,
} from '@/hooks/use-permissao-presets';
import { MODULOS } from '@/hooks/use-permissoes';
import { PermissaoMatrixEditor } from './PermissaoMatrixEditor';

const ETAPAS_NOVO_PRESET = [
  { key: 'info', label: 'Informações' },
  { key: 'permissoes', label: 'Permissões' },
] as const;
type EtapaNovoPreset = typeof ETAPAS_NOVO_PRESET[number]['key'];

function EtapasIndicador({ atual }: { atual: EtapaNovoPreset }) {
  const indiceAtual = ETAPAS_NOVO_PRESET.findIndex(e => e.key === atual);
  return (
    <div className="flex items-center gap-2">
      {ETAPAS_NOVO_PRESET.map((etapa, i) => {
        const concluida = i < indiceAtual;
        const ativa = etapa.key === atual;
        return (
          <div key={etapa.key} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-4 bg-border shrink-0" />}
            <div className={cn('flex items-center gap-1.5 text-xs', ativa ? 'text-foreground font-medium' : 'text-muted-foreground')}>
              <span className={cn(
                'h-5 w-5 rounded-full border flex items-center justify-center text-[11px] shrink-0',
                ativa ? 'border-primary bg-primary text-primary-foreground' : concluida ? 'border-primary/50 text-primary' : 'border-border'
              )}>
                {concluida ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {etapa.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PresetEditor({ preset, onBack }: { preset: PermissaoPreset; onBack: () => void }) {
  const [permissoes, setPermissoes] = useState(preset.permissoes);
  const update = useUpdatePermissaoPreset();

  const handleChange = (moduloKey: string, updates: Partial<PermissaoPreset['permissoes'][string]>) => {
    setPermissoes(prev => ({
      ...prev,
      [moduloKey]: {
        pode_ver: prev[moduloKey]?.pode_ver ?? true,
        pode_criar: prev[moduloKey]?.pode_criar ?? false,
        pode_editar: prev[moduloKey]?.pode_editar ?? false,
        pode_excluir: prev[moduloKey]?.pode_excluir ?? false,
        funcionalidades: prev[moduloKey]?.funcionalidades ?? {},
        ...updates,
      },
    }));
  };

  const handleSalvar = () => {
    update.mutate({ id: preset.id, permissoes }, { onSuccess: onBack });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-sm font-medium">{preset.nome}</p>
          {preset.descricao && <p className="text-xs text-muted-foreground">{preset.descricao}</p>}
        </div>
        {preset.origem === 'padrao' && <Badge variant="outline" className="text-[10px] ml-auto">Padrão</Badge>}
      </div>

      <ScrollArea className="h-[65vh] pr-3">
        <PermissaoMatrixEditor getValue={key => permissoes[key]} onChange={handleChange} />
      </ScrollArea>

      <DialogFooter>
        <Button onClick={handleSalvar} disabled={update.isPending}>
          {update.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : 'Salvar preset'}
        </Button>
      </DialogFooter>
    </div>
  );
}

const PERMISSOES_VAZIAS: Record<string, PresetModuloPermissoes> = MODULOS.reduce((acc, mod) => {
  acc[mod.key] = { pode_ver: false, pode_criar: false, pode_editar: false, pode_excluir: false, funcionalidades: {} };
  return acc;
}, {} as Record<string, PresetModuloPermissoes>);

function NovoPresetForm({ onCreated, onBack }: { onCreated: (preset: PermissaoPreset) => void; onBack: () => void }) {
  const [etapa, setEtapa] = useState<EtapaNovoPreset>('info');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [permissoes, setPermissoes] = useState(PERMISSOES_VAZIAS);
  const create = useCreatePermissaoPreset();

  const handleChange = (moduloKey: string, updates: Partial<PresetModuloPermissoes>) => {
    setPermissoes(prev => ({ ...prev, [moduloKey]: { ...prev[moduloKey], ...updates } }));
  };

  const handleCriar = () => {
    create.mutate(
      { nome: nome.trim(), descricao: descricao.trim() || undefined, permissoes },
      { onSuccess: onCreated }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => etapa === 'info' ? onBack() : setEtapa('info')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <EtapasIndicador atual={etapa} />
      </div>

      {etapa === 'info' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="novo-preset-nome" className="text-xs">Nome</Label>
            <Input id="novo-preset-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Financeiro" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="novo-preset-desc" className="text-xs">Descrição (opcional)</Label>
            <Input id="novo-preset-desc" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Acesso a negócios e fabricantes" />
          </div>
          <DialogFooter>
            <Button onClick={() => setEtapa('permissoes')} disabled={!nome.trim()}>
              Continuar
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-4">
          <ScrollArea className="h-[55vh] pr-3">
            <PermissaoMatrixEditor getValue={key => permissoes[key]} onChange={handleChange} />
          </ScrollArea>
          <DialogFooter>
            <Button onClick={handleCriar} disabled={create.isPending}>
              {create.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Criando...</> : 'Criar preset'}
            </Button>
          </DialogFooter>
        </div>
      )}
    </div>
  );
}

function PresetsList({ empresaId, meuUsuarioId, onEdit, onNovo }: { empresaId: string; meuUsuarioId?: string; onEdit: (preset: PermissaoPreset) => void; onNovo: () => void }) {
  const { data: presets, isLoading } = usePermissaoPresets(empresaId);
  const deletePreset = useDeletePermissaoPreset();

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border divide-y divide-border">
        {(presets ?? []).map(preset => (
          <div key={preset.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{preset.nome}</span>
                  {preset.origem === 'padrao' && <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">Padrão</Badge>}
                </div>
                {preset.descricao && <p className="text-xs text-muted-foreground truncate">{preset.descricao}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(preset)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {preset.origem === 'customizado' && preset.created_by === meuUsuarioId && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover preset "{preset.nome}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Essa ação não pode ser desfeita. Usuários que já tiveram esse preset aplicado mantêm as permissões atuais.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deletePreset.mutate(preset.id)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        ))}
        {(presets ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground px-4 py-3">Nenhum preset cadastrado ainda.</p>
        )}
      </div>

      <Button variant="outline" className="w-full gap-1.5" onClick={onNovo}>
        <Plus className="h-4 w-4" /> Novo preset
      </Button>
    </div>
  );
}

export function PermissaoPresetsDialog({ empresaId, meuUsuarioId }: { empresaId: string; meuUsuarioId?: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PermissaoPreset | null>(null);
  const [criando, setCriando] = useState(false);
  const { data: presets } = usePermissaoPresets(empresaId);

  const editingAtual = editing ? presets?.find(p => p.id === editing.id) ?? editing : null;

  const fecharSubtelas = () => { setEditing(null); setCriando(false); };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) fecharSubtelas(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" /> Gerenciar presets
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingAtual ? 'Editar preset' : criando ? 'Novo preset' : 'Presets de permissões'}</DialogTitle>
        </DialogHeader>
        {editingAtual ? (
          <PresetEditor preset={editingAtual} onBack={() => setEditing(null)} />
        ) : criando ? (
          <NovoPresetForm onBack={() => setCriando(false)} onCreated={() => setCriando(false)} />
        ) : (
          <PresetsList empresaId={empresaId} meuUsuarioId={meuUsuarioId} onEdit={setEditing} onNovo={() => setCriando(true)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
