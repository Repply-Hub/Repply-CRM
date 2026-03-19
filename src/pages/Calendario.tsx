import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CalendarDays, Clock, FileText, Phone } from 'lucide-react';

export default function Calendario() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Buscar pedidos com prazo de resposta
  const { data: pedidos } = useQuery({
    queryKey: ['pedidos-calendario'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('id, status, prazo_resposta, valor_total, cliente_id, clientes(empresa), fabricantes(nome)')
        .not('prazo_resposta', 'is', null);
      if (error) throw error;
      return data;
    },
  });

  // Buscar próximos contatos
  const { data: contatos } = useQuery({
    queryKey: ['contatos-calendario'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historico_contatos')
        .select('id, tipo, descricao, proximo_contato_em, pedido_id, pedidos(clientes(empresa))')
        .not('proximo_contato_em', 'is', null);
      if (error) throw error;
      return data;
    },
  });

  // Eventos do dia selecionado
  const eventosDoDia = useMemo(() => {
    const eventos: { id: string; tipo: 'prazo' | 'contato'; titulo: string; subtitulo: string; hora?: string }[] = [];

    pedidos?.forEach((p: any) => {
      if (p.prazo_resposta && isSameDay(new Date(p.prazo_resposta), selectedDate)) {
        eventos.push({
          id: `prazo-${p.id}`,
          tipo: 'prazo',
          titulo: `Prazo: ${p.clientes?.empresa || 'Cliente'}`,
          subtitulo: `${p.fabricantes?.nome || 'Fabricante'} — ${p.status}`,
        });
      }
    });

    contatos?.forEach((c: any) => {
      if (c.proximo_contato_em && isSameDay(new Date(c.proximo_contato_em), selectedDate)) {
        eventos.push({
          id: `contato-${c.id}`,
          tipo: 'contato',
          titulo: `Contato: ${(c as any).pedidos?.clientes?.empresa || 'Cliente'}`,
          subtitulo: c.descricao || c.tipo,
        });
      }
    });

    return eventos;
  }, [pedidos, contatos, selectedDate]);

  // Datas com eventos para destacar no calendário
  const datasComEvento = useMemo(() => {
    const datas: Date[] = [];
    pedidos?.forEach((p: any) => {
      if (p.prazo_resposta) datas.push(new Date(p.prazo_resposta));
    });
    contatos?.forEach((c: any) => {
      if (c.proximo_contato_em) datas.push(new Date(c.proximo_contato_em));
    });
    return datas;
  }, [pedidos, contatos]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calendário</h1>
          <p className="text-sm text-muted-foreground">Prazos de resposta e próximos contatos</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
          {/* Calendário */}
          <Card>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={ptBR}
                className="pointer-events-auto"
                modifiers={{ evento: datasComEvento }}
                modifiersClassNames={{ evento: 'bg-primary/20 font-bold text-primary rounded-full' }}
              />
            </CardContent>
          </Card>

          {/* Eventos do dia */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                {format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {eventosDoDia.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum evento para este dia.
                </p>
              ) : (
                <div className="space-y-3">
                  {eventosDoDia.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-muted/30"
                    >
                      <div className="mt-0.5">
                        {ev.tipo === 'prazo' ? (
                          <FileText className="h-4 w-4 text-primary" />
                        ) : (
                          <Phone className="h-4 w-4 text-accent-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{ev.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate">{ev.subtitulo}</p>
                      </div>
                      <Badge variant={ev.tipo === 'prazo' ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                        {ev.tipo === 'prazo' ? 'Prazo' : 'Contato'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
