import { AppSidebar } from './AppSidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { NotificationCenter } from '@/components/layout/NotificationCenter';
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

import { FaixaDeCobranca } from '@/components/shared/FaixaDeCobranca';

export function AppLayout({ children, title, subtitle, headerContent, mainClassName }: AppLayoutProps) {
  const { user, profile } = useAuth();
  
  // Usamos o perfil do AuthContext se disponível, senão buscamos localmente
  // Isso evita múltiplas buscas do mesmo perfil em cada montagem de layout
  const { data: perfilLocal } = useQuery({
    queryKey: ['meu_perfil_layout', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('usuarios')
        .select('nome, avatar_url')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id && !profile,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache
  });

  const displayPerfil = profile || perfilLocal;

  const initials = displayPerfil?.nome
    ? displayPerfil.nome.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
    : '';

  return (
    <SidebarProvider defaultOpen={false}>
      <TooltipProvider delayDuration={400}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Acima do cabeçalho, e fora dele, de propósito.

              🔴 O bloqueio por falta de pagamento era MUDO até 30/08/2026: a pessoa só via o
              salvamento falhar. Esta faixa é o que explica.

              Ela é irmã do <header> e do <main>, dentro da coluna flex travada em h-screen:
              por isso não empurra nada para fora da tela — o <main> é flex-1 e encolhe na
              medida dela. E o `sticky` do cabeçalho é inerte aqui (quem rola é o <main>),
              então a faixa não briga com ele.

              Ela some sozinha quando não há o que dizer (devolve null), então empresa em dia
              não paga nem um pixel por isto. */}
          <FaixaDeCobranca />
          <header className="h-[5.5rem] flex items-center justify-between px-2 sm:px-4 md:px-6 shrink-0 gap-1.5 sm:gap-2 border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 transition-all duration-300">
            <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
              <SidebarTrigger className="shrink-0 h-8 w-8 md:hidden" />
              {headerContent ?? (
                <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
                  {title && <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">{typeof title === 'string' ? title : String(title ?? '')}</h1>}
                  {subtitle && <p className="text-[10px] sm:text-sm text-muted-foreground truncate">{typeof subtitle === 'string' ? subtitle : String(subtitle ?? '')}</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <NotificationCenter />
              <Link to="/configuracoes?tab=perfil" className="shrink-0">
                <Avatar className="h-8 w-8 border border-primary/20 hover:ring-2 hover:ring-primary/20 transition-all">
                  <AvatarImage src={displayPerfil?.avatar_url || ''} alt={displayPerfil?.nome || ''} />
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                    {initials || <UserCircle className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </div>
          </header>
          <main className={mainClassName ?? "flex-1 overflow-auto"}>
            {children}
          </main>
        </div>
      </div>
      </TooltipProvider>
    </SidebarProvider>
  );
}
