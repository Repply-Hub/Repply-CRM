import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { recusaSemErro } from '@/lib/recusa-do-banco';

/**
 * Chave por empresa: alterna a caixa de WhatsApp entre o estilo Repply (organiza por atendente)
 * e o estilo WhatsApp Web (lista única). Só quem responde pela empresa (gestor/dono/admin) vê e
 * altera; para os demais o cartão não aparece. Padrão é Repply.
 */
export function ModoDeVisualizacaoWhatsappCard() {
  const { profile, refreshProfile } = useAuth();
  const isGestor =
    profile?.role === 'admin' || profile?.role === 'gestor' || profile?.role === 'empresa';
  const empresaId: string | undefined = profile?.empresas?.id ?? profile?.empresa_id;
  const listaUnica = !!profile?.empresas?.whatsapp_lista_unica;
  const [salvando, setSalvando] = useState(false);

  if (!isGestor) return null;

  async function alternar(novoValor: boolean) {
    if (!empresaId || salvando) return;
    setSalvando(true);
    try {
      const { error, count } = await supabase
        .from('empresas')
        .update({ whatsapp_lista_unica: novoValor }, { count: 'exact' })
        .eq('id', empresaId);
      if (error) throw error;
      if (count === 0) {
        throw new Error(
          recusaSemErro(
            'A preferência NÃO foi salva: a caixa continua como estava.',
            'Confirme que você é gestor desta empresa.',
          ),
        );
      }
      await refreshProfile();
      toast.success(
        novoValor ? 'Caixa no estilo WhatsApp Web.' : 'Caixa no estilo Repply.',
      );
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível salvar a preferência.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estilo da caixa de entrada</CardTitle>
        <CardDescription>
          Vale para a empresa inteira. No estilo <strong>Repply</strong>, as conversas se
          organizam por atendente (Meus chats, Não atribuídos, Outros). No estilo{' '}
          <strong>WhatsApp Web</strong>, viram uma lista única, a mais recente no topo, com um
          selo discreto de quem vem atendendo cada conversa.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <Label htmlFor="wa-lista-unica" className="text-sm font-normal">
          {listaUnica ? 'WhatsApp Web (lista única)' : 'Repply (organiza por atendente)'}
        </Label>
        <Switch
          id="wa-lista-unica"
          checked={listaUnica}
          disabled={salvando}
          onCheckedChange={alternar}
        />
      </CardContent>
    </Card>
  );
}
