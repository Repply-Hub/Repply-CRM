import { LayoutDashboard, Kanban, Users, FileText, Settings, LogOut, HardHat, Factory, Globe, CalendarDays, UserCircle } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { NavLink } from '@/components/NavLink';
import logoSidebar from '@/assets/logo-sidebar.svg';
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
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/', label: 'Pipeline', icon: Kanban },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/obras', label: 'Obras', icon: HardHat },
  { path: '/pedidos', label: 'Pedidos', icon: FileText },
  { path: '/fabricantes', label: 'Fabricantes', icon: Factory },
  { path: '/portal', label: 'Portal', icon: Globe },
  { path: '/calendario', label: 'Calendário', icon: CalendarDays },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppSidebar() {
  const { state, setOpen } = useSidebar();
  const { signOut } = useAuth();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverOpened = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    if (collapsed) {
      enterTimer.current = setTimeout(() => {
        hoverOpened.current = true;
        setOpen(true);
      }, 300);
    }
  }, [collapsed, setOpen]);

  const handleMouseLeave = useCallback(() => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (hoverOpened.current) {
      leaveTimer.current = setTimeout(() => {
        hoverOpened.current = false;
        setOpen(false);
      }, 400);
    }
  }, [setOpen]);

  return (
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
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className="hover:bg-sidebar-accent/60 rounded-lg transition-all duration-150"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-[13px]">{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <button
          onClick={() => signOut()}
          className={`flex items-center overflow-hidden w-full rounded-lg px-2 py-2 hover:bg-sidebar-accent/50 transition-all duration-150 ${collapsed ? 'justify-center' : 'gap-3'}`}
        >
          <LogOut className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
          {!collapsed && <span className="text-[13px] text-sidebar-foreground/70">Sair</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
