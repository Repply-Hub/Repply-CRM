import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CalendarEvent, EventoForm, CalendarType } from './types';
import { EVENT_PRESET_COLORS, CALENDAR_COLORS } from './types';

interface EventDialogProps {
  open: boolean;
  initialData?: Partial<EventoForm>;
  editingEvent?: CalendarEvent | null;
  onClose: () => void;
  onSave: (form: EventoForm) => void;
  onDelete?: (id: string) => void;
}

function toDatetimeLocal(iso: string): string {
  // Converte ISO → valor para input datetime-local (YYYY-MM-DDTHH:mm)
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

  useEffect(() => {
    if (!open) return;

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
      });
    } else {
      setForm({ ...defaultForm(), ...initialData });
    }
  }, [open, editingEvent, initialData]);

  const set = <K extends keyof EventoForm>(key: K, value: EventoForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCalendarTypeChange = (type: CalendarType) => {
    setForm((prev) => ({ ...prev, tipoCalendario: type, cor: CALENDAR_COLORS[type] }));
  };

  const handleSubmit = () => {
    if (!form.titulo.trim()) return;
    onSave(form);
    onClose();
  };

  const isEditing = !!editingEvent;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar evento' : 'Novo evento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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

          {/* Início */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input
                type={form.diaInteiro ? 'date' : 'datetime-local'}
                value={form.inicio}
                onChange={(e) => set('inicio', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input
                type={form.diaInteiro ? 'date' : 'datetime-local'}
                value={form.fim}
                onChange={(e) => set('fim', e.target.value)}
              />
            </div>
          </div>

          {/* Tipo de calendário */}
          <div className="space-y-1.5">
            <Label>Calendário</Label>
            <Select
              value={form.tipoCalendario}
              onValueChange={(v) => handleCalendarTypeChange(v as CalendarType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pessoal">Meu calendário</SelectItem>
                <SelectItem value="empresa">Calendário da empresa</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

        <DialogFooter className="gap-2">
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
