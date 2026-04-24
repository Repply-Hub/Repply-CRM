import { AppSidebar } from './AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerContent?: React.ReactNode;
  mainClassName?: string;
}

export function AppLayout({ children, title, subtitle, headerContent, mainClassName }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-[3.5rem] md:min-h-[4rem] flex items-center justify-between px-2 sm:px-4 md:px-6 shrink-0 py-2 sm:py-4 gap-1.5 sm:gap-2 border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 transition-all duration-300">
            <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
              <SidebarTrigger className="shrink-0 h-8 w-8 md:hidden" />
              {headerContent ?? (
                <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
                  {title && <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-foreground tracking-tight truncate">{title}</h1>}
                  {subtitle && <p className="text-[10px] sm:text-sm text-muted-foreground truncate">{subtitle}</p>}
                </div>
              )}
            </div>
            <NotificationCenter />
          </header>
          <main className={mainClassName ?? "flex-1 overflow-auto"}>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
