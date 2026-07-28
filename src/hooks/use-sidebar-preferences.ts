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
  isExternal?: boolean; // path é uma URL completa (http/https), abre em nova aba
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
  { id: 'chat', path: '/chat', label: 'Chat', icon: 'MessageSquare', visible: true },
  { id: 'whatsapp', path: '/whatsapp', label: 'WhatsApp', icon: 'MessageCircle', visible: true },
  { id: 'emails', path: '/emails', label: 'E-mails', icon: 'Mail', visible: true },
  { id: 'historico', path: '/historico', label: 'Histórico', icon: 'History', visible: true },
  { id: 'configuracoes', path: '/configuracoes', label: 'Configurações', icon: 'Settings', visible: true },

  { id: 'usuarios_admin', path: '/configuracoes?tab=usuarios', label: 'Usuários', icon: 'Users', visible: true },
  { id: 'admin_wa_instancias', path: '/admin/instancias-whatsapp', label: 'Instâncias WhatsApp', icon: 'Smartphone', visible: true },
];

function fixChatWhatsappIcons(list: SidebarItem[]): SidebarItem[] {
  return list.map(i => {
    if (i.id === 'chat') return { ...i, icon: 'MessageSquare' };
    if (i.id === 'whatsapp') return { ...i, icon: 'MessageCircle' };
    return i;
  });
}

export function useSidebarPreferences() {
  const { user, profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['sidebar-preferences', user?.id, empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sidebar_preferences')
        .select('items')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        if (empresaId) {
          const { data: empresaPadrao } = await supabase
            .from('sidebar_empresa_padrao')
            .select('items')
            .eq('empresa_id', empresaId)
            .maybeSingle();
          if (empresaPadrao && Array.isArray(empresaPadrao.items) && empresaPadrao.items.length > 0) {
            return fixChatWhatsappIcons(empresaPadrao.items as unknown as SidebarItem[]);
          }
        }
        return DEFAULT_SIDEBAR_ITEMS;
      }

      // Merge saved preferences with defaults to handle new items added after save.
      // Remove o antigo item 'pedidos' (Lista de Negócios) — funcionalidade unificada em 'pipeline' (/).
      // Garante que 'pipeline' aponte para / com label 'Negócios'.
      const REMOVED_IDS = new Set(['pedidos', 'portal_consultas', 'importacoes_ignoradas']);
      const rawSaved = data.items as unknown as SidebarItem[];
      const needsCleanup = rawSaved.some(i => REMOVED_IDS.has(i.id));
      const saved = fixChatWhatsappIcons(rawSaved
        .filter(i => !REMOVED_IDS.has(i.id))
        .map(i => i.id === 'pipeline' ? { ...i, path: '/', label: 'Negócios', icon: 'Kanban' } : i));
      const savedIds = new Set(saved.map(i => i.id));
      const newDefaults = DEFAULT_SIDEBAR_ITEMS.filter(d => !savedIds.has(d.id));
      const merged = [...saved, ...newDefaults];

      if (needsCleanup) {
        await supabase
          .from('sidebar_preferences')
          .update({ items: merged as any, updated_at: new Date().toISOString() })
          .eq('user_id', user!.id);
      }

      return merged;
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
