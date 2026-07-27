import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { NovoNegocioDialog } from '@/components/pedidos/NovoNegocioDialog';

const NovoPedido = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <AppLayout
      headerContent={
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/pedidos')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight truncate md:text-xl">Novo Negócio</h1>
        </div>
      }
    >
      <NovoNegocioDialog
        open
        onOpenChange={(open) => { if (!open) navigate('/pedidos'); }}
        clienteId={searchParams.get('clienteId') || undefined}
        status={searchParams.get('status') || undefined}
        funilId={searchParams.get('funilId') || undefined}
        onCreated={() => navigate('/')}
      />
    </AppLayout>
  );
};

export default NovoPedido;
