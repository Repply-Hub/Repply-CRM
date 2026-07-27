import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  EntidadeCampos,
  useConfiguracoesCampos,
  useToggleObrigatorioCampo,
  useCreateCampoCustomizado,
  useDeleteCampoCustomizado,
  FIELD_LABELS,
} from '@/hooks/use-configuracoes-campos';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { TOGGLE_LIST_CLASS, TOGGLE_TRIGGER_CLASS } from '@/lib/toggle-group-styles';
import { cn } from '@/lib/utils';
import { Loader2, Trash2, Briefcase, Building2, Contact, Plus } from 'lucide-react';

const ENTIDADE_OPCOES: { value: EntidadeCampos; label: string; icon: typeof Briefcase }[] = [
  { value: 'pedidos', label: 'Negócios', icon: Briefcase },
  { value: 'clientes', label: 'Empresas', icon: Building2 },
  { value: 'contatos', label: 'Contatos', icon: Contact },
];

function EntidadeCamposPanel({ entidade, empresaId, meuUsuarioId }: { entidade: EntidadeCampos; empresaId: string; meuUsuarioId?: string }) {
  const { data: campos, isLoading } = useConfiguracoesCampos(entidade, empresaId);
  const toggleObrigatorio = useToggleObrigatorioCampo();
  const createCampo = useCreateCampoCustomizado();
  const deleteCampo = useDeleteCampoCustomizado();

  const [novoLabel, setNovoLabel] = useState('');
  const [novoObrigatorio, setNovoObrigatorio] = useState(false);

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const padrao = (campos ?? []).filter(c => c.origem === 'padrao');
  const customizados = (campos ?? []).filter(c => c.origem === 'customizado');

  const handleAdicionar = () => {
    if (!novoLabel.trim()) return;
    createCampo.mutate(
      { entidade, label: novoLabel.trim(), obrigatorio: novoObrigatorio },
      { onSuccess: () => { setNovoLabel(''); setNovoObrigatorio(false); } }
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Campos padrão
        </Label>
        <div className="rounded-md border border-border divide-y divide-border">
          {padrao.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-3">Nenhum campo configurável para esta entidade.</p>
          ) : (
            padrao.map(campo => (
              <div key={campo.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{FIELD_LABELS[campo.campo_key] ?? campo.campo_key}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{campo.obrigatorio ? 'Obrigatório' : 'Opcional'}</span>
                  <Switch
                    checked={campo.obrigatorio}
                    onCheckedChange={checked => toggleObrigatorio.mutate({ id: campo.id, obrigatorio: checked })}
                  />
                </div>
              </div>
            ))
          )}
        </div>
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
