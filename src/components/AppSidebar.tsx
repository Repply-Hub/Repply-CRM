import { LayoutDashboard, Kanban, Users, FileText, Settings } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import logoMd from '@/assets/logo-md.webp';

const navItems = [
  { path: '/', label: 'Kanban', icon: Kanban },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/pedidos', label: 'Pedidos', icon: FileText },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 min-h-screen bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      <div className="p-4 border-b border-sidebar-border flex items-center gap-3">
        <img src={logoMd} alt="MD Representações" className="h-10 w-10 rounded-lg" />
        <div>
          <h1 className="text-base font-bold tracking-tight text-sidebar-foreground">
            MD Representações
          </h1>
          <p className="text-[10px] text-sidebar-foreground/60">Gestão Comercial</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-sidebar-primary flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground">
            CM
          </div>
          <div>
            <p className="text-sm font-medium text-sidebar-accent-foreground">Carlos Mendes</p>
            <p className="text-xs text-sidebar-foreground/60">Vendedor</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
