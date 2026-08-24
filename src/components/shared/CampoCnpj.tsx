import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { maskCnpj, unmaskCnpj, isValidCnpjDigits, fetchCnpjData, type CnpjData } from '@/lib/cnpj';
import { toast } from 'sonner';

type Estado = 'idle' | 'loading' | 'valid' | 'invalid';

export interface CampoCnpjProps {
  /** O valor COM máscara. Quem chama guarda a máscara; tirar os pontos é na hora de salvar. */
  value: string;
  onChange: (comMascara: string) => void;
  /**
   * Chamado quando a consulta acha a empresa. Cada tela decide o que fazer com os dados —
   * o componente NÃO preenche nada sozinho, porque o que preencher muda de tela para tela.
   */
  onDadosEncontrados?: (dados: CnpjData) => void;
  label?: string;
  obrigatorio?: boolean;
  /** Mensagem de erro vinda da validação do formulário, mostrada abaixo do campo. */
  erro?: string;
  /** Frase de ajuda abaixo do campo. */
  descricao?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Campo de CNPJ com máscara, validação de dígito e consulta automática à Receita.
 *
 * Extraído da versão de **Fabricantes** (`Fabricantes.tsx:159-181`), e não da de Clientes,
 * por causa de UMA linha: a guarda contra resposta atrasada. A consulta tem prazo de 10
 * segundos; sem a guarda, fechar e reabrir o formulário dentro desse tempo faz a resposta do
 * CNPJ ANTIGO preencher o formulário NOVO. Aqui a guarda é o `montadoRef`: se este campo já
 * saiu da tela, o resultado é descartado em silêncio.
 *
 * A consulta bate direto na BrasilAPI, do navegador, sem chave e sem função de servidor
 * (`src/lib/cnpj.ts:60`). Não há nada a provisionar — mas também não há freio de volume.
 * Por isso a consulta dispara ao SAIR do campo, e não a cada tecla: a tela de Clientes
 * dispara ao completar 14 dígitos, o que consulta de novo a cada correção de digitação.
 *
 * Este componente é usado primeiro só em Obras. As telas de Cliente e Fabricante continuam
 * com suas cópias por enquanto — trocá-las mexe em cadastro que está em produção com
 * cliente pagante, e merece commit próprio.
 */
export function CampoCnpj({
  value,
  onChange,
  onDadosEncontrados,
  label = 'CNPJ',
  obrigatorio = false,
  erro,
  descricao,
  disabled,
  autoFocus,
}: CampoCnpjProps) {
  const [estado, setEstado] = useState<Estado>('idle');
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  async function consultar() {
    const digitos = unmaskCnpj(value);

    // Campo vazio é estado válido: nem toda obra é uma SPE com CNPJ próprio.
    if (digitos.length === 0) {
      setEstado('idle');
      return;
    }
    if (digitos.length !== 14) return; // ainda digitando

    if (!isValidCnpjDigits(digitos)) {
      setEstado('invalid');
      toast.error('CNPJ inválido');
      return;
    }

    setEstado('loading');
    try {
      const dados = await fetchCnpjData(digitos);
      if (!montadoRef.current) return; // o formulário fechou enquanto a consulta rodava
      setEstado('valid');
      onDadosEncontrados?.(dados);
      toast.success('CNPJ encontrado na Receita Federal');
    } catch (e: unknown) {
      if (!montadoRef.current) return;
      setEstado('invalid');
      // As telas antigas engolem o erro e dizem sempre "CNPJ não encontrado" — então
      // internet ruim e empresa inexistente aparecem iguais. Aqui a mensagem do prazo
      // esgotado (montada em `cnpj.ts:67`) chega até a pessoa.
      toast.error(e instanceof Error && e.message ? e.message : 'CNPJ não encontrado');
    }
  }

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {obrigatorio && ' *'}
      </Label>
      <div className="relative">
        <Input
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          onChange={(e) => {
            onChange(maskCnpj(e.target.value));
            setEstado('idle');
          }}
          onBlur={consultar}
          className={
            erro || estado === 'invalid'
              ? 'border-destructive'
              : estado === 'valid'
                ? 'border-green-500'
                : undefined
          }
        />
        {estado === 'loading' && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {estado === 'valid' && (
          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
        )}
      </div>
      {erro ? (
        <p className="text-xs text-destructive">{erro}</p>
      ) : descricao ? (
        <p className="text-xs text-muted-foreground">{descricao}</p>
      ) : null}
    </div>
  );
}
