import { useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GripVertical, Plus, Trash2, Save } from 'lucide-react';
import { SidebarItem } from '@/hooks/use-sidebar-preferences';
import { toast } from 'sonner';
import { getIconComponent, AVAILABLE_ICONS } from '@/lib/sidebar-icons';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SidebarItem[];
  onSave: (items: SidebarItem[]) => void;
  isSaving: boolean;
}

export function SidebarCustomizeDialog({ open, onOpenChange, items, onSave, isSaving }: Props) {
  const [localItems, setLocalItems] = useState<SidebarItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newIcon, setNewIcon] = useState('Link');

  // Sync when dialog opens
  const handleOpenChange = (val: boolean) => {
    if (val) {
      setLocalItems(JSON.parse(JSON.stringify(items)));
      setShowAdd(false);
    }
    onOpenChange(val);
  };

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(localItems);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setLocalItems(reordered);
  }, [localItems]);

  const toggleVisibility = (id: string) => {
    setLocalItems(prev => prev.map(item =>
      item.id === id ? { ...item, visible: !item.visible } : item
    ));
  };

  const removeCustomItem = (id: string) => {
    setLocalItems(prev => prev.filter(item => item.id !== id));
  };

  const addCustomItem = () => {
    if (!newLabel.trim() || !newPath.trim()) {
      toast.error('Preencha o nome e o caminho');
      return;
    }
    const id = `custom-${Date.now()}`;
    setLocalItems(prev => [...prev, {
      id,
      path: newPath.startsWith('/') ? newPath : `/${newPath}`,
      label: newLabel,
      icon: newIcon,
      visible: true,
      isCustom: true,
    }]);
    setNewLabel('');
    setNewPath('');
    setNewIcon('Link');
    setShowAdd(false);
  };

  const handleSave = () => {
    onSave(localItems);
    toast.success('Sidebar personalizada salva!');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Personalizar Sidebar</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-1">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="sidebar-items">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                  {localItems.map((item, index) => {
                    const Icon = getIconComponent(item.icon);
                    return (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors ${
                              snapshot.isDragging ? 'bg-accent border-primary shadow-lg' : 'bg-card border-border'
                            }`}
                          >
                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground">
                              <GripVertical className="h-4 w-4" />
                            </div>
                            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.isCustom && (
                              <button onClick={() => removeCustomItem(item.id)} className="text-destructive/60 hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <Switch
                              checked={item.visible}
                              onCheckedChange={() => toggleVisibility(item.id)}
                              className="scale-75"
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Add custom item */}
          {showAdd ? (
            <div className="border border-dashed border-primary/40 rounded-lg p-3 space-y-2 mt-2">
              <Input
                placeholder="Nome do item"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Caminho (ex: /relatorios)"
                value={newPath}
                onChange={e => setNewPath(e.target.value)}
                className="h-8 text-sm"
              />
              <Select value={newIcon} onValueChange={setNewIcon}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_ICONS.map(iconName => {
                    const Ic = getIconComponent(iconName);
                    return (
                      <SelectItem key={iconName} value={iconName}>
                        <span className="flex items-center gap-2">
                          {Ic && <Ic className="h-4 w-4" />}
                          {iconName}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>Cancelar</Button>
                <Button size="sm" className="flex-1" onClick={addCustomItem}>Adicionar</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar item
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            <Save className="h-4 w-4 mr-1" /> Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
