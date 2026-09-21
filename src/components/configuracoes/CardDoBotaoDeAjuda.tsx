import { HelpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useBotaoAjudaVisivel } from '@/hooks/use-botao-ajuda-visivel';

/**
 * Liga e desliga o botão flutuante de Ajuda. Mesmo padrão do CardDeSom: preferência de
 * PESSOA, vale só neste navegador (use-botao-ajuda-visivel), não grava no banco.
 */
export function CardDoBotaoDeAjuda() {
  const { visivel, definir } = useBotaoAjudaVisivel();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-primary" /> Botão de Ajuda
        </CardTitle>
        <CardDescription>Vale só para você, neste computador</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Mostrar o botão flutuante</p>
            <p className="text-xs text-muted-foreground">
              O ícone de ajuda que fica no canto inferior direito da tela, com o
              passo a passo das funcionalidades.
            </p>
          </div>
          <Switch checked={visivel} onCheckedChange={definir} aria-label="Mostrar o botão flutuante de Ajuda" />
        </div>
      </CardContent>
    </Card>
  );
}
