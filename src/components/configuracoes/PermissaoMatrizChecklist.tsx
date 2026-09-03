import { Checkbox } from '@/components/ui/checkbox';
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
// descreve a AÇÃO, não o módulo). Módulo fora desta lista simplesmente não
// aparece nesta visão.
const LINHAS: { key: string; label: string; resumo: string }[] = [
  { key: 'pedidos', label: 'Negócios', resumo: 'funil, lista e edição' },
  { key: 'clientes', label: 'Clientes', resumo: 'carteira e contatos' },
  { key: 'obras', label: 'Obras', resumo: 'canteiros e mapa' },
  { key: 'dashboard', label: 'Dashboard', resumo: 'números da empresa' },
  { key: 'whatsapp', label: 'WhatsApp', resumo: 'conversas da empresa' },
  { key: 'portal', label: 'Portal de Consultas', resumo: 'licenças do RN' },
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

  return (
    <div>
      <div className="grid grid-cols-[1fr_repeat(4,64px)] sm:grid-cols-[1fr_repeat(4,80px)] items-end gap-x-2 border-b border-border pb-2">
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

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        A permissão da tela é conveniência de navegação. Quem recusa de verdade é a regra
        de segurança do banco — o que fica escondido aqui continua protegido lá.
      </p>
    </div>
  );
}
