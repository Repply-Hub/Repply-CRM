import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useObras } from '@/hooks/use-obras';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, MapPin, Search, Loader2, HardHat, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  em_andamento: { label: 'Em andamento', variant: 'default' },
  ativa: { label: 'Ativa', variant: 'default' },
  concluida: { label: 'Concluída', variant: 'secondary' },
  parada: { label: 'Parada', variant: 'destructive' },
};

type SortOption = 'recent' | 'oldest' | 'name_asc' | 'name_desc';

export default function Obras() {
  const { data: obras, isLoading } = useObras();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [sort, setSort] = useState<SortOption>('recent');

  const filtered = useMemo(() => {
    if (!obras) return [];
    let list = [...obras];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.nome_obra.toLowerCase().includes(q) ||
          o.endereco_entrega?.toLowerCase().includes(q) ||
          (o.clientes as any)?.empresa?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'todos') {
      list = list.filter((o) => o.status === statusFilter);
    }

    switch (sort) {
      case 'oldest':
        list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'name_asc':
        list.sort((a, b) => a.nome_obra.localeCompare(b.nome_obra));
        break;
      case 'name_desc':
        list.sort((a, b) => b.nome_obra.localeCompare(a.nome_obra));
        break;
      default:
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return list;
  }, [obras, search, statusFilter, sort]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <HardHat className="h-6 w-6 text-primary" />
            Obras
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e acompanhe todas as obras cadastradas.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, endereço ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="parada">Parada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigas</SelectItem>
              <SelectItem value="name_asc">Nome A-Z</SelectItem>
              <SelectItem value="name_desc">Nome Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <HardHat className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma obra encontrada</p>
            <p className="text-sm mt-1">Ajuste os filtros ou cadastre uma nova obra.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{filtered.length} obra(s) encontrada(s)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((obra) => {
                const status = STATUS_MAP[obra.status] || { label: obra.status, variant: 'outline' as const };
                const cliente = obra.clientes as any;
                return (
                  <Card key={obra.id} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                          {obra.nome_obra}
                        </CardTitle>
                        <Badge variant={status.variant} className="shrink-0 text-xs">
                          {status.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
                      {cliente?.empresa && (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{cliente.empresa}</span>
                        </div>
                      )}
                      {obra.endereco_entrega && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{obra.endereco_entrega}</span>
                        </div>
                      )}
                      {obra.spe_cnpj && (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-xs">SPE: {obra.spe_cnpj}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs">
                          Criada em {format(new Date(obra.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
