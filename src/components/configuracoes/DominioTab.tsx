import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Globe, CheckCircle2, AlertCircle, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';

export function DominioTab() {
  const [domainName, setDomainName] = useState('');
  const queryClient = useQueryClient();

  const { data: domains, isLoading } = useQuery({
    queryKey: ['user_domains'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_domains')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const setupDomain = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.functions.invoke('setup-resend-domain', {
        body: { domain_name: name },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_domains'] });
      toast.success('Domínio configurado! Adicione os registros DNS abaixo.');
      setDomainName('');
    },
    onError: (error: any) => {
      toast.error('Erro ao configurar domínio: ' + error.message);
    },
  });

  const verifyStatus = useMutation({
    mutationFn: async (domainId: string) => {
      // Aqui poderíamos chamar uma edge function para verificar o status no Resend
      // Por enquanto, vamos simular ou apenas atualizar o estado local se necessário
      toast.info('Verificando status no Resend...');
      // Implementação futura: chamar a API do Resend via Edge Function
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
  };

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainName) return;
    setupDomain.mutate(domainName);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Configurar Novo Domínio
          </CardTitle>
          <CardDescription>
            Adicione seu domínio personalizado para enviar e-mails profissionais (ex: contato@suaempresa.com)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetup} className="flex gap-4 items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="domain">Nome do Domínio</Label>
              <Input
                id="domain"
                placeholder="exemplo.com.br"
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                disabled={setupDomain.isPending}
              />
            </div>
            <Button type="submit" disabled={setupDomain.isPending || !domainName}>
              {setupDomain.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Configurar
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        domains?.map((domain) => (
          <Card key={domain.id} className="overflow-hidden">
            <CardHeader className="bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {domain.domain_name}
                    {domain.status === 'verified' ? (
                      <Badge className="bg-green-500 hover:bg-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Verificado
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="h-3 w-3 mr-1" /> Pendente
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>ID: {domain.resend_domain_id}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => verifyStatus.mutate(domain.resend_domain_id)}
                  disabled={verifyStatus.isPending}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", verifyStatus.isPending && "animate-spin")} />
                  Verificar Status
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Registros DNS necessários</h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Tipo</TableHead>
                        <TableHead>Nome (Host)</TableHead>
                        <TableHead>Valor (Content)</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(domain.dns_records) && domain.dns_records.map((record: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{record.type}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">{record.name}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[300px] truncate">{record.value}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => copyToClipboard(record.value)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  * Pode levar até 48 horas para que as alterações de DNS sejam propagadas globalmente.
                </p>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}