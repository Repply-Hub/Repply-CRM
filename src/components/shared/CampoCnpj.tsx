import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';
import {
  maskCnpj,
  maskCpfOuCnpj,
  unmaskCnpj,
  consultarCnpj,
  classificarDocumento,
  mensagemDoDocumento,
  resultadoPermiteSalvar,
  type CnpjData,
  type ResultadoDoDocumento,
  type SeNaoExistir,
} from '@/lib/cnpj';
import { toast } from 'sonner';

export interface CampoCnpjProps {
  /** O valor COM máscara. Quem chama guarda a máscara; tirar os pontos é na hora de salvar. */
  value: string;
  onChange: (comMascara: string) => void;
  /**
   * Chamado quando a consulta acha a empresa. Cada tela decide o que fazer com os dados — o
   * componente NÃO preenche nada sozinho, porque o que preencher muda de tela para tela.
   */
  onDadosEncontrados?: (dados: CnpjData) => void;
  /** Avisado a cada conferência que termina (ao sair do campo ou pelo `conferir`). */
  onResultado?: (resultado: ResultadoDoDocumento) => void;
  /** Modo "CPF ou CNPJ" dos cadastros de cliente: decide pelos dígitos, nunca pelo tipo. */
  aceitaCpf?: boolean;
  /** Quando a Receita CONFIRMA que o CNPJ não existe: fábrica bloqueia, o resto avisa. */
  seNaoExistir?: SeNaoExistir;
  /** O documento como está no banco. Enquanto o campo tiver o mesmo número, nada é conferido. */
  valorJaGravado?: string | null;
  label?: string;
  obrigatorio?: boolean;
  /** Mensagem de erro vinda da validação do formulário; tem prioridade sobre a do campo. */
  erro?: string;
  /** Frase de ajuda abaixo do campo, quando não há nada a avisar. */
  descricao?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}

export interface CampoCnpjHandle {
  /**
   * Confere o valor atual e devolve o resultado. Reaproveita a conferência do mesmo número — e,
   * se a consulta daquele número ainda está rodando (a pessoa saiu do campo e clicou em Salvar),
   * espera por ELA em vez de disparar outra.
   */
  conferir: () => Promise<ResultadoDoDocumento>;
}

/**
 * O campo de documento do sistema: máscara, dígito verificador e consulta à Receita.
 *
 * 🔴 É O ÚNICO LUGAR QUE CHAMA `consultarCnpj` (`src/test/uma-consulta-de-cnpj-so.test.ts`).
 * Até 11/09/2026 havia três consultas independentes — esta, a de Clientes e a de Fabricantes —,
 * cada uma com a sua frase fixa de "não encontrado". É o cenário do conserto no arquivo errado
 * (CLAUDE.md §7.14): consertar uma não consertava as outras.
 *
 * A regra de cada tela entra por propriedade, nunca por cópia:
 * - `aceitaCpf` — cadastros de cliente. 11 dígitos é CPF (só dígito verificador: CPF não tem
 *   consulta pública), 14 é CNPJ (dígito e Receita).
 * - `seNaoExistir` — fábrica bloqueia CNPJ que a Receita confirma não existir; cliente e obra
 *   avisam e seguem. Serviço fora ou lento nunca bloqueia ninguém.
 * - `valorJaGravado` — cadastro antigo não trava por causa de documento que ninguém mexeu.
 *
 * A consulta dispara ao SAIR do campo, não a cada tecla: menos consultas repetidas ao BrasilAPI,
 * que não tem chave e recusa quem pergunta demais.
 *
 * Duas guardas contra resposta atrasada (o prazo é de 10 s): se o campo saiu da tela, o resultado
 * é descartado; se a pessoa mudou o número enquanto a Receita respondia, o resultado do número
 * velho não é mostrado nem preenche nada.
 */
