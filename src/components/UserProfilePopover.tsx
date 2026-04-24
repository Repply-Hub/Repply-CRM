import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Mail, Phone, Building2 } from 'lucide-react';

interface UserProfilePopoverProps {
  name: string;
  className?: string;
}

interface VendedorProfile {
  nome: string;
  email: string;
  telefone: string | null;
  role: string;
  avatar_url: string | null;
}

export function UserProfilePopover({ name, className = '' }: UserProfilePopoverProps) {
  const [profile, setProfile] = useState<VendedorProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function fetchProfile() {
    if (fetched) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('usuarios')
        .select('nome, email, telefone, role, avatar_url')
        .ilike('nome', name)
        .limit(1)
        .maybeSingle();
      setProfile(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 text-primary hover:underline cursor-pointer font-medium ${className}`}
          onClick={fetchProfile}
        >
          {name}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : profile ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-card-foreground truncate">{profile.nome}</p>
                <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{profile.email}</span>
              </div>
              {profile.telefone && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{profile.telefone}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm text-card-foreground">{name}</p>
                <p className="text-xs text-muted-foreground">Perfil não encontrado</p>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
