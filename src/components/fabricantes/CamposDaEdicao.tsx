import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { anosDeEdicao } from './anos-de-edicao';
import { MESES, ANO_INTEIRO } from './mes-da-edicao';

/**
 * Os três campos que descrevem um material do drive: nome, mês e ano da edição.
 *
 * Vive num arquivo próprio porque ANEXAR e EDITAR fazem a mesma pergunta, e é a ordem
 * (`edicao_ano`, `edicao_mes`) que decide qual catálogo aparece primeiro na prateleira. Se as
 * duas telas divergissem — uma com seletor de ano, a outra com campo digitado —, a correção
 * poderia introduzir o erro que ela existe para consertar.
 */

interface Props {
  nome: string;
  aoMudarNome: (v: string) => void;
  /** O ano como o Select fala: texto. Vira número só na hora de gravar. */
  ano: string;
  aoMudarAno: (v: string) => void;
  mes: string;
  aoMudarMes: (v: string) => void;
  desabilitado?: boolean;
}

export function CamposDaEdicao({
  nome, aoMudarNome, ano, aoMudarAno, mes, aoMudarMes, desabilitado,
}: Props) {
  // O ano escolhido entra na lista mesmo quando é mais velho que a faixa: um material de 2014
  // abriria com o seletor em branco, e salvar em seguida trocaria a edição sem ninguém pedir.
  const anos = useMemo(
    () => anosDeEdicao(new Date().getFullYear(), Number.parseInt(ano, 10)),
    [ano],
  );

  return (
    <>
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input
          value={nome} onChange={(e) => aoMudarNome(e.target.value)} disabled={desabilitado}
          placeholder="Como aparece no cartão"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Mês da edição</Label>
          {/* Opcional de propósito: há fábrica que faz catálogo anual, e obrigá-la a
              inventar um mês criaria uma data que ninguém consegue justificar. */}
          <Select value={mes} onValueChange={aoMudarMes} disabled={desabilitado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANO_INTEIRO}>O ano inteiro</SelectItem>
              {MESES.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Ano</Label>
          {/* Seletor, não campo digitado: um ano teclado errado passa pela restrição do banco
              e empurra a edição vigente para baixo na prateleira. A faixa e o porquê dela
              estão em `anos-de-edicao.ts`. */}
          <Select value={ano} onValueChange={aoMudarAno} disabled={desabilitado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
