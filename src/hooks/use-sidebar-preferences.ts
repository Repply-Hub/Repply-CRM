import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export interface SidebarItem {
  id: string;
  path: string;
  label: string;
  icon: string; // lucide icon name
  visible: boolean;
  isCustom?: boolean;
}

export const DEFAULT_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard', visible: true },
  { id: 'pipeline', path: '/', label: 'Negócios', icon: 'Kanban', visible: true },
  { id: 'clientes', path: '/clientes', label: 'Clientes', icon: 'Users', visible: true },
  { id: 'obras', path: '/obras', label: 'Obras', icon: 'HardHat', visible: true },
  { id: 'fabricantes', path: '/fabricantes', label: 'Fabricantes', icon: 'Factory', visible: true },
  { id: 'portal', path: '/portal', label: 'Portal', icon: 'Globe', visible: true },
  { id: 'calendario', path: '/calendario', label: 'Calendário', icon: 'CalendarDays', visible: true },
  { id: 'tarefas', path: '/tarefas', label: 'Tarefas', icon: 'ClipboardList', visible: true },
  { id: 'chat', path: '/chat', label: 'Chat', icon: 'MessageCircle', visible: true },
  { id: 'emails', path: '/emails', label: 'E-mails', icon: 'Mail', visible: true },
  { id: 'configuracoes', path: '/configuracoes', label: 'Configurações', icon: 'Settings', visible: true },
];

export function useSidebarPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['sidebar-preferences', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sidebar_preferences')
        .select('items')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        return DEFAULT_SIDEBAR_ITEMS;
      }

      // Merge saved preferences with defaults to handle new items added after save.
      // Remove o antigo item 'pedidos' (Lista de Negócios) — funcionalidade unificada em 'pipeline' (/).
      // Garante que 'pipeline' aponte para / com label 'Negócios'.
      const saved = (data.items as unknown as SidebarItem[])
        .filter(i => i.id !== 'pedidos')
        .map(i => i.id === 'pipeline' ? { ...i, path: '/', label: 'Negócios', icon: 'Kanban' } : i);
      const savedIds = new Set(saved.map(i => i.id));
      const newDefaults = DEFAULT_SIDEBAR_ITEMS.filter(d => !savedIds.has(d.id));
      return [...saved, ...newDefaults];
    },
    enabled: !!user?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (newItems: SidebarItem[]) => {
      const { data: existing } = await supabase
        .from('sidebar_preferences')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('sidebar_preferences')
          .update({ items: newItems as any, updated_at: new Date().toISOString() })
          .eq('user_id', user!.id);
      } else {
        await supabase
          .from('sidebar_preferences')
          .insert({ user_id: user!.id, items: newItems as any });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidebar-preferences'] });
    },
  });

  return {
    items: items ?? DEFAULT_SIDEBAR_ITEMS,
    isLoading,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
  };
}
