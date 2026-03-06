import { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const [hasUnread] = useState(false);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between px-6 shrink-0">
            <div className="min-w-0">
              {title && <h1 className="text-2xl font-extrabold text-foreground tracking-tight truncate">{title}</h1>}
              {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full hover:bg-accent shrink-0">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  {hasUnread && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3">
                <p className="text-sm font-semibold mb-2">Notificações</p>
                <p className="text-xs text-muted-foreground">Nenhuma notificação no momento.</p>
              </PopoverContent>
            </Popover>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
