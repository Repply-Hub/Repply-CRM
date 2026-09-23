import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ImagemPrivada } from '@/components/shared/ImagemPrivada';
import { simboloDoCatalogo } from '@/lib/simbolos-de-chat';
import { COR_FUNDO_PADRAO, COR_ICONE_PADRAO } from '@/lib/cores-de-chat';

// Esconde a imagem quebrada pra deixar o fallback (ícone) visível.
function esconderQuebrada(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none';
}

/**
 * O avatar de um grupo / Chat Geral. Decisão única (antes repetida em 8 lugares):
 *   1. tem foto → mostra a foto (com o ícone padrão de reserva se a foto quebrar);
 *   2. senão, tem símbolo escolhido → o símbolo com as cores (padrão suave se nulas);
 *   3. senão → o ícone padrão no fundo primário (o de hoje).
 */
export function AvatarDeChat({
  fotoUrl,
  icone,
  corFundo,
  corIcone,
  IconePadrao,
  nome,
  className,
  tamanhoIcone = 'h-4 w-4',
}: {
  fotoUrl?: string | null;
  icone?: string | null;
  corFundo?: string | null;
  corIcone?: string | null;
  IconePadrao: LucideIcon;
  nome?: string;
  className?: string;
  tamanhoIcone?: string;
}) {
  const simbolo = simboloDoCatalogo(icone);

  if (fotoUrl) {
    return (
      <Avatar className={className}>
        <ImagemPrivada src={fotoUrl} alt={nome ?? ''} className="absolute inset-0 h-full w-full object-cover" onError={esconderQuebrada} />
        <AvatarFallback className="bg-primary text-primary-foreground">
          <IconePadrao className={tamanhoIcone} />
        </AvatarFallback>
      </Avatar>
    );
  }

  if (simbolo) {
    const Icone = simbolo.Icone;
    return (
      <Avatar className={className}>
        <AvatarFallback style={{ backgroundColor: corFundo ?? COR_FUNDO_PADRAO, color: corIcone ?? COR_ICONE_PADRAO }}>
          <Icone className={tamanhoIcone} />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-primary text-primary-foreground">
        <IconePadrao className={tamanhoIcone} />
      </AvatarFallback>
    </Avatar>
  );
}
