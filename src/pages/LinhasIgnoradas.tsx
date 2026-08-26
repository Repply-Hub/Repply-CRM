import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Trash2, Eye, ChevronDown, ChevronUp, ChevronRight, FileSpreadsheet, RotateCcw, Loader2, CopyPlus, Check, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useBulkImport } from '@/hooks/use-bulk-import';
import { useAuth } from '@/hooks/use-auth';
import { useClientes, useFabricantes } from '@/hooks/use-clientes';
import { useFunis } from '@/hooks/use-funis';
import { useKanbanColunas } from '@/hooks/use-kanban-colunas';
import { useMarcadores } from '@/hooks/use-marcadores';
import { cn } from '@/lib/utils';

const FIELD_LABELS: Record<string, string> = {
  empresa: 'Empresa', razao_social: 'Razão Social', tipo: 'Tipo', cnpj: 'CNPJ',
  email: 'E-mail', telefone: 'Telefone', logradouro: 'Logradouro', numero: 'Número',
  complemento: 'Complemento', bairro: 'Bairro', cidade: 'Cidade', uf: 'UF', cep: 'CEP',
  data_criacao: 'Data de Criação', cliente: 'Cliente', fabricante: 'Fabricante',
  obra: 'Obra', valor: 'Valor', observacoes: 'Observações', status: 'Status',
  data_pedido: 'Data do Negócio', nome_contato: 'Nome do Contato', cargo: 'Cargo',
  classificacao: 'Classificação', fabricante_nome: 'Fabricante',
  descricao_material: 'Produto', preco_unitario: 'Preço', referencia: 'Referência',
  categoria: 'Categoria', unidade: 'Unidade de Medida', estoque_disponivel: 'Estoque Disponível',
  imagem_url: 'Foto (URL)',
};

const REQUIRED_FIELDS: Record<string, Set<string>> = {
  clientes: new Set(['tipo']),
  clientes_empresas: new Set(['empresa', 'razao_social', 'cnpj']),
  clientes_contatos: new Set(['empresa', 'nome_contato']),
  negocios: new Set(['cliente', 'fabricante', 'valor']),
};

// Fields that are internal/processed and shouldn't be shown for editing
const SKIP_FIELDS = new Set([
  'usuario_id', 'cliente_id', 'fabricante_id', 'obra_id',
  'import_hash', 'campos_extras', '__dateError', '__import_hash',
  'criado_por_usuario_id', 'criado_por_nome',
]);

// ─── Campos que apontam para um cadastro do sistema ────────────────────────────
//
// Estes campos NÃO são texto livre de verdade: cada um deles é casado por NOME
// contra um cadastro existente na hora de reimportar (ver resolve-entities.ts), e
// quando o nome não bate a importação CRIA um registro novo sem perguntar nada.
// Em 4.913 linhas para corrigir à mão, um acento a menos ou um "LTDA" a mais é o
// caminho mais rápido para acabar com dois cadastros do mesmo cliente.
//
// Por isso a caixa de texto vira um seletor com busca: escolher da lista é o
// caminho fácil, e criar um cadastro novo continua possível — só que como uma
// decisão visível, com o nome que vai ser criado escrito na tela.
type TipoCadastro = 'cliente' | 'fabricante' | 'etapa' | 'marcador' | 'tipo_cliente';

interface CampoDeCadastro {
  tipo: TipoCadastro;
  /** Se aceitar um nome fora da lista serve para alguma coisa nesta importação. */
  permitirNovo: boolean;
  /** O que acontece de fato quando o nome não bate com nenhum cadastro. */
  avisoNaoCadastrado: string;
}

function tipoDeCadastroDoCampo(campo: string, tipoImportacao: string): CampoDeCadastro | null {
  const CRIA_SOZINHO = 'Não existe cadastro com este nome — reimportar vai criar um novo.';

  if (campo === 'cliente') return { tipo: 'cliente', permitirNovo: true, avisoNaoCadastrado: CRIA_SOZINHO };
  if (campo === 'fabricante') return { tipo: 'fabricante', permitirNovo: true, avisoNaoCadastrado: CRIA_SOZINHO };
  // `status`/`marcador` só têm cadastro correspondente na importação de negócios;
  // `tipo` só existe na de clientes. Amarrar ao tipo da linha evita oferecer a
  // lista errada caso uma planilha traga uma coluna com o mesmo nome.
  if (campo === 'status' && tipoImportacao === 'negocios') return {
    tipo: 'etapa',
    permitirNovo: false,
    avisoNaoCadastrado: 'Não é uma etapa deste funil — a linha vai cair calada na primeira etapa.',
  };
  if (campo === 'marcador' && tipoImportacao === 'negocios') return { tipo: 'marcador', permitirNovo: true, avisoNaoCadastrado: CRIA_SOZINHO };
  if (campo === 'tipo' && tipoImportacao.startsWith('clientes')) return { tipo: 'tipo_cliente', permitirNovo: true, avisoNaoCadastrado: CRIA_SOZINHO };
  return null;
}

