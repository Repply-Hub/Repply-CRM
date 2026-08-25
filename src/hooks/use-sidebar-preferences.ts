import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { looksLikeDomain, isExternalUrl } from '@/lib/sidebar-icons';

export interface SidebarItem {
  id: string;
  path: string;
  label: string;
  icon: string; // lucide icon name
  visible: boolean;
  isCustom?: boolean;
  isExternal?: boolean; // path é uma URL completa (http/https), abre em nova aba
}

/** Onde vive a home do app. A raiz "/" passou a ser a landing page pública. */
export const ROTA_APP = '/app';

export const DEFAULT_SIDEBAR_ITEMS: SidebarItem[] = [
  // Primeiro da lista para quem entra agora. Quem JÁ tem menu salvo recebe o item pela
  // mesclagem lá embaixo, que acrescenta no FIM — é o preço de não reordenar o menu que a
  // pessoa arrumou. Ela pode arrastar para onde quiser.
  { id: 'hoje', path: '/hoje', label: 'Hoje', icon: 'Sun', visible: true },
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard', visible: true },
  { id: 'pipeline', path: ROTA_APP, label: 'Negócios', icon: 'Kanban', visible: true },
  { id: 'clientes', path: '/clientes', label: 'Clientes', icon: 'Users', visible: true },
  { id: 'obras', path: '/obras', label: 'Obras', icon: 'HardHat', visible: true },
  { id: 'fabricantes', path: '/fabricantes', label: 'Fabricantes', icon: 'Factory', visible: true },
  { id: 'portal', path: '/portal', label: 'Portal', icon: 'Globe', visible: true },
  { id: 'calendario', path: '/calendario', label: 'Calendário', icon: 'CalendarDays', visible: true },
  { id: 'tarefas', path: '/tarefas', label: 'Tarefas', icon: 'ClipboardList', visible: true },
  { id: 'chat', path: '/chat', label: 'Chat', icon: 'MessageSquare', visible: true },
  { id: 'whatsapp', path: '/whatsapp', label: 'WhatsApp', icon: 'MessageCircle', visible: true },
  { id: 'emails', path: '/emails', label: 'E-mails', icon: 'Mail', visible: true },
  { id: 'configuracoes', path: '/configuracoes', label: 'Configurações', icon: 'Settings', visible: true },

  { id: 'admin_empresas', path: '/admin/empresas', label: 'Empresas', icon: 'Building2', visible: true },
  { id: 'usuarios_admin', path: '/configuracoes?tab=usuarios', label: 'Usuários', icon: 'Users', visible: true },
  { id: 'admin_secoes', path: '/admin/secoes', label: 'Seções', icon: 'ToggleLeft', visible: true },
  { id: 'admin_wa_instancias', path: '/admin/instancias-whatsapp', label: 'Instâncias WhatsApp', icon: 'Smartphone', visible: true },
];

// Itens descontinuados que ainda podem existir em preferências salvas (usuário ou empresa)
// de antes da remoção — filtrados ao carregar para que sumam do menu de todo mundo.
const REMOVED_IDS = new Set(['pedidos', 'portal_consultas', 'importacoes_ignoradas', 'historico']);

function fixChatWhatsappIcons(list: SidebarItem[]): SidebarItem[] {
  return list.map(i => {
    if (i.id === 'chat') return { ...i, icon: 'MessageSquare' };
    if (i.id === 'whatsapp') return { ...i, icon: 'MessageCircle' };
    return i;
  });
}

// Os paths ficam gravados no banco (sidebar_preferences por usuário e
// sidebar_empresa_padrao por empresa), então mudar só o DEFAULT não migra
// ninguém: o item 'pipeline' salvo continuaria apontando para '/', que agora é a
// landing page. Esta função é o mecanismo de migração — roda em toda leitura,
// nos três caminhos de retorno, e reescreve o path antigo. Por isso não é
// preciso migration de dados.
export function normalizarPipeline(list: SidebarItem[]): SidebarItem[] {
  return list.map(i => {
    if (i.id === 'pipeline') return { ...i, path: ROTA_APP, label: 'Negócios', icon: 'Kanban' };
    // Item personalizado apontando para a raiz cairia na landing. Provável em
    // atalhos criados quando o pipeline ainda morava lá.
    if (!i.isExternal && i.path === '/') return { ...i, path: ROTA_APP };
    return i;
  });
}

