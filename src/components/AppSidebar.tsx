import { LogOut, UserCircle, Pencil, Check, X, Plus, GripVertical, Trash2, Eye, EyeOff } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useRef, useCallback, useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { NavLink } from '@/components/NavLink';
import { useSidebarPreferences, SidebarItem } from '@/hooks/use-sidebar-preferences';
import { getIconComponent } from '@/lib/sidebar-icons';
import { SidebarAddItemDialog } from '@/components/SidebarAddItemDialog';
import logoSidebar from '@/assets/logo-sidebar.svg';
import { toast } from 'sonner';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

export function AppSidebar() {
  const { state, setOpen, isMobile } = useSidebar();
  const { signOut, user } = useAuth();
  const collapsed = !isMobile && state === 'collapsed';
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<SidebarItem[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { items, save, isSaving } = useSidebarPreferences();
  const visibleItems = items.filter(i => i.visible);

  const { data: vendedor } = useQuery({
    queryKey: ['meu-perfil', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendedores')
        .select('nome, role')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });
  const location = useLocation();
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverOpened = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (editMode) return;
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    if (collapsed) {
      enterTimer.current = setTimeout(() => {
        hoverOpened.current = true;
        setOpen(true);
      }, 300);
    }
  }, [collapsed, setOpen, editMode]);

  const handleMouseLeave = useCallback(() => {
    if (editMode) return;
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (hoverOpened.current) {
      leaveTimer.current = setTimeout(() => {
        hoverOpened.current = false;
        setOpen(false);
      }, 400);
    }
  }, [setOpen, editMode]);

  const enterEditMode = useCallback(() => {
    setEditItems(JSON.parse(JSON.stringify(items)));
    setEditMode(true);
    if (collapsed) {
      hoverOpened.current = false;
      setOpen(true);
    }
  }, [items, collapsed, setOpen]);

  // Listen for external trigger (from profile page)
  useEffect(() => {
    const handler = () => enterEditMode();
    window.addEventListener('sidebar-enter-edit', handler);
    return () => window.removeEventListener('sidebar-enter-edit', handler);
  }, [enterEditMode]);

  const cancelEdit = () => {
    setEditMode(false);
  };

  const saveEdit = () => {
    save(editItems);
    setEditMode(false);
    toast.success('Sidebar personalizada!');
  };

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(editItems);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setEditItems(reordered);
  }, [editItems]);

  const toggleVisibility = (id: string) => {
    setEditItems(prev => prev.map(item =>
      item.id === id ? { ...item, visible: !item.visible } : item
    ));
  };

  const removeItem = (id: string) => {
    setEditItems(prev => prev.filter(item => item.id !== id));
  };

  const addCustomItem = (item: SidebarItem) => {
    setEditItems(prev => [...prev, item]);
  };

  const displayItems = editMode ? editItems : visibleItems;

  return (
    <>
      <Sidebar
        collapsible="icon"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <SidebarHeader className="px-2 py-3 border-b border-primary/10 mb-2">
          <Link
            to="/dashboard"
            className={`flex items-center overflow-visible hover:opacity-80 transition-opacity ${collapsed ? 'justify-center' : 'gap-3'}`}
          >
            <img src={logoSidebar} alt="MD Representações" className="shrink-0 object-contain" style={{ width: 40, height: 40, minWidth: 40, minHeight: 40 }} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-sidebar-foreground truncate tracking-tight">MD Representações</p>
                <p className="text-[10px] text-sidebar-foreground/50 font-medium">Gestão Comercial</p>
              </div>
            )}
          </Link>
        </SidebarHeader>

        <SidebarContent className="py-2">
          <SidebarGroup>
            <SidebarGroupContent>
              {editMode ? (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="sidebar-edit">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-0.5 px-1">
                        {editItems.map((item, index) => {
                          const Icon = getIconComponent(item.icon);
                          return (
                            <Draggable key={item.id} draggableId={item.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm transition-colors group ${
                                    snapshot.isDragging
                                      ? 'bg-sidebar-accent border border-primary/50 shadow-lg z-50'
                                      : 'border border-transparent hover:bg-sidebar-accent/30'
                                  } ${!item.visible ? 'opacity-40' : ''}`}
                                >
                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-sidebar-foreground/40 hover:text-sidebar-foreground/70">
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </div>
                                  {Icon && <Icon className="h-4 w-4 shrink-0 text-sidebar-foreground/60" />}
                                  <span className="flex-1 truncate text-[13px] text-sidebar-foreground">{item.label}</span>
                                  <button
                                    onClick={() => toggleVisibility(item.id)}
                                    className="text-sidebar-foreground/40 hover:text-sidebar-foreground/80 p-0.5"
                                    title={item.visible ? 'Ocultar' : 'Mostrar'}
                                  >
                                    {item.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                  </button>
                                  {item.isCustom && (
                                    <button
                                      onClick={() => removeItem(item.id)}
                                      className="text-destructive/50 hover:text-destructive p-0.5"
                                      title="Remover"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
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
              ) : (
                <SidebarMenu>
                  {displayItems.map((item) => {
                    const Icon = getIconComponent(item.icon);
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton asChild tooltip={item.label}>
                          <NavLink
                            to={item.path}
                            end={item.path === '/'}
                            className="hover:bg-sidebar-accent/60 rounded-lg transition-all duration-150"
                            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
                          >
                            {Icon && <Icon className="h-4 w-4 shrink-0" />}
                            {!collapsed && <span className="text-[13px]">{item.label}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}

              {editMode && (
                <div className="px-1 mt-1">
                  <button
                    onClick={() => setAddDialogOpen(true)}
                    className="flex items-center gap-1.5 w-full rounded-lg px-1.5 py-1.5 text-[13px] border border-dashed border-sidebar-foreground/20 text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:border-sidebar-foreground/40 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar item</span>
                  </button>
                </div>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3 space-y-1">
          {/* Edit mode actions */}
          {editMode ? (
            <div className="flex gap-1.5">
              <button
                onClick={cancelEdit}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
              >
                <X className="h-4 w-4" /> Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                <Check className="h-4 w-4" /> Salvar
              </button>
            </div>
          ) : (
            <button
              onClick={enterEditMode}
              className={`flex items-center overflow-hidden w-full rounded-lg px-2 py-2 hover:bg-sidebar-accent/50 transition-all duration-150 ${collapsed ? 'justify-center' : 'gap-3'}`}
            >
              <Pencil className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
              {!collapsed && <span className="text-[13px] text-sidebar-foreground/70">Personalizar</span>}
            </button>
          )}

          {/* Perfil do usuário */}
          {!editMode && (
            <>
              <Link
                to="/configuracoes?tab=perfil"
                className={`flex items-center overflow-hidden rounded-lg px-2 py-2 hover:bg-sidebar-accent/50 transition-all duration-150 ${collapsed ? 'justify-center' : 'gap-3'}`}
              >
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCircle className="h-5 w-5 text-primary" />
                </div>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-sidebar-foreground truncate">{vendedor?.nome ?? user?.email?.split('@')[0] ?? '—'}</p>
                    <p className="text-[10px] text-sidebar-foreground/50 capitalize">{vendedor?.role ?? 'vendedor'}</p>
                  </div>
                )}
              </Link>
              <button
                onClick={() => signOut()}
                className={`flex items-center overflow-hidden w-full rounded-lg px-2 py-2 hover:bg-sidebar-accent/50 transition-all duration-150 ${collapsed ? 'justify-center' : 'gap-3'}`}
              >
                <LogOut className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
                {!collapsed && <span className="text-[13px] text-sidebar-foreground/70">Sair</span>}
              </button>
            </>
          )}
        </SidebarFooter>
      </Sidebar>

      <SidebarAddItemDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={addCustomItem}
      />
    </>
  );
}
