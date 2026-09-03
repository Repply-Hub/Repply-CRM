import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MODULOS } from '@/hooks/use-permissoes';
import { SECOES } from '@/lib/secoes';
import { useSecoesDaEmpresa } from '@/hooks/use-secoes';
import { cn } from '@/lib/utils';
import type { MatrixModuloValue } from './PermissaoMatrixEditor';

// ─── Matriz "Quem vê o quê." ───
// Leitura de uma linha só: cada módulo é uma linha, cada ação (ver, criar,
// editar, excluir) é uma caixa. Sem expandir, sem funcionalidade fina — para
// isso existe o PermissaoMatrixEditor. As duas dividem o mesmo contrato
// (getValue / onChange), então trocar uma pela outra não mexe em UsuariosTab.
//
// A ORDEM e as descrições curtas são fixas aqui de propósito: é o texto que o
// gestor lê para decidir, não o texto técnico de `MODULOS.descricoes` (que
// descreve a AÇÃO, não o módulo). A lista cobre TODOS os módulos de `MODULOS` —
// se um novo módulo nascer lá e não ganhar linha aqui, ele some desta visão.
const LINHAS: { key: string; label: string; resumo: string }[] = [
  { key: 'pedidos', label: 'Negócios', resumo: 'funil, lista e edição' },
  { key: 'clientes', label: 'Clientes', resumo: 'carteira de empresas' },
  { key: 'contatos', label: 'Contatos', resumo: 'pessoas dentro dos clientes' },
  { key: 'obras', label: 'Obras', resumo: 'canteiros e mapa' },
  { key: 'fabricantes', label: 'Fabricantes', resumo: 'representadas e seus arquivos' },
  { key: 'dashboard', label: 'Dashboard', resumo: 'números da empresa' },
  { key: 'plano_vendas', label: 'Plano de Vendas', resumo: 'meta x realizado no Dashboard' },
  { key: 'portal', label: 'Portal de Consultas', resumo: 'licenças do RN' },
  { key: 'calendario', label: 'Calendário', resumo: 'eventos e prazos' },
  { key: 'tarefas', label: 'Tarefas', resumo: 'lista e responsáveis' },
  { key: 'chat', label: 'Chat interno', resumo: 'mensagens da equipe' },
  { key: 'whatsapp', label: 'WhatsApp', resumo: 'conversas da empresa' },
  { key: 'emails', label: 'E-mails', resumo: 'caixa de entrada e envio' },
  { key: 'configuracoes', label: 'Configurações', resumo: 'equipe, permissões e ajustes' },
];

const ACOES = [
  { campo: 'pode_ver' as const, label: 'Ver' },
  { campo: 'pode_criar' as const, label: 'Criar' },
  { campo: 'pode_editar' as const, label: 'Editar' },
  { campo: 'pode_excluir' as const, label: 'Excluir' },
];

// Ação que o módulo não tem como cumprir — o texto de `MODULOS` já marca isso
// com "Não aplicável". A caixa aparece igual (o mockup mostra caixa vazia, não
// um traço), mas desligada: ligar "criar" no Dashboard grava um valor que nada
// lê.
function acaoNaoAplicavel(moduloKey: string, campo: string): boolean {
  const mod = MODULOS.find(m => m.key === moduloKey);
  if (!mod) return false;
  const chave = campo.replace('pode_', '') as 'ver' | 'criar' | 'editar' | 'excluir';
  return mod.descricoes[chave]?.toLowerCase().startsWith('não aplicável') ?? false;
}

export function PermissaoMatrizChecklist({
  getValue,
  onChange,
  defaultVer = true,
}: {
  getValue: (moduloKey: string) => MatrixModuloValue | undefined;
  onChange: (moduloKey: string, updates: Partial<MatrixModuloValue>) => void;
  defaultVer?: boolean;
}) {
  const { mapa: secoesDaEmpresa } = useSecoesDaEmpresa();

  // Mesma regra do PermissaoMatrixEditor: módulo de seção que a empresa não
  // contratou some da matriz (a rota e o banco já recusam de qualquer forma).
  // Enquanto o mapa não chega, mostra tudo — o contrário faria a tabela piscar
  // vazia a cada carregamento.
  const linhas = LINHAS.filter(linha => {
    if (!secoesDaEmpresa) return true;
    const secao = SECOES.find(s => s.modulosPermissao.includes(linha.key));
    if (!secao?.desligavel) return true;
    return secoesDaEmpresa.get(secao.id) !== false;
  });

  // Três faixas: cabeçalho de colunas preso no topo, lista rolando no meio,
  // aviso preso embaixo. Só a faixa do meio rola — com 14 módulos, sem isto o
  // "Excluir" some por baixo e o gestor perde a referência das colunas.
  // O `<ScrollArea>` do Radix usa barra sobreposta (não ocupa largura), então o
  // cabeçalho de fora continua alinhado com as linhas de dentro.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-[1fr_repeat(4,64px)] sm:grid-cols-[1fr_repeat(4,80px)] items-end gap-x-2 border-b border-border pb-2 flex-none">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Módulo
        </span>
        {ACOES.map(acao => (
          <span
            key={acao.campo}
            className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {acao.label}
          </span>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="divide-y divide-border/60">
        {linhas.map(linha => {
          const perm = getValue(linha.key);
          return (
            <div
              key={linha.key}
              className="grid grid-cols-[1fr_repeat(4,64px)] sm:grid-cols-[1fr_repeat(4,80px)] items-center gap-x-2 py-4"
            >
              <div className="min-w-0 pr-3">
                <p className="text-sm font-semibold text-foreground">{linha.label}</p>
                <p className="text-xs text-muted-foreground">{linha.resumo}</p>
              </div>

              {ACOES.map(acao => {
                const naoAplicavel = acaoNaoAplicavel(linha.key, acao.campo);
                const marcado = naoAplicavel
                  ? false
                  : acao.campo === 'pode_ver'
                    ? perm?.pode_ver ?? defaultVer
                    : perm?.[acao.campo] ?? false;
                return (
                  <div key={acao.campo} className="flex justify-center">
                    <Checkbox
                      checked={marcado}
                      disabled={naoAplicavel}
                      aria-label={`${acao.label} — ${linha.label}`}
                      title={naoAplicavel ? `${acao.label} não se aplica a ${linha.label}` : undefined}
                      onCheckedChange={valor =>
                        onChange(linha.key, { [acao.campo]: valor === true } as Partial<MatrixModuloValue>)
                      }
                      className={cn(
                        'size-5 rounded-[6px] border-muted-foreground/35',
                        'data-[state=checked]:border-primary',
                        naoAplicavel && 'opacity-40',
                      )}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
        </div>
      </ScrollArea>

      <p className="flex-none border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        A permissão da tela é conveniência de navegação. Quem recusa de verdade é a regra
        de segurança do banco — o que fica escondido aqui continua protegido lá.
      </p>
    </div>
  );
}
