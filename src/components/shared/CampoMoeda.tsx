import * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  formatarDigitacaoMoeda,
  normalizarSeparadoresMoeda,
  numeroParaCampoMoeda,
  parseMoedaBRL,
} from '@/lib/moeda';

/**
 * Campo de dinheiro com máscara brasileira: milhar com ponto, decimal com
 * vírgula, "R$" dentro do campo.
 *
 * Guarda TEXTO enquanto se digita, mas entrega ao pai um NÚMERO puro — então
 * nada muda no banco, nos painéis, nos relatórios nem no PDF. O que muda é o
 * que a pessoa enxerga enquanto digita.
 *
 * Uso:
 *   const [valor, setValor] = useState<number | null>(null);
 *   <CampoMoeda value={valor} onChange={setValor} />
 *
 * Sem o "R$" e com três casas (quantidade em metro quadrado, quilo):
 *   <CampoMoeda comPrefixo={false} casasDecimais={3} value={qtd} onChange={setQtd} />
 */
export interface CampoMoedaProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /** Valor em número puro — é isto que vai para o banco. `null` = campo vazio. */
  value: number | null;
  /** Chamado quando o número muda, já convertido (`null` quando o campo fica vazio). */
  onChange?: (valor: number | null) => void;
  /**
   * Apelido de `onChange`. Existe porque o laudo da auditoria batizou a
   * propriedade assim; os dois funcionam, prefira `onChange`.
   */
  onValueChange?: (valor: number | null) => void;
  /** Mostra o "R$" dentro do campo. Ligado por padrão. */
  comPrefixo?: boolean;
  /** 2 para dinheiro (padrão); 3 para quantidade (`itens_pedido.quantidade` é numeric(10,3)). */
  casasDecimais?: number;
  /** Desligado por padrão: nenhum campo de dinheiro do sistema aceita negativo. */
  permitirNegativo?: boolean;
  /** Classe da caixa que envolve o campo quando há prefixo (o `<div className="relative">`). */
  classNameContainer?: string;
}

/**
 * Onde o cursor deve ficar depois que a máscara reescreve o texto.
 *
 * A âncora é a contagem de DÍGITOS, não a posição no texto: o ponto de milhar
 * entra e sai sozinho a cada tecla, mas a quantidade de dígitos à esquerda do
 * cursor não muda. Sem isso, editar o meio de "1.234.567" joga o cursor para o
 * fim a cada tecla — defeito que o campo de meta tem hoje e que faz o usuário
 * desistir e redigitar tudo (e redigitar é onde o erro nasce).
 */
function posicaoDoCursor(bruto: string, posicaoNoBruto: number, formatado: string): number {
  // Nenhum dígito à direita: o cursor estava no fim. Vai para o fim do texto
  // formatado, e não para antes da vírgula recém-digitada.
  const digitosDepois = bruto.slice(posicaoNoBruto).replace(/\D/g, '').length;
  if (digitosDepois === 0) return formatado.length;

  const digitosAntes = bruto.slice(0, posicaoNoBruto).replace(/\D/g, '').length;
  if (digitosAntes === 0) return formatado.startsWith('-') ? 1 : 0;

  let contados = 0;
  for (let i = 0; i < formatado.length; i++) {
    if (/\d/.test(formatado[i])) {
      contados++;
      if (contados === digitosAntes) return i + 1;
    }
  }
  return formatado.length;
}

