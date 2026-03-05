import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFabricantes, useClientes } from '@/hooks/use-clientes';
import { useCreatePedido } from '@/hooks/use-mutations';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';

const NovoPedido = () => {
  const navigate = useNavigate();
  const { data: clientes } = useClientes();
  const { data: fabricantes } = useFabricantes();
  const createPedido = useCreatePedido();
  const [clienteId, setClienteId] = useState('');
  const [fabricanteId, setFabricanteId] = useState('');
  const [valor, setValor] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !fabricanteId) {
      toast.error('Selecione cliente e fabricante');
      return;
    }
    try {
      await createPedido.mutateAsync({
        cliente_id: clienteId,
        fabricante_id: fabricanteId,
        valor_total: parseFloat(valor) || 0,
        observacoes: observacoes || undefined,
      });
      toast.success('Pedido criado com sucesso!');
      navigate('/pedidos');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/pedidos')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para Pedidos
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Novo Pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={clienteId} onValueChange={setClienteId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                    <SelectContent>
                      {(clientes ?? []).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fabricante</Label>
                  <Select value={fabricanteId} onValueChange={setFabricanteId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar fabricante" /></SelectTrigger>
                    <SelectContent>
                      {(fabricantes ?? []).map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valor Total</Label>
                <Input type="number" step="0.01" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea placeholder="Observações (opcional)" value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={4} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate('/pedidos')}>Cancelar</Button>
                <Button type="submit" disabled={createPedido.isPending}>
                  <Save className="h-4 w-4 mr-1" />
                  {createPedido.isPending ? 'Criando...' : 'Criar Pedido'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default NovoPedido;
