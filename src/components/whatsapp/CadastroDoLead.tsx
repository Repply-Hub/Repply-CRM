import { Loader2, Link2, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  useContatosComEsteTelefone,
  useVincularContatoExistente,
} from '@/hooks/use-contato-por-telefone';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

interface CadastroDoLeadProps {
  conversa: { id: string; telefone: string; is_group?: boolean | null };
  /** Abre o diálogo de cadastro novo — vive no painel, porque é ele que já o monta. */
  onCadastrar: () => void;
}

/**
 * O bloco "Cadastro" do painel do lead: diz se esta pessoa já existe no CRM e oferece a saída.
 *
 * 🔴 O DEFEITO QUE ISTO FECHA. Medido em produção em 28/08/2026:
 *
 *   conversas de pessoa (sem grupo) ..................... 757
 *   delas, ligadas a um contato do CRM ..................   0
 *   delas cujo telefone JÁ ESTÁ em `contatos` ...........  54
 *
 * Até aqui o painel decidia só por `conversa.contato_id`, uma coluna que ninguém escrevia sem
 * um cadastro manual. Para essas 54 pessoas — que ESTÃO no CRM — a tela afirmava "Esta pessoa
 * não está no CRM" e oferecia cadastrar de novo. Aceitar criava ficha repetida, com o histórico
 * da pessoa rachado entre as duas.
 *
 * Caso relatado pelo dono do produto e confirmado no banco: a ficha diz
 * "Lucas Dutra - Macam Empreendimentos", o WhatsApp mostra "Lucas - Macam Engenharia", mesmo
 * telefone. Os NOMES divergem — por isso o reconhecimento é por telefone, nunca por nome.
 *
 * 🔴 RECONHECER NÃO É AMARRAR. A tela mostra quem encontrou e espera o clique. Amarrar sozinho
 * seria uma correção em massa disfarçada: 44 telefones desta base pertencem a mais de um
 * contato (recepção, escritório, a mesma pessoa cadastrada duas vezes), e o vínculo errado é
 * pior que vínculo nenhum porque some da vista. Ver `use-contato-por-telefone.ts`.
 */
export function CadastroDoLead({ conversa, onCadastrar }: CadastroDoLeadProps) {
  const { encontrados, carregando, temChave } = useContatosComEsteTelefone(
    conversa.telefone,
    !conversa.is_group,
  );
  const vincular = useVincularContatoExistente();

  const amarrar = async (contatoId: string, clienteId: string | null, nome: string | null) => {
    try {
      await vincular.mutateAsync({ conversaId: conversa.id, contatoId, clienteId });
      toast.success(`Conversa ligada a ${nome || 'este contato'}.`);
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível ligar a conversa a este contato.'));
    }
  };

  // 🔴 Enquanto procura, NÃO diga "não está no CRM". A frase apareceria e sumiria em quem já
  // está cadastrado, e é justamente a frase que leva a pessoa a criar o contato repetido.
  if (carregando) {
    return (
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Cadastro
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Procurando este telefone no cadastro...
        </div>
        <Separator />
      </div>
    );
  }

  if (encontrados.length > 0) {
    return (
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Cadastro
        </p>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium text-card-foreground">
            {encontrados.length === 1
              ? 'Esta pessoa já está no CRM'
              : `${encontrados.length} contatos têm este telefone`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {encontrados.length === 1
              ? 'Ligue a conversa à ficha para o histórico ficar no mesmo lugar.'
              : 'Escolha de quem é esta conversa. Telefone de recepção costuma se repetir entre pessoas.'}
          </p>

          <div className="mt-2.5 space-y-1.5">
            {encontrados.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"
              >
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.nome_contato || 'Contato sem nome'}
                  </p>
                  {(c.empresa || c.cargo) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.cargo, c.empresa].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1.5"
                  onClick={() => amarrar(c.id, c.cliente_id, c.nome_contato)}
                  disabled={vincular.isPending}
                >
                  {vincular.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Link2 className="h-3 w-3" />
                  )}
                  Vincular
                </Button>
              </div>
            ))}
          </div>

          {/* 🔴 A saída para quando NENHUM deles é a pessoa certa. Sem ela, quem fala com o
              engenheiro pelo telefone do escritório fica sem caminho — e o reconhecimento
              viraria uma parede em vez de um atalho. */}
          <button
            type="button"
            onClick={onCadastrar}
            className="mt-2.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Não é nenhum desses — cadastrar como contato novo
          </button>
        </div>
        <Separator />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Cadastro
      </p>
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
        <p className="text-sm font-medium text-card-foreground">Esta pessoa não está no CRM</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {temChave
            ? 'Cadastre para ela aparecer na busca de contatos, nos negócios e nas obras.'
            : 'Este número não tem o formato de um telefone brasileiro, então não deu para procurar no cadastro.'}
        </p>
        <Button size="sm" className="mt-2.5 gap-1.5" onClick={onCadastrar}>
          <UserPlus className="h-3.5 w-3.5" />
          Cadastrar como contato
        </Button>
      </div>
      <Separator />
    </div>
  );
}
