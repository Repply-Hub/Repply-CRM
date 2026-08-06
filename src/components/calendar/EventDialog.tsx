import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Trash2, Users, Check, ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useVendedores } from '@/hooks/use-clientes';
import { useAuth } from '@/hooks/use-auth';
import { useEventoParticipantes } from '@/hooks/use-eventos';
import type { CalendarEvent, EventoForm, CalendarType } from './types';
import { EVENT_PRESET_COLORS, CALENDAR_COLORS } from './types';
import { EventDateTimeField } from './EventDateTimeField';
import { LembreteField } from './LembreteField';

interface EventDialogProps {
  open: boolean;
  initialData?: Partial<EventoForm>;
  editingEvent?: CalendarEvent | null;
  onClose: () => void;
  onSave: (form: EventoForm) => void;
  onDelete?: (id: string) => void;
}

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

const defaultForm = (): EventoForm => {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    titulo: '',
    descricao: '',
    inicio: format(now, "yyyy-MM-dd'T'HH:mm"),
    fim: format(later, "yyyy-MM-dd'T'HH:mm"),
    diaInteiro: false,
    tipoCalendario: 'empresa',
    cor: CALENDAR_COLORS.empresa,
    participantes: [],
    lembreteMinutos: null,
  };
};

export function EventDialog({
  open,
  initialData,
  editingEvent,
  onClose,
  onSave,
  onDelete,
}: EventDialogProps) {
  const [form, setForm] = useState<EventoForm>(defaultForm());
  const [participantesOpen, setParticipantesOpen] = useState(false);
  const { user } = useAuth();
  const { data: usuarios, refetch: refetchUsuarios } = useVendedores();
  const { data: participantesExistentes } = useEventoParticipantes(
    open && editingEvent ? editingEvent.grupoId : null,
  );

  // Funcionários da empresa, incluindo o próprio usuário logado (aparece como "Você", no topo)
  const funcionariosDisponiveis = useMemo(() => {
    const lista = (usuarios ?? []).filter((u: { user_id: string | null }) => u.user_id);
    return [...lista].sort((a: { user_id: string }, b: { user_id: string }) => {
      if (a.user_id === user?.id) return -1;
      if (b.user_id === user?.id) return 1;
      return 0;
    });
  }, [usuarios, user?.id]);

  useEffect(() => {
    if (!open) return;

    // Garante a lista de funcionários atualizada toda vez que o modal é aberto,
    // já que a página de calendário fica montada e o cache pode estar desatualizado
    // (ex.: usuário novo criado em outra sessão/aba).
    refetchUsuarios();

    if (editingEvent) {
      const ini = editingEvent.diaInteiro
        ? toDateInput(editingEvent.inicio.toISOString())
        : toDatetimeLocal(editingEvent.inicio.toISOString());
      const fim = editingEvent.diaInteiro
        ? toDateInput(editingEvent.fim.toISOString())
        : toDatetimeLocal(editingEvent.fim.toISOString());
      setForm({
        titulo: editingEvent.titulo,
        descricao: editingEvent.descricao ?? '',
        inicio: ini,
        fim: fim,
        diaInteiro: editingEvent.diaInteiro,
        tipoCalendario: editingEvent.tipoCalendario,
        cor: editingEvent.cor,
        // A lista real de participantes chega depois, pela query de
        // participantes existentes (useEventoParticipantes) — ver efeito abaixo.
        participantes: [],
        lembreteMinutos: editingEvent.lembreteMinutos ?? null,
      });
    } else {
      setForm({
        ...defaultForm(),
        participantes: user?.id ? [user.id] : [],
        ...initialData,
      });
    }
  }, [open, editingEvent, initialData, user?.id]);

  // Preenche os participantes do evento assim que a busca resolve (chega
  // depois da abertura do modal, por isso é um efeito separado do de cima).
  useEffect(() => {
    if (open && editingEvent && participantesExistentes) {
      setForm((prev) => ({ ...prev, participantes: participantesExistentes }));
    }
  }, [open, editingEvent, participantesExistentes]);

  const set = <K extends keyof EventoForm>(key: K, value: EventoForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCalendarTypeChange = (type: CalendarType) => {
    setForm((prev) => ({ ...prev, tipoCalendario: type, cor: CALENDAR_COLORS[type] }));
  };

  const toggleParticipante = (userId: string) => {
    const current = form.participantes ?? [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    set('participantes', next);
  };

  const handleSubmit = () => {
    if (!form.titulo.trim()) return;
    onSave(form);
    onClose();
  };

  const isEditing = !!editingEvent;
  const participantesSelecionados = form.participantes ?? [];
  // Ao criar, quem está preenchendo o formulário é sempre o organizador. Ao
  // editar, só o organizador original pode adicionar/remover participantes —
  // um convidado só enxerga a lista, sem poder alterá-la.
  const podeGerenciarParticipantes = !isEditing || editingEvent?.criadoPor === user?.id;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{isEditing ? 'Editar evento' : 'Novo evento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 px-6 overflow-y-auto flex-1 min-h-0">
          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              placeholder="Título do evento"
              value={form.titulo}
              onChange={(e) => set('titulo', e.target.value)}
              autoFocus
            />
          </div>

          {/* Dia inteiro */}
          <div className="flex items-center justify-between">
            <Label htmlFor="dia-inteiro" className="cursor-pointer">Dia inteiro</Label>
            <Switch
              id="dia-inteiro"
              checked={form.diaInteiro}
              onCheckedChange={(v) => set('diaInteiro', v)}
            />
          </div>

          {/* Início / Fim */}
          <div className="grid grid-cols-2 gap-3">
            <EventDateTimeField
              label="Início"
              type={form.diaInteiro ? 'date' : 'datetime-local'}
              value={form.inicio}
              onChange={(value) => set('inicio', value)}
            />
            <EventDateTimeField
              label="Fim"
              type={form.diaInteiro ? 'date' : 'datetime-local'}
              value={form.fim}
              onChange={(value) => set('fim', value)}
            />
          </div>

          {/* Tipo de calendário */}
          <div className="flex items-center justify-between">
            <Label htmlFor="disponivel-empresa" className="cursor-pointer">
              Disponibilizar este evento para toda a empresa
            </Label>
            <Switch
              id="disponivel-empresa"
              checked={form.tipoCalendario === 'empresa'}
              onCheckedChange={(v) => handleCalendarTypeChange(v ? 'empresa' : 'pessoal')}
            />
          </div>

          {/* Participantes */}
          {funcionariosDisponiveis.length > 0 && (
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <Popover open={participantesOpen} onOpenChange={setParticipantesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!podeGerenciarParticipantes}
                    className="w-full justify-between font-normal h-10"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {participantesSelecionados.length === 0
                        ? <span className="text-muted-foreground truncate">Selecionar funcionários…</span>
                        : <span className="truncate">{participantesSelecionados.length} selecionado(s)</span>}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                  <Command
                    filter={(value, search) => {
                      if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                      return 0;
                    }}
                  >
                    <CommandInput placeholder="Buscar funcionário..." />
                    <CommandList className="max-h-[240px] overflow-y-auto overflow-x-hidden">
                      <CommandEmpty className="py-6 text-center text-sm">
                        Nenhum funcionário encontrado.
                      </CommandEmpty>
                      <CommandGroup>
                        {funcionariosDisponiveis.map((u: { id: string; user_id: string; nome: string; email: string }) => {
                          const isSelf = u.user_id === user?.id;
                          const checked = participantesSelecionados.includes(u.user_id);
                          return (
                            <CommandItem
                              key={u.id}
                              value={isSelf ? `Você ${u.nome} ${u.email}` : `${u.nome} ${u.email}`}
                              onSelect={() => toggleParticipante(u.user_id)}
                              className="gap-2"
                            >
                              <Checkbox checked={checked} className="pointer-events-none" />
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{isSelf ? 'Você' : u.nome}</div>
                                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                              </div>
                              {checked && <Check className="h-4 w-4 text-primary shrink-0" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {participantesSelecionados.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {participantesSelecionados.map((uid) => {
                    const u = funcionariosDisponiveis.find((x: { user_id: string }) => x.user_id === uid) as { nome: string } | undefined;
                    if (!u) return null;
                    const isSelf = uid === user?.id;
                    return (
                      <Badge key={uid} variant="secondary" className="gap-1">
                        {isSelf ? 'Você' : u.nome}
                        {podeGerenciarParticipantes && (
                          <button
                            type="button"
                            className="ml-1 hover:text-destructive"
                            onClick={() => toggleParticipante(uid)}
                          >
                            ×
                          </button>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {podeGerenciarParticipantes
                  ? 'O evento será adicionado ao calendário de cada participante.'
                  : 'Somente quem organizou o evento pode alterar os participantes.'}
              </p>
            </div>
          )}

          {/* Lembrete */}
          <LembreteField
            value={form.lembreteMinutos}
            onChange={(v) => set('lembreteMinutos', v)}
          />

          {/* Cor */}
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {EVENT_PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => set('cor', color)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    form.cor === color ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              placeholder="Adicionar descrição..."
              rows={2}
              value={form.descricao}
              onChange={(e) => set('descricao', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 px-6 py-4 border-t shrink-0">
          {isEditing && onDelete && editingEvent && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => { onDelete(editingEvent.id); onClose(); }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Excluir
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!form.titulo.trim()}>
            {isEditing ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
