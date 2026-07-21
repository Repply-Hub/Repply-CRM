import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarItem } from '@/hooks/use-sidebar-preferences';
import { getIconComponent, AVAILABLE_ICONS, isExternalUrl, getFaviconUrl, getFaviconFallbackUrl } from '@/lib/sidebar-icons';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (item: SidebarItem) => void;
  initialItem?: SidebarItem | null;
}

export function SidebarAddItemDialog({ open, onOpenChange, onSave, initialItem }: Props) {
  const [label, setLabel] = useState('');
  const [path, setPath] = useState('');
  const [icon, setIcon] = useState('Link');

  const isEditing = !!initialItem;

  useEffect(() => {
    if (!open) return;
    setLabel(initialItem?.label ?? '');
    setPath(initialItem?.path ?? '');
    setIcon(initialItem?.icon ?? 'Link');
  }, [open, initialItem]);

  const trimmedPath = path.trim();
  const isExternal = isExternalUrl(trimmedPath);
  const faviconUrl = isExternal ? getFaviconUrl(trimmedPath) : undefined;
  const faviconFallbackUrl = isExternal ? getFaviconFallbackUrl(trimmedPath) : undefined;

  const handleSave = () => {
    if (!label.trim() || !trimmedPath) {
      toast.error('Preencha o nome e o caminho');
      return;
    }
    onSave({
      id: initialItem?.id ?? `custom-${Date.now()}`,
      path: isExternal ? trimmedPath : (trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`),
      label,
      icon,
      visible: initialItem?.visible ?? true,
      isCustom: true,
      isExternal,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Item' : 'Adicionar Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="Nome do item" value={label} onChange={e => setLabel(e.target.value)} />
          <div className="flex items-center gap-2">
            {isExternal && (
              <div className="h-9 w-9 shrink-0 rounded-md border flex items-center justify-center overflow-hidden bg-muted">
                {faviconUrl && (
                  <img
                    src={faviconUrl}
                    alt=""
                    className="h-4 w-4"
                    onError={e => {
                      const img = e.currentTarget;
                      if (img.dataset.fallback !== '1' && faviconFallbackUrl) {
                        img.dataset.fallback = '1';
                        img.src = faviconFallbackUrl;
                      } else {
                        img.style.visibility = 'hidden';
                      }
                    }}
                  />
                )}
              </div>
            )}
            <Input
              placeholder="Caminho (ex: /relatorios) ou URL externa (ex: https://site.com)"
              value={path}
              onChange={e => setPath(e.target.value)}
              className="flex-1"
            />
          </div>
          {isExternal && (
            <p className="text-xs text-muted-foreground">
              Link externo detectado — vai abrir em uma nova aba e mostrar o favicon do site na sidebar.
            </p>
          )}
          {!isExternal && (
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
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} className="w-full">{isEditing ? 'Salvar' : 'Adicionar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