export const CampoCnpj = forwardRef<CampoCnpjHandle, CampoCnpjProps>(function CampoCnpj(
  {
    value,
    onChange,
    onDadosEncontrados,
    onResultado,
    aceitaCpf = false,
    seNaoExistir = 'avisar',
    valorJaGravado,
    label,
    obrigatorio = false,
    erro,
    descricao,
    disabled,
    autoFocus,
    id,
  },
  ref,
) {
  const [resultado, setResultado] = useState<ResultadoDoDocumento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const montadoRef = useRef(true);
  // Refs com o valor e os retornos MAIS RECENTES: a consulta termina renders depois de começar.
  const valorRef = useRef(value);
  valorRef.current = value;
  const onDadosRef = useRef(onDadosEncontrados);
  onDadosRef.current = onDadosEncontrados;
  const onResultadoRef = useRef(onResultado);
  onResultadoRef.current = onResultado;
  const ultimaRef = useRef<{ digitos: string; resultado: ResultadoDoDocumento } | null>(null);
  const emAndamentoRef = useRef<{ digitos: string; promessa: Promise<ResultadoDoDocumento> } | null>(null);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  /** Mostra o resultado, se o campo ainda está na tela e ainda tem o mesmo número. */
  function mostrar(digitos: string, final: ResultadoDoDocumento): boolean {
    if (!montadoRef.current) return false;
    if (unmaskCnpj(valorRef.current) !== digitos) return false;
    setResultado(final);
    onResultadoRef.current?.(final);
    return true;
  }

  async function executar(digitos: string): Promise<ResultadoDoDocumento> {
    const classe = classificarDocumento(digitos, { aceitaCpf, valorJaGravado });
    let final: ResultadoDoDocumento;
    let dados: CnpjData | null = null;
    if (classe === 'cnpj') {
      if (montadoRef.current) setCarregando(true);
      const consulta = await consultarCnpj(digitos);
      final = consulta.caso;
      if (consulta.caso === 'encontrado') dados = consulta.dados;
      if (montadoRef.current) setCarregando(false);
    } else {
      final = classe;
    }
    ultimaRef.current = { digitos, resultado: final };
    if (mostrar(digitos, final) && dados) {
      onDadosRef.current?.(dados);
      toast.success('CNPJ encontrado na Receita Federal');
    }
    return final;
  }

  function conferir(): Promise<ResultadoDoDocumento> {
    const digitos = unmaskCnpj(valorRef.current);
    const ultima = ultimaRef.current;
    if (ultima && ultima.digitos === digitos) {
      mostrar(digitos, ultima.resultado);
      return Promise.resolve(ultima.resultado);
    }
    const andamento = emAndamentoRef.current;
    if (andamento && andamento.digitos === digitos) return andamento.promessa;
    const promessa = executar(digitos);
    emAndamentoRef.current = { digitos, promessa };
    return promessa;
  }

  useImperativeHandle(ref, () => ({ conferir }));

  const mensagem = resultado ? mensagemDoDocumento(resultado, { seNaoExistir, aceitaCpf }) : null;
  // A decisão de bloquear não é reescrita aqui: vem da função canônica `resultadoPermiteSalvar`.
  // Se a regra mudar, muda num lugar só, e todas as telas respeitam. Ver CLAUDE.md §7.13.
  const bloqueado = resultado === 'nao_existe' && !resultadoPermiteSalvar(resultado, seNaoExistir);
  const conferido = resultado === 'encontrado' || resultado === 'cpf';
  const borda =
    erro || mensagem?.tom === 'erro'
      ? 'border-destructive'
      : mensagem?.tom === 'aviso'
        ? 'border-amber-500'
        : conferido
          ? 'border-green-500'
          : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label ?? (aceitaCpf ? 'CPF ou CNPJ' : 'CNPJ')}
        {obrigatorio && ' *'}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          inputMode="numeric"
          placeholder={aceitaCpf ? '000.000.000-00 ou 00.000.000/0000-00' : '00.000.000/0000-00'}
          onChange={(e) => {
            onChange(aceitaCpf ? maskCpfOuCnpj(e.target.value) : maskCnpj(e.target.value));
            setResultado(null);
          }}
          onBlur={() => {
            void conferir();
          }}
          className={borda}
        />
        {carregando && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {!carregando && conferido && (
          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
        )}
      </div>
      {erro ? (
        <p className="text-xs text-destructive">{erro}</p>
      ) : mensagem ? (
        <div className="space-y-1">
          <p
            role={mensagem.tom === 'erro' ? 'alert' : 'status'}
            className={mensagem.tom === 'erro' ? 'text-xs text-destructive' : 'text-xs text-amber-600 dark:text-amber-400'}
          >
            {mensagem.texto}
          </p>
          {bloqueado && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => {
                onChange('');
                setResultado(null);
              }}
            >
              Cadastrar sem CNPJ
            </Button>
          )}
        </div>
      ) : descricao ? (
        <p className="text-xs text-muted-foreground">{descricao}</p>
      ) : null}
    </div>
  );
});