interface OpcaoCadastro {
  /** O texto que vai para `dados_originais` — é por ele que a importação casa o cadastro. */
  valor: string;
  rotulo: string;
  /** Segunda linha da opção: CNPJ, razão social, aviso de nome repetido. Também entra na busca. */
  detalhe?: string;
}

function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Agrupa cadastros pelo nome normalizado.
 *
 * Existe porque a MD tem 35 nomes de cliente repetidos, cobrindo 70 cadastros — e
 * `resolveClienteId` casa por `ilike` pegando o PRIMEIRO. Listar os dois separados
 * daria a impressão de que dá para escolher qual, quando não dá: os dois produzem
 * exatamente o mesmo resultado. Então some numa opção só, dizendo a verdade.
 */
function agruparPorNome(
  registros: Array<{ nome?: string | null; detalhes?: Array<string | null | undefined> }>,
): OpcaoCadastro[] {
  const grupos = new Map<string, { rotulo: string; detalhes: string[]; qtd: number }>();
  for (const registro of registros) {
    const nome = (registro.nome ?? '').trim();
    if (!nome) continue;
    const chave = normalizarBusca(nome);
    const atual = grupos.get(chave) ?? { rotulo: nome, detalhes: [], qtd: 0 };
    atual.qtd += 1;
    (registro.detalhes ?? []).forEach((d) => {
      const texto = (d ?? '').trim();
      if (texto && !atual.detalhes.includes(texto)) atual.detalhes.push(texto);
    });
    grupos.set(chave, atual);
  }
  return Array.from(grupos.values())
    .map(({ rotulo, detalhes, qtd }) => ({
      valor: rotulo,
      rotulo,
      detalhe: qtd > 1
        ? `${qtd} cadastros com este nome — a importação usa o primeiro${detalhes.length ? ` · ${detalhes.join(' · ')}` : ''}`
        : (detalhes.join(' · ') || undefined),
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/**
 * Campo de escolha com busca para os campos que apontam para cadastro.
 *
 * `permitirNovo` liga o botão de rodapé que aceita o texto digitado como um
 * cadastro novo. Fica DESLIGADO onde aceitar texto fora da lista não resolve nada:
 * na etapa do funil o nome que não bate cai calado na primeira coluna, e no
 * catálogo o fabricante inexistente derruba a linha outra vez.
 */
function CampoCadastro({
  id,
  valor,
  aoMudar,
  opcoes,
  carregando,
  placeholder,
  permitirNovo,
  avisoNaoCadastrado,
  desabilitado,
}: {
  id: string;
  valor: string;
  aoMudar: (valor: string) => void;
  opcoes: OpcaoCadastro[];
  carregando?: boolean;
  placeholder: string;
  permitirNovo: boolean;
  avisoNaoCadastrado: string;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');

  const filtradas = useMemo(() => {
    const busca = normalizarBusca(termo.trim());
    if (!busca) return opcoes;
    return opcoes.filter((o) => normalizarBusca(`${o.rotulo} ${o.detalhe ?? ''}`).includes(busca));
  }, [opcoes, termo]);

  const valorLimpo = valor.trim();
  // `opcoes.length === 0` conta como "não sei dizer": enquanto a lista não chegou
  // (ou a empresa não tem esse cadastro nenhum), acusar tudo de não cadastrado
  // seria alarme falso.
  const cadastrado = useMemo(
    () => !valorLimpo || opcoes.length === 0 || opcoes.some((o) => normalizarBusca(o.valor) === normalizarBusca(valorLimpo)),
    [opcoes, valorLimpo],
  );

  const termoLimpo = termo.trim();
  const podeCriar =
    permitirNovo &&
    termoLimpo.length > 0 &&
    !opcoes.some((o) => normalizarBusca(o.valor) === normalizarBusca(termoLimpo));

  return (
    <div className="space-y-1">
      <Popover open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setTermo(''); }}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            disabled={desabilitado}
            className={cn(
              'h-8 w-full justify-between px-2 text-sm font-normal',
              !valorLimpo && 'text-muted-foreground',
              !cadastrado && 'border-amber-500/60',
            )}
          >
            <span className="truncate">{valorLimpo || placeholder}</span>
            <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(24rem,90vw)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar..." value={termo} onValueChange={setTermo} />
            <CommandList className="max-h-[240px]">
              {carregando ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando cadastros...
                </div>
              ) : (
                <>
                  <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                    Nada encontrado com esse texto.
                  </CommandEmpty>
                  <CommandGroup>
                    {filtradas.map((opcao) => (
                      <CommandItem
                        key={opcao.valor}
                        value={opcao.valor}
                        onSelect={() => { aoMudar(opcao.valor); setAberto(false); setTermo(''); }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 shrink-0',
                            normalizarBusca(opcao.valor) === normalizarBusca(valorLimpo) ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm">{opcao.rotulo}</span>
                          {opcao.detalhe && (
                            <span className="truncate text-[10px] text-muted-foreground">{opcao.detalhe}</span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            {(podeCriar || !!valorLimpo) && (
              <div className="space-y-1 border-t p-1">
                {podeCriar && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-full justify-start gap-2 text-xs font-normal"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      aoMudar(termoLimpo);
                      setAberto(false);
                      setTermo('');
                    }}
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span className="truncate">Cadastrar novo: "{termoLimpo}"</span>
                  </Button>
                )}
                {!!valorLimpo && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-full justify-start gap-2 text-xs font-normal text-muted-foreground"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      aoMudar('');
                      setAberto(false);
                      setTermo('');
                    }}
                  >
                    <X className="h-3 w-3 shrink-0" />
                    Deixar em branco
                  </Button>
                )}
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      {!cadastrado && (
        <p className="text-[10px] leading-tight text-amber-600 dark:text-amber-400">
          {avisoNaoCadastrado}
        </p>
      )}
    </div>
  );
}

// Uma linha de negócio ignorada por duplicidade carrega o hash do negócio já existente
// (ver use-bulk-import.ts) — usamos isso para localizar o registro real e montar a
// comparação lado a lado na tela.
function isLinhaDuplicada(linha: { tipo_importacao: string; motivo_ignorado: string | null }): boolean {
  return linha.tipo_importacao === 'negocios' && !!linha.motivo_ignorado?.toLowerCase().startsWith('duplicado');
}

interface PedidoDuplicadoMatch {
  import_hash: string | null;
  status: string;
  valor_total: number | null;
  data_pedido: string;
  created_at: string;
  observacoes: string | null;
  endereco_entrega: string | null;
  cliente: { empresa: string } | null;
  fabricante: { nome: string } | null;
}

const COMPARE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'fabricante', label: 'Fabricante' },
  { key: 'valor', label: 'Valor' },
  { key: 'status', label: 'Status' },
  { key: 'data_pedido', label: 'Data do Negócio' },
  { key: 'obra', label: 'Obra/Endereço' },
  { key: 'observacoes', label: 'Observações' },
];

function normalizeCompareValue(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function DuplicateComparisonTable({
  linha,
  hash,
  pedidoExistente,
}: {
  linha: { created_at: string; dados_originais: unknown };
  hash: string | undefined;
  pedidoExistente: PedidoDuplicadoMatch | undefined;
}) {
  if (!hash) {
    return (
      <p className="text-xs text-muted-foreground">
        Esta linha foi ignorada antes deste recurso passar a registrar o negócio
        original — não é possível localizar o registro para comparar.
      </p>
    );
  }
  if (!pedidoExistente) {
    return (
      <p className="text-xs text-muted-foreground">
        O negócio que motivou esta duplicidade não foi encontrado (pode ter sido excluído).
      </p>
    );
  }
  const dados = (linha.dados_originais ?? {}) as Record<string, unknown>;
  // Data de criação do negócio que estava sendo importado (vinda da própria planilha,
  // via dados_originais.created_at) — não confundir com `linha.created_at`, que é apenas
  // quando este registro de linha ignorada foi logado (ou seja, "agora").
  const criadoEmOriginal = dados.created_at as string | undefined;
  const criadoEmDiferente = criadoEmOriginal
    ? new Date(criadoEmOriginal).getTime() !== new Date(pedidoExistente.created_at).getTime()
    : false;

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="grid grid-cols-3 bg-muted/60 text-[11px] font-semibold text-foreground/70 px-3 py-1.5">
        <span>Campo</span>
        <span>Linha ignorada</span>
        <span>Negócio existente</span>
      </div>
      {COMPARE_FIELDS.map(({ key, label }) => {
        const original = dados[key];
        let existente: unknown;
        switch (key) {
          case 'cliente': existente = pedidoExistente.cliente?.empresa; break;
          case 'fabricante': existente = pedidoExistente.fabricante?.nome; break;
          case 'valor': existente = pedidoExistente.valor_total; break;
          case 'status': existente = pedidoExistente.status; break;
          case 'data_pedido': existente = pedidoExistente.data_pedido; break;
          case 'obra': existente = pedidoExistente.endereco_entrega; break;
          case 'observacoes': existente = pedidoExistente.observacoes; break;
          default: existente = undefined;
        }
        const diferente = normalizeCompareValue(original) !== normalizeCompareValue(existente);
        return (
          <div
            key={key}
            className={`grid grid-cols-3 text-xs px-3 py-1.5 border-t ${diferente ? 'bg-amber-500/10' : ''}`}
          >
            <span className="font-medium text-foreground/70">{label}</span>
            <span className="break-all">{String(original ?? '—')}</span>
            <span className="break-all">{String(existente ?? '—')}</span>
          </div>
        );
      })}
      <div className={`grid grid-cols-3 text-xs px-3 py-1.5 border-t ${criadoEmDiferente ? 'bg-amber-500/10' : ''}`}>
        <span className="font-medium text-foreground/70">Criado em</span>
        <span>{criadoEmOriginal ? format(new Date(criadoEmOriginal), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}</span>
        <span>{format(new Date(pedidoExistente.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
      </div>
    </div>
  );
}

// Fallback field list per type when dados_originais has only internal fields
const FALLBACK_FIELDS: Record<string, string[]> = {
  clientes: ['empresa', 'razao_social', 'tipo', 'cnpj', 'email', 'telefone', 'cidade', 'uf'],
  clientes_empresas: ['empresa', 'razao_social', 'tipo', 'cnpj', 'email', 'telefone', 'cidade', 'uf'],
  clientes_contatos: ['empresa', 'nome_contato', 'cargo', 'email', 'telefone'],
  negocios: ['cliente', 'fabricante', 'obra', 'valor', 'status', 'data_pedido', 'observacoes'],
};

async function logLinhaIgnoradaRetry(tipo: string, dados: Record<string, unknown>, motivo: string, nomeArquivo?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('linhas_ignoradas_importacao').insert({
    usuario_id: user.id,
    tipo_importacao: tipo,
    dados_originais: dados,
    motivo_ignorado: motivo,
    nome_arquivo: nomeArquivo ?? null,
  });
}

// Import de Contatos não passa pelo hook useBulkImport (que só sabe inserir em `clientes`
// e `pedidos`), então o reenvio de uma linha ignorada de contato insere direto na tabela —
// mesma lógica de resolução de cliente_id por nome da ImportClientesDialog original.
async function retryContato(fields: Record<string, string>, nomeArquivo?: string) {
  try {
    if (!fields.empresa && !fields.nome_contato) {
      throw new Error('Falta Empresa ou Nome');
    }
    const { data: vid, error: vidError } = await supabase.rpc('get_my_vendedor_id');
    if (vidError || !vid) throw new Error('Não foi possível identificar seu usuário.');

    let clienteId: string | null = null;
    if (fields.empresa) {
      const { data: cliente } = await supabase
        .from('clientes')
        .select('id')
        .ilike('empresa', fields.empresa.trim())
        .maybeSingle();
      clienteId = cliente?.id ?? null;
    }

    const { error } = await supabase.from('contatos').insert({
      empresa: fields.empresa || 'Sem empresa',
      cliente_id: clienteId,
      nome_contato: fields.nome_contato || fields.empresa || null,
      email: fields.email || null,
      telefone: fields.telefone || null,
      cargo: fields.cargo || null,
      logradouro: fields.logradouro || null,
      numero: fields.numero || null,
      complemento: fields.complemento || null,
      bairro: fields.bairro || null,
      cidade: fields.cidade || null,
      uf: fields.uf || null,
      cep: fields.cep || null,
      classificacao: fields.classificacao || null,
      data_criacao: fields.data_criacao || null,
      usuario_id: vid,
    });
    if (error) throw error;
  } catch (err) {
    await logLinhaIgnoradaRetry('clientes_contatos', fields, (err as Error).message, nomeArquivo);
    throw err;
  }
}

/**
 * Uma linha que a importação recusou. Vem do tipo GERADO pelo Supabase em vez de
 * escrito à mão: assim, se a tabela mudar de formato, o erro aparece aqui na hora
 * da compilação em vez de virar campo vazio na tela.
 */
type LinhaIgnorada = Database['public']['Tables']['linhas_ignoradas_importacao']['Row'];

/**
 * `dados_originais` é `Json` no tipo gerado, ou seja: pode ser texto, número, lista
 * ou objeto. A importação sempre grava um OBJETO (a linha da planilha, campo a campo),
 * mas o tipo não sabe disso. Esta função deixa a suposição explícita e devolve um
 * objeto vazio quando a forma vier diferente — em vez de escondê-la atrás de um `as`
 * que estouraria em tempo de execução se um dia vier outra coisa.
 */
function comoObjeto(valor: Json | null | undefined): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

export default function LinhasIgnoradas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedRow, setSelectedRow] = useState<LinhaIgnorada | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [retryRow, setRetryRow] = useState<LinhaIgnorada | null>(null);
  const [retryFields, setRetryFields] = useState<Record<string, string>>({});
  const [isRetrying, setIsRetrying] = useState(false);

  const { importClientes, importNegocios } = useBulkImport();

  // ── Cadastros que alimentam os seletores do diálogo de correção ──────────────
  // `enabled` amarrado ao diálogo: a lista de clientes é a consulta mais cara do
  // sistema (1.305 registros com obras e um join de usuários) e esta tela abre
  // muitas vezes só para conferir a contagem, sem abrir correção nenhuma.
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;
  const retryAberto = !!retryRow;
  const { data: clientesCadastrados, isLoading: carregandoClientes } = useClientes({ enabled: retryAberto });
  const { data: fabricantesCadastrados, isLoading: carregandoFabricantes } = useFabricantes();
  const { data: marcadoresCadastrados } = useMarcadores(empresaId);
  const { data: funis } = useFunis(empresaId);
  // O reenvio de uma linha de negócio não escolhe funil (ver handleRetrySubmit →
  // importNegocios sem funilIdParam), então as etapas ofertadas têm que ser as do
  // funil padrão — as mesmas contra as quais o status vai ser casado.
  const funilPadraoId = useMemo(
    () => (funis ?? []).find(f => f.is_padrao)?.id ?? funis?.[0]?.id,
    [funis],
  );
  const { data: etapasFunil } = useKanbanColunas(empresaId, funilPadraoId);

  const opcoesClientes = useMemo(
    () => agruparPorNome((clientesCadastrados ?? []).map((c) => ({
      nome: c.empresa,
      detalhes: [c.razao_social, c.cnpj],
    }))),
    [clientesCadastrados],
  );

  const opcoesFabricantes = useMemo(
    () => agruparPorNome((fabricantesCadastrados ?? []).map((f: any) => ({
      nome: f.nome,
      detalhes: [f.cnpj],
    }))),
    [fabricantesCadastrados],
  );

  const opcoesEtapas = useMemo(
    () => agruparPorNome((etapasFunil ?? []).map(c => ({ nome: c.nome }))),
    [etapasFunil],
  );

  const opcoesMarcadores = useMemo(
    () => agruparPorNome((marcadoresCadastrados ?? []).map(m => ({ nome: m.nome }))),
    [marcadoresCadastrados],
  );

  // "Tipo" de cliente não é lista fixa no banco: é texto livre que virou 19 valores
  // distintos ao longo do tempo ("construtora - 3 níveis", "hotéis"...). A lista
  // ofertada é o que a base já usa, para a correção manual parar de inventar
  // variações novas do mesmo tipo.
  const opcoesTiposCliente = useMemo<OpcaoCadastro[]>(() => {
    const vistos = new Map<string, string>();
    (clientesCadastrados ?? []).forEach((c: any) => {
      const tipo = (c.tipo ?? '').trim();
      if (tipo && !vistos.has(normalizarBusca(tipo))) vistos.set(normalizarBusca(tipo), tipo);
    });
    return Array.from(vistos.values())
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(tipo => ({ valor: tipo, rotulo: tipo }));
  }, [clientesCadastrados]);

  const cadastroDoTipo = (tipo: TipoCadastro) => {
    switch (tipo) {
      case 'cliente':
        return { opcoes: opcoesClientes, carregando: carregandoClientes, placeholder: 'Escolher cliente' };
      case 'fabricante':
        return { opcoes: opcoesFabricantes, carregando: carregandoFabricantes, placeholder: 'Escolher fabricante' };
      case 'etapa':
        return { opcoes: opcoesEtapas, carregando: false, placeholder: 'Escolher etapa' };
      case 'marcador':
        return { opcoes: opcoesMarcadores, carregando: false, placeholder: 'Escolher marcador' };
      case 'tipo_cliente':
        return { opcoes: opcoesTiposCliente, carregando: carregandoClientes, placeholder: 'Escolher tipo' };
    }
  };

  const { data: linhas, isLoading } = useQuery({
    queryKey: ['linhas_ignoradas_importacao'],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('linhas_ignoradas_importacao')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { data, count };
    },
  });

  // Hashes de todas as linhas ignoradas por duplicidade presentes na lista — usados para
  // buscar em lote (1 query) os negócios já existentes que motivaram cada ignorada.
  const duplicateHashes = useMemo(() => {
    const hashes = new Set<string>();
    (linhas?.data ?? []).forEach((linha) => {
      if (!isLinhaDuplicada(linha)) return;
      const hash = (linha.dados_originais as Record<string, unknown> | null)?.__import_hash;
      if (typeof hash === 'string' && hash) hashes.add(hash);
    });
    return Array.from(hashes);
  }, [linhas]);

  const { data: duplicateMatches } = useQuery({
    queryKey: ['linhas_ignoradas_duplicate_matches', duplicateHashes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('import_hash, status, valor_total, data_pedido, created_at, observacoes, endereco_entrega, cliente:clientes(empresa), fabricante:fabricantes(nome)')
        .in('import_hash', duplicateHashes);
      if (error) throw error;
      const map = new Map<string, PedidoDuplicadoMatch>();
      (data as unknown as PedidoDuplicadoMatch[] ?? []).forEach((pedido) => {
        if (pedido.import_hash) map.set(pedido.import_hash, pedido);
      });
      return map;
    },
    enabled: duplicateHashes.length > 0,
  });

  const saveEditMutation = useMutation({
    mutationFn: async ({ id, dadosOriginais, fields }: { id: string; dadosOriginais: Record<string, unknown>; fields: Record<string, string> }) => {
      const merged = { ...dadosOriginais, ...fields };
      const { error } = await supabase
        .from('linhas_ignoradas_importacao')
        .update({ dados_originais: merged })
        .eq('id', id);
      if (error) throw error;
      return merged;
    },
    onSuccess: (merged) => {
      queryClient.invalidateQueries({ queryKey: ['linhas_ignoradas_importacao'] });
      setRetryRow((prev: any) => prev && { ...prev, dados_originais: merged });
      toast.success('Alterações salvas');
    },
    onError: (err) => {
      toast.error('Erro ao salvar alterações: ' + (err as Error).message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('linhas_ignoradas_importacao')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linhas_ignoradas_importacao'] });
      toast.success('Linha removida');
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user.id) return;

      const { error } = await supabase
        .from('linhas_ignoradas_importacao')
        .delete()
        .eq('usuario_id', session.session.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linhas_ignoradas_importacao'] });
      toast.success('Todas as linhas foram removidas');
    },
  });

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFile = (fileKey: string) => {
    setOpenFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileKey)) next.delete(fileKey);
      else next.add(fileKey);
      return next;
    });
  };

  const handleShowDetails = (linha: any) => {
    setSelectedRow(linha);
    setIsDetailsOpen(true);
  };

  const handleOpenRetry = (linha: any) => {
    const dados = linha.dados_originais ?? {};
    const visibleKeys = Object.keys(dados).filter(k => !SKIP_FIELDS.has(k));

    // If dados_originais only has internal fields, fall back to the standard field list
    const keys = visibleKeys.length > 0
      ? visibleKeys
      : (FALLBACK_FIELDS[linha.tipo_importacao] ?? []);

    const fields: Record<string, string> = {};
    keys.forEach(k => { fields[k] = String(dados[k] ?? ''); });
    setRetryFields(fields);
    setRetryRow(linha);
  };

  const handleRetrySubmit = async (forceKeepDuplicate = false) => {
    if (!retryRow || isRetrying) return;
    setIsRetrying(true);
    try {
      // Apaga a linha original primeiro — se falhar de novo, o hook (clientes/negócios) ou
      // a função de retry (contatos/catálogo) recria a linha ignorada com os dados
      // atualizados e o novo motivo, então uma tentativa que falha nunca se perde.
      await supabase.from('linhas_ignoradas_importacao').delete().eq('id', retryRow.id);

      const tipo = retryRow.tipo_importacao as string;
      let success = false;

      if (tipo === 'clientes' || tipo === 'clientes_empresas') {
        const summary = await importClientes([retryFields as Record<string, unknown>], retryRow.nome_arquivo);
        success = summary.inserted > 0;
      } else if (tipo === 'clientes_contatos') {
        await retryContato(retryFields, retryRow.nome_arquivo);
        success = true;
      } else {
        // forceKeepDuplicate pula a checagem de hash — usado quando o usuário já revisou a
        // comparação com o negócio existente e decidiu manter os dois mesmo assim.
        const summary = await importNegocios(
          [retryFields as Record<string, unknown>],
          retryRow.nome_arquivo,
          undefined,
          undefined,
          { ignoreDuplicateCheck: forceKeepDuplicate },
        );
        success = summary.inserted > 0;
      }

      if (success) {
        toast.success(forceKeepDuplicate ? 'Negócio mantido e importado como duplicado.' : 'Linha importada com sucesso!');
        setRetryRow(null);
      }
      queryClient.invalidateQueries({ queryKey: ['linhas_ignoradas_importacao'] });
    } catch (err) {
      toast.error('Erro ao tentar importar: ' + (err as Error).message);
      queryClient.invalidateQueries({ queryKey: ['linhas_ignoradas_importacao'] });
    } finally {
      setIsRetrying(false);
    }
  };

  const requiredForType = (tipo: string) => REQUIRED_FIELDS[tipo] ?? new Set<string>();

  const fileGroups = (linhas?.data ?? []).reduce((acc, linha) => {
    const key = linha.nome_arquivo || 'Sem arquivo de origem';
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key)!.push(linha);
    return acc;
  }, new Map<string, NonNullable<typeof linhas>['data']>());

  return (
    <AppLayout
      title="Linhas Ignoradas na Importação"
      subtitle="Revise e ajuste dados que não puderam ser importados automaticamente"
      mainClassName="flex-1 overflow-hidden flex flex-col"
    >
      {/* Padding que encolhe com a tela: com `p-6` fixo, num celular ou em zoom alto
          48px dos dois lados saem do espaço útil de leitura da lista. */}
      <div className="flex flex-1 min-h-0 flex-col gap-6 p-3 sm:p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 shrink-0 self-start"
          onClick={() => navigate('/app')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Negócios
        </Button>
        <div className="flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <span>{linhas?.count ?? 0} linhas pendentes de revisão</span>
          </div>
          {linhas?.data && linhas.data.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar tudo
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">Carregando...</div>
        ) : linhas?.data?.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border rounded-lg bg-card">
            Nenhuma linha ignorada encontrada.
          </div>
        ) : (
          <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
            {Array.from(fileGroups.entries()).map(([fileKey, fileLinhas]) => {
              const isFileOpen = openFiles.has(fileKey);
              const tipos = Array.from(new Set(fileLinhas.map(l => l.tipo_importacao)));

              return (
                <div key={fileKey} className="border rounded-lg bg-card overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => toggleFile(fileKey)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isFileOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium truncate">{fileKey}</span>
                      {tipos.map(tipo => (
                        <Badge key={tipo} variant="outline" className="capitalize text-xs shrink-0">
                          {tipo}
                        </Badge>
                      ))}
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {fileLinhas.length} linha{fileLinhas.length !== 1 ? 's' : ''}
                    </Badge>
                  </button>

                  {isFileOpen && (
                    <div className="border-t bg-muted/20 p-3 space-y-3">
                      {fileLinhas.map((linha) => {
                        const isExpanded = expandedIds.has(linha.id);
                        const entries = Object.entries(linha.dados_originais ?? {}).filter(([key]) => key !== '__import_hash');
                        const preview = entries.slice(0, 3);
                        const duplicada = isLinhaDuplicada(linha);
                        const duplicadaHash = duplicada
                          ? (linha.dados_originais as Record<string, unknown> | null)?.__import_hash as string | undefined
                          : undefined;
                        const pedidoExistente = duplicadaHash ? duplicateMatches?.get(duplicadaHash) : undefined;

                        return (
                          <div key={linha.id} className="border rounded-lg bg-card overflow-hidden">
                            <div className="flex items-start justify-between gap-4 p-4">
                              <div className="flex items-start gap-3 min-w-0">
                                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(linha.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                    </span>
                                    {duplicada && (
                                      <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400">
                                        Duplicado
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-destructive font-medium">
                                    {linha.motivo_ignorado || 'Campo obrigatório ausente'}
                                  </p>
                                  <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                                    {preview.map(([key, value]) => (
                                      <div key={key} className="truncate">
                                        <span className="font-semibold text-foreground/70">{key}:</span>{' '}
                                        {String(value ?? '—')}
                                      </div>
                                    ))}
                                    {entries.length > 3 && !isExpanded && (
                                      <span className="text-muted-foreground/60">
                                        +{entries.length - 3} campo(s) oculto(s)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => toggleExpand(linha.id)}
                                  title={isExpanded ? 'Recolher' : 'Expandir dados'}
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                  onClick={() => handleOpenRetry(linha)}
                                  title="Tentar importar novamente"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleShowDetails(linha)}
                                  title="Ver detalhes"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => deleteMutation.mutate(linha.id)}
                                  title="Remover"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t bg-muted/40 px-4 py-3">
                                <div className="font-mono text-xs space-y-1.5">
                                  {entries.map(([key, value]) => (
                                    <div key={key} className="flex gap-2 border-b border-muted-foreground/10 pb-1 last:border-0">
                                      <span className="font-bold text-foreground/70 w-1/3 shrink-0">{key}:</span>
                                      <span className="break-all text-foreground/90">{String(value ?? '—')}</span>
                                    </div>
                                  ))}
                                </div>

                                {duplicada && (
                                  <div className="mt-3 pt-3 border-t border-muted-foreground/20">
                                    <p className="text-xs font-semibold text-foreground/70 mb-2">
                                      Comparação com o negócio já existente
                                    </p>
                                    <DuplicateComparisonTable
                                      linha={linha}
                                      hash={duplicadaHash}
                                      pedidoExistente={pedidoExistente}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Retry dialog */}
      <Dialog open={!!retryRow} onOpenChange={(o) => !o && !isRetrying && setRetryRow(null)}>
        <ConteudoDialogo className="max-w-xl">
          <CabecalhoDialogo>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Tentar importar novamente
            </DialogTitle>
            <DialogDescription>
              Edite os campos abaixo. Use "Salvar alterações" para corrigir a linha sem reenviar agora, ou
              "Confirmar e Importar" para editar e tentar importar imediatamente.
              {retryRow && isLinhaDuplicada(retryRow) && (
                <span className="block mt-1">
                  Se preferir manter os dois negócios mesmo sendo idênticos, use "Manter como duplicado".
                </span>
              )}
              {retryRow?.motivo_ignorado && (
                <span className="block mt-1 text-destructive font-medium">
                  Motivo anterior: {retryRow.motivo_ignorado}
                </span>
              )}
            </DialogDescription>
          </CabecalhoDialogo>

          <CorpoDialogo className="py-2">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {Object.entries(retryFields).map(([key, value]) => {
                const isRequired = requiredForType(retryRow?.tipo_importacao).has(key);
                const campoCadastro = tipoDeCadastroDoCampo(key, retryRow?.tipo_importacao ?? '');
                return (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`retry-${key}`} className="text-xs font-semibold">
                      {FIELD_LABELS[key] ?? key}
                      {isRequired && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    {campoCadastro ? (
                      (() => {
                        const cadastro = cadastroDoTipo(campoCadastro.tipo);
                        return (
                          <CampoCadastro
                            id={`retry-${key}`}
                            valor={value}
                            aoMudar={(novo) => setRetryFields(prev => ({ ...prev, [key]: novo }))}
                            opcoes={cadastro.opcoes}
                            carregando={cadastro.carregando}
                            placeholder={cadastro.placeholder}
                            permitirNovo={campoCadastro.permitirNovo}
                            avisoNaoCadastrado={campoCadastro.avisoNaoCadastrado}
                            desabilitado={isRetrying}
                          />
                        );
                      })()
                    ) : (
                      <Input
                        id={`retry-${key}`}
                        value={value}
                        onChange={(e) =>
                          setRetryFields(prev => ({ ...prev, [key]: e.target.value }))
                        }
                        className="h-8 text-sm"
                        disabled={isRetrying}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CorpoDialogo>

          {/* `flex-wrap` porque uma linha duplicada mostra 4 botões que somam 679px num
              diálogo de 528px de miolo: sem quebra, o "Cancelar" saía para fora da tela à
              esquerda a partir de 768px. O `sm:space-x-0` anula o espaçamento herdado do
              DialogFooter, que somava com o `gap-2` e desalinhava a segunda linha. */}
          <RodapeDialogo className="flex-wrap justify-end gap-2 border-t pt-2 sm:gap-2 sm:space-x-0">
            <Button variant="outline" onClick={() => setRetryRow(null)} disabled={isRetrying}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => retryRow && saveEditMutation.mutate({
                id: retryRow.id,
                dadosOriginais: comoObjeto(retryRow.dados_originais),
                fields: retryFields,
              })}
              disabled={isRetrying || saveEditMutation.isPending}
            >
              {saveEditMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar alterações
            </Button>
            {retryRow && isLinhaDuplicada(retryRow) && (
              <Button
                variant="outline"
                onClick={() => handleRetrySubmit(true)}
                disabled={isRetrying || saveEditMutation.isPending}
                title="Importa mesmo sendo idêntico a um negócio já existente"
              >
                <CopyPlus className="h-4 w-4 mr-2" />
                Manter como duplicado
              </Button>
            )}
            <Button onClick={() => handleRetrySubmit()} disabled={isRetrying || saveEditMutation.isPending}>
              {isRetrying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isRetrying ? 'Importando...' : 'Confirmar e Importar'}
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todas as linhas ignoradas?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as {linhas?.count ?? 0} linhas ignoradas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearAllMutation.mutate()}
              disabled={clearAllMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Limpar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <ConteudoDialogo
          className={selectedRow && isLinhaDuplicada(selectedRow) ? 'max-w-4xl' : 'max-w-2xl'}
        >
          <CabecalhoDialogo>
            <DialogTitle>Detalhes da Linha Ignorada</DialogTitle>
            <DialogDescription>
              Dados originais da planilha que não foram importados.
            </DialogDescription>
          </CabecalhoDialogo>

          {(() => {
            const selectedDuplicada = selectedRow ? isLinhaDuplicada(selectedRow) : false;
            const selectedDuplicadaHash = selectedDuplicada
              ? (selectedRow?.dados_originais as Record<string, unknown> | null)?.__import_hash as string | undefined
              : undefined;
            const selectedPedidoExistente = selectedDuplicadaHash ? duplicateMatches?.get(selectedDuplicadaHash) : undefined;

            return (
          <CorpoDialogo className="py-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Tipo de Importação</span>
                  <p className="capitalize">{selectedRow?.tipo_importacao}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Motivo</span>
                  <p className="text-destructive font-medium">{selectedRow?.motivo_ignorado || 'Campo obrigatório ausente'}</p>
                </div>
                {selectedRow?.nome_arquivo && (
                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-semibold text-muted-foreground">Arquivo de Origem</span>
                    <p className="flex items-center gap-1.5 text-sm">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      {selectedRow.nome_arquivo}
                    </p>
                  </div>
                )}
              </div>

              <div className={selectedDuplicada ? 'grid grid-cols-1 gap-4 md:grid-cols-2 items-start' : ''}>
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {selectedDuplicada ? 'O que foi tentado importar' : 'Dados da Linha'}
                  </span>
                  <div className="bg-muted p-4 rounded-md font-mono text-xs space-y-2 border">
                    {selectedRow?.dados_originais && Object.entries(selectedRow.dados_originais).filter(([key]) => key !== '__import_hash').map(([key, value]: [string, any]) => (
                      <div key={key} className="flex border-b border-muted-foreground/10 pb-1 last:border-0">
                        <span className="font-bold w-1/3 shrink-0">{key}:</span>
                        <span className="break-all">{String(value ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedDuplicada && selectedRow && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-muted-foreground">A duplicação</span>
                    <DuplicateComparisonTable
                      linha={selectedRow}
                      hash={selectedDuplicadaHash}
                      pedidoExistente={selectedPedidoExistente}
                    />
                  </div>
                )}
              </div>
            </div>
          </CorpoDialogo>
            );
          })()}

          <RodapeDialogo className="flex-wrap justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsDetailsOpen(false);
                handleOpenRetry(selectedRow);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Editar para importar novamente
            </Button>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Fechar
            </Button>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialog>
    </AppLayout>
  );
}
