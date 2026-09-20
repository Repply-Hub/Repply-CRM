import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, AlertTriangle,
  Sun, LayoutDashboard, Kanban, Users, HardHat, Factory, Globe, CalendarDays,
  ClipboardList, MessageSquare, MessageCircle, Mail, Settings, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AJUDA_CONTEUDO, textoDoPasso, galeriaDoPasso, type TopicoAjuda } from '@/content/ajuda-conteudo';
import { secaoPorId, type SecaoId } from '@/lib/secoes';
import { useSecoesDaEmpresa } from '@/hooks/use-secoes';
import { useAuth } from '@/hooks/use-auth';
import { ImagemDaAjuda } from '@/components/ajuda/ImagemDaAjuda';
import { GaleriaDaAjuda } from '@/components/ajuda/GaleriaDaAjuda';
import { DocumentacaoApi } from '@/components/ajuda/DocumentacaoApi';

// Mesmos ícones do menu lateral (src/lib/sidebar-icons.ts) — a pessoa reconhece a seção
// pelo ícone sem precisar ler o nome de novo.
const ICONE_DA_SECAO: Partial<Record<SecaoId, LucideIcon>> = {
  hoje: Sun,
  dashboard: LayoutDashboard,
  pipeline: Kanban,
  clientes: Users,
  obras: HardHat,
  fabricantes: Factory,
  portal: Globe,
  calendario: CalendarDays,
  tarefas: ClipboardList,
  chat: MessageSquare,
  whatsapp: MessageCircle,
  emails: Mail,
  configuracoes: Settings,
};

// Mesmo padrão visual da navegação vertical de Configurações (src/pages/Configuracoes.tsx).
// Aqui a aba não é condicionada por PERMISSÃO de usuário, mas é condicionada pelo PLANO da
// empresa (ver `secaoContratada`, dentro do componente) — só entra o passo a passo do que a
// empresa efetivamente contratou.
const NAV_TRIGGER =
  "justify-start gap-2 lg:w-full rounded-md px-3 py-2 text-sm font-medium text-left h-auto whitespace-nowrap transition-colors " +
  "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none " +
  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-foreground";

function corresponde(texto: string, termo: string) {
  return texto.toLowerCase().includes(termo);
}

function filtrarTopicos(topicos: TopicoAjuda[], termo: string) {
  if (!termo) return topicos;
  return topicos.filter(
    (t) =>
      corresponde(t.titulo, termo) ||
      t.passos.some((p) => corresponde(textoDoPasso(p), termo)) ||
      (t.aviso ? corresponde(t.aviso, termo) : false),
  );
}

