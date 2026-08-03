import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tom = 'alerta' | 'neutro';

interface TelaBloqueioProps {
  titulo: string;
  descricao: React.ReactNode;
  icone?: LucideIcon;
  tom?: Tom;
  /** Botões ou links de saída. Sem eles o usuário fica preso na tela. */
  children?: React.ReactNode;
  /** Rodapé opcional, para contato de suporte. */
  rodape?: React.ReactNode;
}

/**
 * Tela de página inteira para estados em que o app não pode ser usado: conta
 * suspensa, conta sem empresa vinculada, assinatura inativa.
 *
 * Existia duplicada byte a byte em duas partes do App.tsx, com SVG inline e
 * botão sem estilo compartilhado.
 */
export function TelaBloqueio({
  titulo,
  descricao,
  icone: Icone = AlertTriangle,
  tom = 'alerta',
  children,
  rodape,
}: TelaBloqueioProps) {
  return (
    // h-screen com container que rola: html/body são overflow:hidden, então com
    // min-h-screen o conteúdo cresceria para fora da tela e os botões de saída
    // ficariam fora de alcance em tela baixa — prendendo justamente quem já está
    // bloqueado.
    <div className="h-screen overflow-y-auto bg-background">
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-lg border text-center space-y-6">
          <div className="flex justify-center">
            <div
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center',
                tom === 'alerta' ? 'bg-destructive/10' : 'bg-primary/10',
              )}
            >
              <Icone
                className={cn('h-8 w-8', tom === 'alerta' ? 'text-destructive' : 'text-primary')}
                strokeWidth={1.75}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">{titulo}</h2>
            <div className="text-muted-foreground">{descricao}</div>
          </div>

          {children && <div className="space-y-2">{children}</div>}

          {rodape && <div className="border-t pt-4 text-sm text-muted-foreground">{rodape}</div>}
        </div>
      </div>
    </div>
  );
}
