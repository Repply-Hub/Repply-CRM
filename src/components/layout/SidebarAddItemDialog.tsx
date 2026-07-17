import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarItem } from '@/hooks/use-sidebar-preferences';
import { getIconComponent, AVAILABLE_ICONS } from '@/lib/sidebar-icons';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: SidebarItem) => void;
}

export function SidebarAddItemDialog({ open, onOpenChange, onAdd }: Props) {
  const [label, setLabel] = useState('');
  const [path, setPath] = useState('');
  const [icon, setIcon] = useState('Link');

  const handleAdd = () => {
    if (!label.trim() || !path.trim()) {
      toast.error('Preencha o nome e o caminho');
      return;
    }
    onAdd({
      id: `custom-${Date.now()}`,
      path: path.startsWith('/') ? path : `/${path}`,
      label,
      icon,
      visible: true,
      isCustom: true,
    });
    setLabel('');
    setPath('');
    setIcon('Link');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="Nome do item" value={label} onChange={e => setLabel(e.target.value)} />
          <Input placeholder="Caminho (ex: /relatorios)" value={path} onChange={e => setPath(e.target.value)} />
          <Select value={icon} onValueChange={setIcon}>
            <SelectTrigger>
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
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} className="w-full">Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