export default function Ajuda() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [busca, setBusca] = useState('');

  const { profile, profileLoaded } = useAuth();
  const { mapa: secoesDaEmpresa } = useSecoesDaEmpresa();

  // A aba de API é exclusiva do admin master (mesma checagem de `secaoContratada`, abaixo, e
  // do resto do sistema — ver AppSidebar.tsx `ADMIN_ONLY_IDS`). Não é RLS: o conteúdo é
  // estático (nenhuma consulta ao banco), então esconder aqui já é suficiente — não há dado
  // de cliente para uma policy proteger.
  const ehAdminMaster = profileLoaded && profile?.role === 'admin';

  // Aba de nível superior: "Documentação" (o passo a passo de sempre) e, só para o admin
  // master, "API". Guardada na URL (`?aba=`) pelo mesmo motivo da seção abaixo — compartilhar
  // o link de uma aba específica.
  const abaDaUrl = searchParams.get('aba');
  const activeMenuTab = ehAdminMaster && abaDaUrl === 'api' ? 'api' : 'documentacao';
  const setActiveMenuTab = (aba: string) => {
    const params = new URLSearchParams(searchParams);
    if (aba === 'api') {
      params.set('aba', 'api');
      params.delete('secao');
    } else {
      params.delete('aba');
    }
    setSearchParams(params, { replace: true });
  };

  /**
   * Só entra o passo a passo da seção que a empresa tem no plano — não faz sentido explicar
   * o Chat para quem não contratou o Chat. Mesma regra que o menu lateral usa
   * (`semSecaoContratada`, AppSidebar.tsx): só esconde quando o valor é literalmente
   * `false`; enquanto o mapa não chegou, mostra tudo (evita a lista encolher na cara da
   * pessoa a cada carregamento).
   *
   * O admin master não tem empresa, então a pergunta "o plano inclui?" não se aplica a ele
   * — ele vê as 13 para poder subir imagem em qualquer uma (mesmo raciocínio de
   * `useSecaoLigada`, em use-secoes.ts).
   */
  const secaoContratada = (id: SecaoId) => {
    if (profileLoaded && profile?.role === 'admin') return true;
    if (!secaoPorId(id)?.desligavel) return true;
    if (!secoesDaEmpresa) return true;
    return secoesDaEmpresa.get(id) !== false;
  };

  const secoesVisiveis = AJUDA_CONTEUDO.filter((s) => secaoContratada(s.secaoId));

  // Mesma ideia de Configurações: a URL é a única fonte da aba ativa, para dar para
  // compartilhar o link de uma seção específica da Ajuda.
  const secaoDaUrl = searchParams.get('secao');
  const activeTab = secoesVisiveis.some((s) => s.secaoId === secaoDaUrl)
    ? secaoDaUrl!
    : secoesVisiveis[0]?.secaoId;
  // Preserva `aba` (o menuTab de nível superior) — `setSearchParams({ secao })` sozinho
  // substitui TODOS os parâmetros e apagaria a aba de API ao trocar de seção.
  const setActiveTab = (secao: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('secao', secao);
    setSearchParams(params, { replace: true });
  };

  const termo = busca.trim().toLowerCase();

  return (
    <AppLayout
      title="Ajuda"
      subtitle="Passo a passo das funcionalidades do sistema"
      mainClassName="flex-1 overflow-hidden flex flex-col"
    >
      <div className="p-6 flex-1 flex flex-col min-h-0 gap-4">
        {/* MenuTab de nível superior: "Documentação" é o passo a passo de sempre; "API" só
            existe para o admin master (`ehAdminMaster`, acima) — quem não é admin nem vê o
            botão da segunda aba, e a URL `?aba=api` é ignorada por quem não pode vê-la
            (ver `activeMenuTab`). Não há dado de empresa nesta tela, então esconder aqui já
            basta — não é substituto de RLS porque não há RLS a substituir. */}
        <Tabs value={activeMenuTab} onValueChange={setActiveMenuTab} className="flex-1 min-h-0 flex flex-col gap-4">
          {ehAdminMaster && (
            <TabsList className="self-start shrink-0">
              <TabsTrigger value="documentacao">Documentação</TabsTrigger>
              <TabsTrigger value="api">API</TabsTrigger>
            </TabsList>
          )}

          {/* 🔴 `hidden data-[state=active]:flex`, nunca só `flex`: o Radix esconde a aba
              inativa pelo atributo HTML `hidden`, mas uma classe do Tailwind que define
              `display` (aqui, `flex`) é regra de autor e VENCE o `[hidden]{display:none}`
              do navegador, mesmo sem bater especificidade — a aba "escondida" continuava
              viva, disputando espaço no `flex-col` do pai e espremendo a outra pela
              metade. As duas abas de cima (Documentação/API) são as únicas com esse risco
              aqui: as abas verticais de cada seção, mais abaixo, ficam dentro de um `<div>`
              sem `flex`, então uma aba "fantasma" ali colapsa para altura zero sozinha. */}
          <TabsContent value="api" className="flex-1 min-h-0 overflow-y-auto mt-0 hidden data-[state=active]:block">
            <DocumentacaoApi />
          </TabsContent>

          <TabsContent value="documentacao" className="flex-1 min-h-0 mt-0 hidden data-[state=active]:flex data-[state=active]:flex-col">
            {/* Navegação vertical à esquerda, conteúdo à direita — igual a Configurações. A
                busca e a lista de seções não rolam: só o painel de conteúdo, à direita, tem
                rolagem própria (overflow-y-auto), como as telas de Configurações que usam
                `noPageScroll`. No celular a coluna vira uma tira que rola de lado. */}
            <Tabs
              orientation="vertical"
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 lg:gap-10"
            >
              <div className="flex flex-col gap-4 shrink-0 lg:w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder='Buscar por uma palavra, ex.: "importar", "excluir", "catálogo"...'
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <TabsList
                  className={cn(
                    "flex lg:flex-col h-auto shrink-0 items-stretch justify-start gap-0.5 bg-transparent p-0 lg:w-64",
                    "max-lg:overflow-x-auto max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden max-lg:[&>*]:shrink-0",
                  )}
                >
                  {secoesVisiveis.map((secao) => {
                    const Icon = ICONE_DA_SECAO[secao.secaoId];
                    return (
                      <TabsTrigger key={secao.secaoId} value={secao.secaoId} className={NAV_TRIGGER}>
                        {Icon && <Icon className="h-4 w-4 shrink-0" />} {secao.titulo}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              {/* Sem teto de largura (`max-w-6xl` tirado): o painel ocupa todo o espaço até a
                  borda da página, e é ali — no canto direito de verdade, não no meio da tela —
                  que a barra de rolagem cai. `pr-6` é o respiro entre o campo de imagem e essa
                  barra, para ela não nascer colada no conteúdo. */}
              <div className="flex-1 min-w-0 min-h-0 overflow-y-auto pr-6">
                {secoesVisiveis.map((secao) => {
                  const topicos = filtrarTopicos(secao.topicos, termo);
                  return (
                    // Três colunas em tela larga: menu (fora deste bloco), texto e campo de
                    // imagem. `grid-cols-[1fr_28rem]` fixa a coluna da imagem numa largura só,
                    // então ela cai sempre alinhada à direita do texto do MESMO tópico — não
                    // "flutua" solta, mesmo com tópicos de tamanhos bem diferentes. Em tela
                    // estreita a grade desliga e tudo empilha na ordem natural (texto, imagem).
                    // `gap-x-10` repete o mesmo espaçamento do menu para o conteúdo (`lg:gap-10`
                    // no `<Tabs>` acima), para as duas divisórias da tela ficarem iguais.
                    <TabsContent
                      key={secao.secaoId}
                      value={secao.secaoId}
                      className="mt-0 max-w-6xl space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start lg:gap-x-10 lg:gap-y-6"
                    >
                      <p className="text-sm text-muted-foreground lg:col-span-2">{secao.resumo}</p>

                      {termo && topicos.length === 0 && (
                        <p className="text-sm text-muted-foreground py-6 lg:col-span-2">
                          Nada encontrado para "{busca}" em {secao.titulo}.
                        </p>
                      )}

                      {topicos.map((topico) => (
                        <Fragment key={topico.titulo}>
                          <div className="space-y-2 lg:col-start-1">
                            <h4 className="font-medium">{topico.titulo}</h4>
                            <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
                              {topico.passos.map((passo, i) => {
                                const galeria = galeriaDoPasso(passo);
                                return (
                                  <li key={i}>
                                    {textoDoPasso(passo)}
                                    {/* Sequência de fotos do PASSO, não do tópico inteiro —
                                        para quando um tópico tem telas diferentes a cada
                                        passo (ou um passo só precisa de mais de uma tela) e a
                                        imagem única da coluna da direita não dá conta de
                                        mostrar tudo (ver PassoComGaleria, ajuda-conteudo.ts). */}
                                    {galeria && (
                                      <div className="mt-2 max-w-md">
                                        <GaleriaDaAjuda prefixo={galeria.prefixo} legenda={galeria.legenda} />
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                            {topico.aviso && (
                              <div className="flex gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-900">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                                <span>{topico.aviso}</span>
                              </div>
                            )}
                          </div>
                          {/* Sempre presente, mesmo vazio: é o que mantém a coluna da imagem
                              alinhada em todas as linhas, tópico tendo imagem ou não. */}
                          <div className="lg:col-start-2">
                            <ImagemDaAjuda imagem={topico.imagem} />
                          </div>
                        </Fragment>
                      ))}
                    </TabsContent>
                  );
                })}
              </div>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