// Corrige, na leitura, atalhos externos gravados ANTES do fix de detecção de
// domínio sem protocolo (ex.: alguém digitou "consultarcnpj.com.br" e o item
// ficou salvo como rota interna quebrada `/consultarcnpj.com.br`, isExternal:
// false — sem favicon, sem link funcional). Mesmo mecanismo de
// `normalizarPipeline`: recalcula em toda leitura, sem precisar de migração
// de dados. Da próxima vez que o usuário salvar a sidebar (editar qualquer
// item), o path corrigido é persistido de volta.
export function normalizarLinksExternos(list: SidebarItem[]): SidebarItem[] {
  return list.map(i => {
    if (i.isExternal) return i;
    // O path já é uma URL completa (http/https) — só a flag `isExternal` está
    // errada ou ausente (item nasceu fora do fluxo do Dialog, ex.: inserido
    // direto por migration/admin antes do campo existir). Sem essa correção,
    // AppSidebar trata como rota interna e nunca chama `SidebarFavicon`,
    // mesmo quando o site tem favicon perfeitamente disponível.
    if (isExternalUrl(i.path)) return { ...i, isExternal: true };
    const semBarra = i.path.startsWith('/') ? i.path.slice(1) : i.path;
    if (looksLikeDomain(semBarra)) {
      return { ...i, path: `https://${semBarra}`, isExternal: true };
    }
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
            return normalizarLinksExternos(
              normalizarPipeline(
                fixChatWhatsappIcons(
                  (empresaPadrao.items as unknown as SidebarItem[]).filter(i => !REMOVED_IDS.has(i.id))
                )
              )
            );
          }
        }
        return DEFAULT_SIDEBAR_ITEMS;
      }

      // Merge saved preferences with defaults to handle new items added after save.
      // Remove o antigo item 'pedidos' (Lista de Negócios) — funcionalidade unificada em 'pipeline'.
      const rawSaved = data.items as unknown as SidebarItem[];
      const needsCleanup = rawSaved.some(i => REMOVED_IDS.has(i.id));
      const saved = normalizarLinksExternos(
        normalizarPipeline(
          fixChatWhatsappIcons(rawSaved.filter(i => !REMOVED_IDS.has(i.id)))
        )
      );
      const savedIds = new Set(saved.map(i => i.id));

      // Itens novos adicionados ao padrão da empresa depois que este usuário salvou
      // sua própria personalização também precisam aparecer para ele (não só os
      // itens novos do app em si) — senão o padrão da empresa nunca mais o alcança.
      let empresaPadraoItems: SidebarItem[] = [];
      if (empresaId) {
        const { data: empresaPadrao } = await supabase
          .from('sidebar_empresa_padrao')
          .select('items')
          .eq('empresa_id', empresaId)
          .maybeSingle();
        if (empresaPadrao && Array.isArray(empresaPadrao.items) && empresaPadrao.items.length > 0) {
          // Também normaliza: itens do padrão da empresa entram no merge abaixo
          // e trariam o path antigo para quem ainda não tem esse id salvo.
          empresaPadraoItems = normalizarLinksExternos(
            normalizarPipeline(
              (empresaPadrao.items as unknown as SidebarItem[]).filter(i => !REMOVED_IDS.has(i.id))
            )
          );
        }
      }

      const newDefaults = [...empresaPadraoItems, ...DEFAULT_SIDEBAR_ITEMS].filter(
        (d, idx, arr) => !savedIds.has(d.id) && arr.findIndex(x => x.id === d.id) === idx
      );
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
