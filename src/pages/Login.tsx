import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import logoMd from '@/assets/logo-md.webp';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn(form.get('email') as string, form.get('password') as string);
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signUp(
      form.get('email') as string,
      form.get('password') as string,
      form.get('nome') as string,
    );
    if (error) toast.error(error.message);
    else toast.success('Cadastro realizado! Verifique seu email para confirmar.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logoMd} alt="MD Representações" className="h-12 w-12 rounded-lg" />
          </div>
          <CardTitle className="text-xl">MD Representações</CardTitle>
          <CardDescription>Gestão Comercial</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">Entrar</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                <div><Label>Email</Label><Input name="email" type="email" required placeholder="seu@email.com" /></div>
                <div><Label>Senha</Label><Input name="password" type="password" required placeholder="••••••••" /></div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                <div><Label>Nome</Label><Input name="nome" required placeholder="Seu nome" /></div>
                <div><Label>Email</Label><Input name="email" type="email" required placeholder="seu@email.com" /></div>
                <div><Label>Senha</Label><Input name="password" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" /></div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Cadastrando...' : 'Cadastrar'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