export const CampoMoeda = React.forwardRef<HTMLInputElement, CampoMoedaProps>(function CampoMoeda(
  {
    value,
    onChange,
    onValueChange,
    comPrefixo = true,
    casasDecimais = 2,
    permitirNegativo = false,
    className,
    classNameContainer,
    onKeyDown,
    onPaste,
    ...props
  },
  ref,
) {
  // O campo guarda TEXTO enquanto se digita. Sem isso, a vírgula recém-digitada
  // ("1.234,") sumiria embaixo do dedo de quem está escrevendo, porque como
  // número ela ainda não significa nada.
  const [texto, setTexto] = React.useState(() => numeroParaCampoMoeda(value, casasDecimais));
  const interno = React.useRef<HTMLInputElement | null>(null);
  const cursorPendente = React.useRef<number | null>(null);

  function avisar(valor: number | null) {
    onChange?.(valor);
    onValueChange?.(valor);
    if (import.meta.env.DEV && !onChange && !onValueChange) {
      console.warn('[CampoMoeda] sem `onChange`: o que o usuário digitar não vai para lugar nenhum.');
    }
  }

  // Só reescreve o texto quando o valor que vem de fora for DIFERENTE do que
  // está digitado. Comparar número com número (e não texto com texto) é o que
  // impede o campo de brigar com quem está digitando: "1.234," e "1.234" valem
  // o mesmo número, e o campo precisa deixar a vírgula em paz.
  React.useEffect(() => {
    // CAMPO VAZIO + valor 0 vindo de fora NÃO é divergência.
    // Campo vazio entrega `null` ao pai, mas há tela que converte esse `null`
    // em zero antes de guardar (o preço unitário do item do pedido faz isso).
    // O zero volta, bate contra `parseMoedaBRL('') === null`, e sem esta linha o
    // efeito reescreveria o campo como "0" e jogaria o cursor para o fim — no
    // meio da digitação de quem só queria trocar o número. Vazio e zero são a
    // mesma intenção do usuário neste instante; brigar com quem está digitando
    // é pior que a diferença.
    //
    // A troca consciente: se o pai definir 0 vindo de OUTRO lugar (limpar
    // formulário, resposta do servidor) enquanto o campo estiver vazio, o "0"
    // não aparece sozinho — o campo fica vazio, que vale o mesmo número.
    const campoVazio = texto === '';
    if (campoVazio && value === 0) return;

    if (parseMoedaBRL(texto, casasDecimais, permitirNegativo) !== value) {
      setTexto(numeroParaCampoMoeda(value, casasDecimais));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Recoloca o cursor depois que o React repintou.
  React.useLayoutEffect(() => {
    if (cursorPendente.current !== null && interno.current) {
      interno.current.setSelectionRange(cursorPendente.current, cursorPendente.current);
      cursorPendente.current = null;
    }
  });

  function aplicar(bruto: string, posicaoNoBruto: number) {
    const formatado = formatarDigitacaoMoeda(bruto, casasDecimais, permitirNegativo);
    const novaPosicao = posicaoDoCursor(bruto, posicaoNoBruto, formatado);
    const numero = parseMoedaBRL(formatado, casasDecimais, permitirNegativo);

    cursorPendente.current = novaPosicao;
    setTexto(formatado);
    if (numero !== value) avisar(numero);

    // Quando o texto formatado é IGUAL ao que já estava (a pessoa digitou uma
    // letra, um sinal de menos, um segundo ponto), o React pode não repintar — e
    // aí o caractere recusado ficaria visível no campo. Corrige na mão.
    const campo = interno.current;
    if (campo && formatado === texto && campo.value !== formatado) {
      campo.value = formatado;
      campo.setSelectionRange(novaPosicao, novaPosicao);
      cursorPendente.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const campo = e.currentTarget;
    const ini = campo.selectionStart ?? campo.value.length;
    const fim = campo.selectionEnd ?? ini;
    // Com Ctrl/Alt/Cmd a tecla é atalho do navegador (apagar palavra, por
    // exemplo); não é digitação e não pode ser sequestrada aqui.
    const atalho = e.ctrlKey || e.altKey || e.metaKey;

    // Num campo de dinheiro o ponto só pode significar vírgula — o ponto de
    // milhar quem põe é o programa. É isto que faz "99888.47" virar 99.888,47
    // em vez de 9.988.847. Vale também para o ponto do teclado numérico.
    if (e.key === '.' && !atalho) {
      e.preventDefault();
      aplicar(`${campo.value.slice(0, ini)},${campo.value.slice(fim)}`, ini + 1);
      return;
    }

    // Apagar em cima de um ponto de milhar tem que apagar o dígito antes dele.
    // Sem isto a tecla parece não funcionar: o ponto some e volta na mesma hora,
    // porque quem o coloca é a máscara.
    if (e.key === 'Backspace' && !atalho && ini === fim && ini >= 2 && campo.value[ini - 1] === '.') {
      e.preventDefault();
      aplicar(`${campo.value.slice(0, ini - 2)}${campo.value.slice(ini)}`, ini - 2);
      return;
    }

    onKeyDown?.(e);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const colado = e.clipboardData?.getData('text') ?? '';
    if (!colado) return;

    e.preventDefault();
    const campo = e.currentTarget;
    const ini = campo.selectionStart ?? campo.value.length;
    const fim = campo.selectionEnd ?? ini;

    // Texto colado vem de fora (planilha, e-mail, WhatsApp) e pode estar em
    // qualquer padrão: "R$ 1.234,56", "1234.56" ou "1,234.56". Aqui — e só aqui —
    // o ponto pode significar centavo, então a decisão é de outra função.
    const pedaco = normalizarSeparadoresMoeda(colado, casasDecimais);
    aplicar(`${campo.value.slice(0, ini)}${pedaco}${campo.value.slice(fim)}`, ini + pedaco.length);
    onPaste?.(e);
  }

  const campoInput = (
    <Input
      {...props}
      ref={(node) => {
        interno.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }}
      // ATENÇÃO: type="text", NUNCA type="number".
      // 1. Campo de número descarta "99.888,47" e devolve string VAZIA, sem erro
      //    nenhum — o campo se apagaria sozinho a cada tecla e gravaria zero.
      // 2. Em type="number" a RODA DO MOUSE altera o valor sozinha quando o
      //    cursor está por cima, e as setas do teclado também. É a causa provável
      //    dos valores absurdos que apareceram em produção. Em type="text" isso
      //    simplesmente não existe — não é preciso nenhum onWheel. Se alguém
      //    "melhorar" isto de volta para number, o defeito volta junto.
      // 3. inputMode="decimal" é o que mantém o teclado numérico no celular.
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={props.placeholder ?? '0,00'}
      className={cn(comPrefixo && 'pl-9', className)}
      value={texto}
      onChange={(e) => aplicar(e.target.value, e.target.selectionStart ?? e.target.value.length)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );

  // Sem prefixo o campo é devolvido cru, sem caixa em volta: em célula de tabela
  // uma <div> a mais atrapalha o alinhamento.
  if (!comPrefixo) return campoInput;

  return (
    <div className={cn('relative', classNameContainer)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
        R$
      </span>
      {campoInput}
    </div>
  );
});
