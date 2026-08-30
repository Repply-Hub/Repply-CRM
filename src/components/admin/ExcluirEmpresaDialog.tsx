import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * A confirmação de excluir uma empresa. Digitar o nome é o que separa o clique do gesto.
 *
 * 🔴 POR QUE DIGITAR, E NÃO SÓ CONFIRMAR. O resto desta tela são ações reversíveis — liberar
 * 7 dias, dar cortesia, bloquear — e todas confirmam com um "Confirmar" comum. Se excluir
 * usasse o mesmo molde, teria a mesma fricção de dar cortesia, no mesmo lugar da tela, com o
 * mesmo gesto. Digitar o nome é o que faz a pessoa PARAR e ler o que está prestes a fazer.
 *
 * É o padrão mais forte que este projeto já tinha (a exclusão em massa de Negócios exige
 * digitar APAGAR), com uma diferença: aqui o texto é o NOME DA EMPRESA, não uma palavra fixa.
 * Palavra fixa vira memória muscular depois da terceira vez; o nome obriga a olhar QUAL
 * empresa está na tela.
 */

interface Numeros {
  usuarios: number;
  clientes: number;
  negocios: number;
  obras: number;
  mensagens: number;
}

interface Props {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  nomeDaEmpresa: string;
  /** O que vai deixar de ser acessível. Vazio enquanto carrega. */
  numeros: Numeros | null;
  /** A empresa tem assinatura ativa no Stripe? Muda o aviso — é dinheiro. */
  temAssinaturaAtiva: boolean;
  aoConfirmar: (motivo: string) => Promise<void>;
}

/** "1.305 clientes" / "1 cliente" — sem "1 clientes". */
function linha(quantos: number, singular: string, plural: string): string | null {
  if (!quantos) return null;
  return `${quantos.toLocaleString('pt-BR')} ${quantos === 1 ? singular : plural}`;
}

export function ExcluirEmpresaDialog({
  aberto,
  onOpenChange,
  nomeDaEmpresa,
  numeros,
  temAssinaturaAtiva,
  aoConfirmar,
}: Props) {
  const [digitado, setDigitado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Compara sem diferenciar caixa nem espaço nas pontas: o objetivo é a pessoa LER o nome,
  // não acertar a digitação de "PR & COCENTINO REPRESENTACOES COMERCIAIS LTDA".
  const confere = digitado.trim().toLocaleLowerCase() === nomeDaEmpresa.trim().toLocaleLowerCase();

  const itens = numeros
    ? [
        linha(numeros.usuarios, 'usuário', 'usuários'),
        linha(numeros.clientes, 'cliente', 'clientes'),
        linha(numeros.obras, 'obra', 'obras'),
        linha(numeros.negocios, 'negócio', 'negócios'),
        linha(numeros.mensagens, 'mensagem de WhatsApp', 'mensagens de WhatsApp'),
      ].filter(Boolean)
    : [];

  const fechar = (v: boolean) => {
    if (!v) {
      setDigitado('');
      setMotivo('');
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <ConteudoDialogo className="sm:max-w-lg">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
            Excluir {nomeDaEmpresa}?
          </DialogTitle>
          <DialogDescription>
            A empresa some do sistema e ninguém dela consegue mais entrar.
          </DialogDescription>
        </CabecalhoDialogo>

        <CorpoDialogo className="space-y-4">
          {/* 🔴 OS NÚMEROS ANTES DO BOTÃO. "Excluir empresa" é abstrato; "1.305 clientes e
              11.910 negócios" é o que faz alguém reconsiderar a empresa errada. */}
          {itens.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="mb-2 text-sm font-medium text-foreground">Deixa de ser acessível:</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {itens.map((item) => (
                  <li key={item} className="font-mono tabular-nums">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 🔴 A PROMESSA QUE PRECISA SER LITERAL, e é: nada é apagado hoje. */}
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium text-foreground">Nada é apagado agora.</p>
            <p className="mt-1 text-muted-foreground">
              Os dados ficam guardados por <strong>60 dias</strong>, e você pode restaurar a
              empresa a qualquer momento nesse prazo. Depois disso ela aparece aqui para vocês
              confirmarem a exclusão definitiva.
            </p>
          </div>

          {temAssinaturaAtiva && (
            // A única coisa irreversível de hoje. Precisa estar dita antes, não descoberta
            // depois de restaurar e ver que a cobrança não voltou.
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="font-medium text-foreground">A assinatura será cancelada agora.</p>
              <p className="mt-1 text-muted-foreground">
                É a única parte que não volta com o restaurar — se você restaurar depois, a
                assinatura precisa ser refeita. Cancelamos na hora para não cobrar quem perdeu o
                acesso.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="motivo-exclusao" className="text-xs text-muted-foreground">
              Motivo (opcional, fica só para vocês)
            </Label>
            <Input
              id="motivo-exclusao"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: empresa de teste, cliente encerrou contrato"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirma-nome" className="text-sm">
              Digite <span className="font-semibold text-foreground">{nomeDaEmpresa}</span> para
              liberar
            </Label>
            <Input
              id="confirma-nome"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              autoComplete="off"
              // Sem foco automático: o campo é a última coisa a fazer, não a primeira. Focar
              // aqui convidaria a digitar antes de ler os números acima.
            />
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Button variant="ghost" onClick={() => fechar(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!confere || enviando}
            onClick={async () => {
              setEnviando(true);
              try {
                await aoConfirmar(motivo.trim());
                fechar(false);
              } finally {
                setEnviando(false);
              }
            }}
          >
            {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Excluir empresa
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
