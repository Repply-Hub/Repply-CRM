import { useState } from 'react';
import { Loader2, Link2, User, UserPlus, TriangleAlert, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  useContatosComEsteTelefone,
  useContatosParecidos,
  useVincularContatoExistente,
  type ContatoReconhecido,
} from '@/hooks/use-contato-por-telefone';
import { telefoneParaCadastro } from '@/lib/contato-da-conversa';
import { VincularContatoExistente } from './VincularContatoExistente';
import { VincularEAtualizarContato } from './VincularEAtualizarContato';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';

interface CadastroDoLeadProps {
  conversa: { id: string; telefone: string; is_group?: boolean | null; nome_contato?: string | null };
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
  // A segunda camada: quem tem NOME parecido, para o caso do celular pessoal contra o fixo da
  // empresa. Reaproveita a mesma busca já em cache — não custa consulta a mais.
  const { parecidos } = useContatosParecidos(conversa.nome_contato, !conversa.is_group);
  const vincular = useVincularContatoExistente();
  // A terceira camada: procurar à mão. Ver `VincularContatoExistente.tsx` para o caso que a
  // obrigou a existir (o Djair, com três fichas no CRM e nenhuma alcançável pelas duas réguas).
  const [procurando, setProcurando] = useState(false);

  // 🔴 QUEM ESTÁ ESPERANDO CONFERÊNCIA. Nos dois caminhos em que o telefone da ficha É OUTRO
  // (o palpite por nome e a busca à mão), vincular passa pela ficha da pessoa antes: o número
  // do chat vai entrar no cadastro dela, e isso é edição, não só um vínculo. Pedido do dono do
  // produto em 07/09/2026 — ver `VincularEAtualizarContato.tsx`.
  //
  // O caminho do TELEFONE QUE JÁ BATE continua de um clique só: ali não há nada de novo para
  // trazer do chat, e a conferência seria cerimônia vazia no caso mais comum e mais certo.
  const [paraConferir, setParaConferir] = useState<
    { contato: ContatoReconhecido; origem: 'nome' | 'busca' } | null
  >(null);

  const painelDeConferencia = (
    <VincularEAtualizarContato
      aberto={!!paraConferir}
      onFechar={() => setParaConferir(null)}
      conversa={conversa}
      contato={paraConferir?.contato ?? null}
      origem={paraConferir?.origem ?? 'busca'}
    />
  );

  const buscaDeContato = (
    <VincularContatoExistente
      aberto={procurando}
      onFechar={() => setProcurando(false)}
      conversa={conversa}
      onEscolher={(c) => {
        setProcurando(false);
        setParaConferir({ contato: c, origem: 'busca' });
      }}
    />
  );

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
              viraria uma parede em vez de um atalho.

              🔴 MESMO PESO VISUAL DO OUTRO ESTADO, e isto foi um acerto de rota. Em 06/09/2026
              eu acrescentei "Procurar outro contato" aqui como um segundo texto sublinhado ao
              lado do que já existia — e dois sublinhados em sequência viraram uma linha de
              rodapé, enquanto o estado "não achei ninguém" ganhava dois botões sólidos. O dono
              do produto reparou na diferença em 08/09/2026 e preferiu o mais sólido. São as
              MESMAS duas saídas nos dois estados; não havia razão para uma parecer menos.

              Procurar vem antes de cadastrar de propósito: o cadastro repetido é o estrago que
              esta tela evita, e quem chega até aqui já sabe que o telefone não bate com quem
              ele procura. */}
          <p className="mt-3 text-xs text-muted-foreground">
            {/* "essa pessoa" e não "ele/ela": o cadastro não guarda o gênero de
                ninguém, e adivinhar pelo nome erra com quem tem nome ambíguo. */}
            {encontrados.length === 1 ? 'Não é essa pessoa?' : 'Não é nenhum desses?'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setProcurando(true)}
            >
              <Search className="h-3.5 w-3.5" />
              Procurar outro contato
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={onCadastrar}>
              <UserPlus className="h-3.5 w-3.5" />
              Cadastrar como novo
            </Button>
          </div>
        </div>
        <Separator />

        {buscaDeContato}
        {painelDeConferencia}
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
        {/* 🔴 DUAS SAÍDAS, e não uma. Até 06/09/2026 só havia "Cadastrar", e o painel dizia
            "esta pessoa não está no CRM" com a confiança de quem sabe — quando na verdade ele
            só não a RECONHECEU. No caso do Djair havia três fichas dele no cadastro, e o único
            botão oferecido criava a quarta. */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5" onClick={onCadastrar}>
            <UserPlus className="h-3.5 w-3.5" />
            Cadastrar como contato
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setProcurando(true)}
          >
            <Search className="h-3.5 w-3.5" />
            Vincular a um contato existente
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Não achamos pelo número nem pelo nome — mas a pessoa pode estar cadastrada com outro
          telefone, ou sem telefone nenhum. Vale procurar antes de cadastrar de novo.
        </p>
      </div>

      {/* 🔴 SEGUNDA CAMADA: o palpite pelo NOME, e ele tem cara diferente do reconhecimento por
          telefone DE PROPÓSITO. O número que bate é evidência; o nome parecido é chute com 1 erro
          em 3 — e o erro típico aponta um colega da MESMA construtora, que é o mais fácil de
          aceitar sem perceber. Se os dois tivessem o mesmo visual, a pessoa clicaria nos dois com
          a mesma confiança.

          O pedido do dono do produto foi literal: "deixe bem claro e destacado mesmo, para criar
          o hábito na pessoa de revisar o que está cadastrando de forma semi-automática". */}
      {parecidos.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            Confira antes de vincular
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Isto é um palpite pelo <strong>nome</strong>, não pelo número. Erra cerca de 1 vez em
            3, e quando erra costuma apontar um colega da mesma construtora.
          </p>

          <div className="mt-2.5 space-y-2">
            {parecidos.map((c) => (
              <div key={c.id} className="rounded-md border border-border bg-background p-2.5">
                <p className="text-sm font-medium">{c.nome_contato || 'Contato sem nome'}</p>
                {(c.empresa || c.cargo) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.cargo, c.empresa].filter(Boolean).join(' · ')}
                  </p>
                )}

                {/* Os dois números lado a lado são A evidência que deixa a pessoa julgar: "o
                    cadastrado é o fixo da empresa, faz sentido ele falar do celular". Sem isso o
                    aviso é abstrato e ninguém confere nada. */}
                <dl className="mt-2 space-y-0.5 text-xs">
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">no cadastro:</dt>
                    <dd className="font-mono">{c.telefone || '—'}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">falando aqui:</dt>
                    <dd className="font-mono">{telefoneParaCadastro(conversa.telefone)}</dd>
                  </div>
                </dl>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Os números são diferentes. É a mesma pessoa?
                </p>

                {/* Texto diferente do "Vincular" da camada de telefone, de propósito: obriga a
                    ler antes de clicar. */}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 gap-1.5"
                  onClick={() => setParaConferir({ contato: c, origem: 'nome' })}
                >
                  <Link2 className="h-3 w-3" />
                  Sim, é ele — conferir a ficha
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <Separator />

      {buscaDeContato}
      {painelDeConferencia}
    </div>
  );
}
