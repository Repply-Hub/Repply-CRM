import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  SEPARADOR_DE_TELEFONES,
  separarTelefones,
  juntarTelefones,
  limitarTelefoneDigitado,
  formatarTelefoneGuardado,
} from '@/lib/telefones-do-campo';

export interface CampoTelefonesProps {
  /** O texto como está no banco: a lista separada por vírgula. */
  value: string | null | undefined;
  /** Devolve o texto para o banco, já juntado com ", ". Só é chamado quando a pessoa mexe. */
  onChange: (valorParaOBanco: string) => void;
  /** Vai no PRIMEIRO campo: é para ele que um `<Label htmlFor>` de fora aponta. */
  id?: string;
  obrigatorio?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Classe de cada campo, para as telas de campo compacto (`h-8 text-sm`). */
  className?: string;
}

function partesDoValor(valor: string | null | undefined): string[] {
  const partes = separarTelefones(valor).map(formatarTelefoneGuardado);
  return partes.length > 0 ? partes : [''];
}

/**
 * Colar um número por cima de um campo já preenchido (ex.: `5584988887777` sobre
 * `(84) 99999-8888`) é o caso que `limitarTelefoneDigitado` recusa por falta de evidência de
 * código de país — 906 números da base estão gravados assim. Sem este aviso, o campo
 * simplesmente não mudava e a pessoa salvava o número velho sem perceber.
 */
const AVISO_COLAR_SOBRE_NUMERO =
  'Este campo aceita um número por vez. Para colar outro, apague o que está aqui; para código de país, comece com +.';

/**
 * Telefone de cadastro: um campo por número, "+ outro telefone" abaixo, e um × em cada campo extra.
 *
 * Quem usa não precisa saber que ele se divide: recebe e devolve o texto do banco, a mesma lista
 * separada por vírgula de sempre. 148 cadastros têm mais de um número no mesmo campo, e a máscara
 * de um número só, aplicada à lista inteira, apagava o segundo (medido em 11/09/2026).
 *
 * Enquanto se digita, o texto fica como a pessoa escreveu e só o 12º dígito é barrado; a
 * formatação é ao SAIR do campo (CLAUDE.md §7.10). Número estrangeiro, identificador de grupo do
 * WhatsApp e texto que não é telefone passam intactos.
 */
export function CampoTelefones({
  value,
  onChange,
  id,
  obrigatorio,
  placeholder = '(00) 00000-0000',
  disabled,
  className,
}: CampoTelefonesProps) {
  const [partes, setPartes] = useState<string[]>(() => partesDoValor(value));
  const ultimoEmitidoRef = useRef<string | null>(null);
  const camposRef = useRef<(HTMLInputElement | null)[]>([]);
  const [focar, setFocar] = useState<number | null>(null);
  // Índice do campo que está mostrando o aviso de colagem recusada. Só um por vez.
  const [recusado, setRecusado] = useState<number | null>(null);

  // Mudança que veio de FORA (o formulário limpou, a consulta de CNPJ preencheu o telefone):
  // redesenha os campos. A que nasceu aqui dentro volta igual ao que foi emitido e é ignorada —
  // senão o campo vazio recém-aberto por "+ outro telefone" sumiria na hora.
  useEffect(() => {
    if ((value ?? '') === ultimoEmitidoRef.current) return;
    setPartes(partesDoValor(value));
    setRecusado(null);
  }, [value]);

  useEffect(() => {
    if (focar === null) return;
    camposRef.current[focar]?.focus();
    setFocar(null);
  }, [focar, partes.length]);

  function atualizar(novas: string[]) {
    setPartes(novas);
    const valor = juntarTelefones(novas);
    if (valor === juntarTelefones(partes)) return; // nada mudou para o banco
    ultimoEmitidoRef.current = valor;
    onChange(valor);
  }

  function aoDigitar(indice: number, texto: string) {
    // Colou vários números, ou digitou a vírgula: cada número ganha o seu campo.
    if (SEPARADOR_DE_TELEFONES.test(texto)) {
      if (recusado === indice) setRecusado(null);
      const pedacos = texto.split(SEPARADOR_DE_TELEFONES).map((p) => p.trim());
      const cheios = pedacos.filter(Boolean).map(formatarTelefoneGuardado);
      if (cheios.length === 0) return;
      const abreOProximo = pedacos[pedacos.length - 1] === '';
      const novas = [...partes];
      novas.splice(indice, 1, ...cheios, ...(abreOProximo ? [''] : []));
      if (abreOProximo) setFocar(indice + cheios.length);
      atualizar(novas);
      return;
    }
    const limitado = limitarTelefoneDigitado(texto, partes[indice]);
    if (limitado !== texto) {
      // Colar um número por cima de outro já preenchido: `limitarTelefoneDigitado` recusou por
      // falta de evidência de código de país, e sem aviso a pessoa salvaria o número velho sem
      // perceber (ver o comentário de `AVISO_COLAR_SOBRE_NUMERO`, acima).
      setRecusado(indice);
      return;
    }
    if (recusado === indice) setRecusado(null);
    const novas = [...partes];
    novas[indice] = limitado;
    atualizar(novas);
  }

  function aoSair(indice: number) {
    if (recusado === indice) setRecusado(null);
    const formatado = formatarTelefoneGuardado(partes[indice]);
    if (formatado === partes[indice]) return;
    const novas = [...partes];
    novas[indice] = formatado;
    atualizar(novas);
  }

  function adicionar() {
    setFocar(partes.length);
    setPartes([...partes, '']);
  }

  function remover(indice: number) {
    const novas = partes.filter((_, i) => i !== indice);
    setRecusado((atual) => {
      if (atual === null || atual === indice) return null;
      return atual > indice ? atual - 1 : atual;
    });
    atualizar(novas.length > 0 ? novas : ['']);
  }

  return (
    <div className="space-y-2">
      {partes.map((parte, i) => (
        <div key={i}>
          <div className="flex items-center gap-2">
            <Input
              ref={(el) => {
                camposRef.current[i] = el;
              }}
              id={i === 0 ? id : undefined}
              value={parte}
              onChange={(e) => aoDigitar(i, e.target.value)}
              onBlur={() => aoSair(i)}
              inputMode="tel"
              placeholder={i === 0 ? placeholder : 'Outro telefone'}
              required={i === 0 && obrigatorio}
              disabled={disabled}
              aria-label={i === 0 ? undefined : `Telefone ${i + 1}`}
              className={cn('flex-1', className)}
            />
            {i > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => remover(i)}
                disabled={disabled}
                aria-label={`Tirar o telefone ${i + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {recusado === i && (
            <p role="status" className="mt-1 text-xs text-destructive">
              {AVISO_COLAR_SOBRE_NUMERO}
            </p>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={adicionar}
        disabled={disabled}
      >
        + outro telefone
      </Button>
    </div>
  );
}
