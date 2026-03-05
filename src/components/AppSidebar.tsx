import { LayoutDashboard, Kanban, Users, FileText, Settings } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useRef, useCallback } from 'react';
import { NavLink } from '@/components/NavLink';
import logoMd from '@/assets/logo-md.webp';
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

const navItems = [
  { path: '/', label: 'Kanban', icon: Kanban },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/pedidos', label: 'Pedidos', icon: FileText },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppSidebar() {
  const { state, setOpen } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    if (collapsed) {
      enterTimer.current = setTimeout(() => setOpen(true), 300);
    }
  }, [collapsed, setOpen]);

  const handleMouseLeave = useCallback(() => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (!collapsed) {
      leaveTimer.current = setTimeout(() => setOpen(false), 400);
    }
  }, [collapsed, setOpen]);

  return (
    <Sidebar
      collapsible="icon"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <img src={logoMd} alt="MD Representações" className="h-8 w-8 rounded-md shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-sidebar-foreground truncate">MD Representações</p>
              <p className="text-[10px] text-sidebar-foreground/60">Gestão Comercial</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className="hover:bg-sidebar-accent/60"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="h-8 w-8 rounded-full bg-sidebar-primary flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground shrink-0">
            CM
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">Carlos Mendes</p>
              <p className="text-xs text-sidebar-foreground/60">Vendedor</p>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
