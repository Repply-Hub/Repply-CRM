import { Fragment, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Search } from 'lucide-react';
import {
  ROTAS_FRONTEND,
  FUNCOES_BORDA,
  type AcessoRotaFrontend,
} from '@/content/api-conteudo';

const RÓTULO_DO_ACESSO: Record<AcessoRotaFrontend, string> = {
  publica: 'Pública',
  autenticada: 'Autenticada',
  gestor: 'Gestor',
  admin_master: 'Admin master',
};

const COR_DO_ACESSO: Record<AcessoRotaFrontend, string> = {
  publica: 'bg-muted text-muted-foreground border-transparent',
  autenticada: 'bg-primary/10 text-primary border-transparent',
  gestor: 'bg-amber-500/10 text-amber-700 border-transparent',
  admin_master: 'bg-red-500/10 text-red-700 border-transparent',
};

function corresponde(texto: string, termo: string) {
  return texto.toLowerCase().includes(termo);
}

/**
 * Documentação técnica das rotas do sistema — visível só para o admin master
 * (a guarda fica em `Ajuda.tsx`, que nem monta este componente para outro papel).
 *
 * Duas famílias, porque são coisas diferentes: `ROTAS_FRONTEND` são as telas do
 * React Router (documentação de navegação); `FUNCOES_BORDA` são as funções de borda do
 * Supabase — a API de verdade, chamada por integração externa (webhook do WhatsApp, do
 * Stripe, do e-mail) ou pelo próprio front via `supabase.functions.invoke`.
 */
export function DocumentacaoApi() {
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();

  const rotasFiltradas = termo
    ? ROTAS_FRONTEND.filter(
        (r) => corresponde(r.caminho, termo) || corresponde(r.pagina, termo) || corresponde(r.descricao, termo),
      )
    : ROTAS_FRONTEND;

  const funcoesFiltradas = termo
    ? FUNCOES_BORDA.filter(
        (f) => corresponde(f.nome, termo) || corresponde(f.descricao, termo) || corresponde(f.parametros, termo),
      )
    : FUNCOES_BORDA;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h3 className="text-base font-semibold">Documentação de API</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Referência técnica das rotas do sistema — telas do front e funções de borda do
          Supabase. Visível só para o admin master.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por caminho, nome ou descrição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Rotas de tela ({rotasFiltradas.length})
        </h4>
        <div className="rounded-md border divide-y">
          {rotasFiltradas.map((rota) => (
            <div key={rota.caminho} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-sm font-mono">{rota.caminho}</code>
                  <span className="text-xs text-muted-foreground">{rota.pagina}</span>
                </div>
                <p className="text-sm text-muted-foreground">{rota.descricao}</p>
              </div>
              <Badge variant="outline" className={COR_DO_ACESSO[rota.acesso] + ' shrink-0'}>
                {RÓTULO_DO_ACESSO[rota.acesso]}
              </Badge>
            </div>
          ))}
          {rotasFiltradas.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nada encontrado.</p>
          )}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Funções de borda ({funcoesFiltradas.length})
        </h4>
        <p className="text-xs text-muted-foreground">
          Cada uma roda em <code className="font-mono">POST /functions/v1/&lt;nome&gt;</code>, no
          Supabase — não fazem parte do build do front e sobem à parte (ver CLAUDE.md §16).
        </p>

        {funcoesFiltradas.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">Nada encontrado.</p>
        )}

        <Accordion type="multiple" className="rounded-md border">
          {funcoesFiltradas.map((fn) => (
            <AccordionItem key={fn.nome} value={fn.nome} className="px-3">
              <AccordionTrigger className="text-sm font-mono hover:no-underline">
                <span className="flex items-center gap-2 flex-wrap text-left">
                  <Badge variant="outline" className="font-mono">{fn.metodo}</Badge>
                  {fn.nome}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 font-sans text-sm">
                <p className="text-muted-foreground">{fn.descricao}</p>
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]">
                  <Fragment>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Autenticação</dt>
                    <dd>{fn.auth}</dd>
                  </Fragment>
                  <Fragment>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parâmetros</dt>
                    <dd className="whitespace-pre-wrap">{fn.parametros}</dd>
                  </Fragment>
                  <Fragment>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resposta</dt>
                    <dd className="whitespace-pre-wrap">{fn.resposta}</dd>
                  </Fragment>
                </dl>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
