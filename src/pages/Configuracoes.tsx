import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { mockVendedores, mockFabricantes } from '@/data/mockData';
import { Plus, Upload, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const themeOptions = [
  { value: 'light' as const, label: 'Claro', icon: Sun, desc: 'Tema claro padrão' },
  { value: 'dark' as const, label: 'Escuro', icon: Moon, desc: 'Reduz o brilho da tela' },
  { value: 'system' as const, label: 'Sistema', icon: Monitor, desc: 'Segue a preferência do SO' },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Tema</CardTitle>
        <CardDescription>Escolha o modo de exibição da interface</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                theme === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              )}
            >
              <opt.icon className={cn('h-6 w-6', theme === opt.value ? 'text-primary' : 'text-muted-foreground')} />
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-[10px] text-muted-foreground text-center">{opt.desc}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const Configuracoes = () => {
  const [alertDays, setAlertDays] = useState('5');

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie vendedores, automações e tabelas de preço</p>
        </div>

        <Tabs defaultValue="aparencia">
          <TabsList>
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
            <TabsTrigger value="automacao">Automação</TabsTrigger>
            <TabsTrigger value="tabelas">Tabelas de Preço</TabsTrigger>
          </TabsList>

          <TabsContent value="aparencia" className="mt-4">
            <ThemeSelector />
          </TabsContent>

          <TabsContent value="vendedores" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Vendedores</CardTitle>
                  <CardDescription>Cadastro e permissões dos vendedores</CardDescription>
                </div>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Vendedor</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockVendedores.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.nome}</TableCell>
                        <TableCell>{v.email}</TableCell>
                        <TableCell>
                          <Badge variant={v.ativo ? 'default' : 'secondary'}>
                            {v.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">Editar</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automacao" className="mt-4">
            <div className="grid gap-4 max-w-xl">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alertas de Inatividade</CardTitle>
                  <CardDescription>Configure o tempo máximo que um pedido pode ficar parado em uma etapa</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label>Dias para alerta:</Label>
                    <Input type="number" value={alertDays} onChange={e => setAlertDays(e.target.value)} className="w-20" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">Notificação por email</p>
                      <p className="text-xs text-muted-foreground">Enviar email quando o pedido ficar parado</p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">Notificação no sistema</p>
                      <p className="text-xs text-muted-foreground">Mostrar alerta visual no Kanban</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Templates de Mensagem</CardTitle>
                  <CardDescription>Modelos para envio rápido de comunicações</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Template</Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tabelas" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Tabelas de Preço</CardTitle>
                  <CardDescription>Tabelas vigentes dos fabricantes</CardDescription>
                </div>
                <Button size="sm"><Upload className="h-4 w-4 mr-1" /> Importar Tabela</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fabricante</TableHead>
                      <TableHead>Tabela Vigente</TableHead>
                      <TableHead>Última Atualização</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockFabricantes.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.nome}</TableCell>
                        <TableCell>{f.tabela}</TableCell>
                        <TableCell>{f.ultimaAtualizacao}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">Atualizar</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Configuracoes;
