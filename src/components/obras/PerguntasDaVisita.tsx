/**
 * As perguntas da visita concluída — fase da obra, concorrente visto, com quem falou, próximo
 * passo e o texto livre de hoje, agora rotulado "Mais alguma coisa?".
 *
 * 🔴 POR QUE NENHUMA PERGUNTA É OBRIGATÓRIA. Até 12/09/2026 havia UMA pergunta aberta ("O que
 * você viu nesta obra?"), e das 6 visitas marcadas como realizadas só 2 tinham texto — pergunta
 * aberta já é fácil de pular sozinha. Tornar as cinco perguntas novas obrigatórias pioraria o
 * mesmo problema: quem está com pressa, ainda no canteiro, ficaria TRANCADO na tela sem
 * conseguir nem marcar a visita como realizada. Decisão 8 do desenho de 12/09/2026
 * (`docs/superpowers/specs/2026-09-12-rota-de-visita-ordem-e-analise-design.md`).
 *
 * 🔴 POR QUE ESTE COMPONENTE É UM SÓ. As perguntas aparecem nos DOIS lugares em que se marca
 * uma visita como realizada — o painel de visitas (`VisitasObrasPainel.tsx`) e a janela da rota
 * (`NovaRotaVisitaDialog.tsx`). Duas cópias divergiriam na primeira mudança de rótulo ou de
 * regra, do mesmo jeito que o extinto "Status Inicial" da obra viveu duplicado — com uma cópia
 * lendo a lista configurável e a outra com quatro opções cravadas — até virar
 * `SeletorMarcadorObra` (ver o comentário lá).
 *
 * Controlado, sem estado próprio: `valor` é a verdade e `onChange` recebe sempre o objeto
 * inteiro. Quem usa decide o que fazer com o rascunho (guardar em `useState`, descartar ao
 * cancelar) — este componente só traduz toque em pergunta respondida.
 */
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FASES_DA_OBRA, type RespostasDaVisita } from '@/lib/analise-da-visita';
import { useContatosDoCliente } from '@/hooks/use-obra-contatos';

/**
 * O `<Select>` do Radix não aceita item com valor vazio (`SeletorMarcadorObra.tsx` documenta o
 * mesmo problema) — "não informar" precisa de um valor de mentirinha só para a tela. Ele nunca
 * chega ao banco: o `onValueChange` abaixo já traduz de volta para string vazia.
 */
const NAO_INFORMAR = '__nao_informar__';

export interface PerguntasDaVisitaProps {
  valor: RespostasDaVisita;
  onChange: (v: RespostasDaVisita) => void;
  /** De quem são os contatos oferecidos em "Com quem você falou" (`useContatosDoCliente`). */
  clienteId?: string | null;
  clienteEmpresa?: string | null;
  disabled?: boolean;
}

export function PerguntasDaVisita({
  valor,
  onChange,
  clienteId,
  clienteEmpresa,
  disabled,
}: PerguntasDaVisitaProps) {
  const { data: contatos = [] } = useContatosDoCliente(clienteId, clienteEmpresa);

  const atualizar = (patch: Partial<RespostasDaVisita>) => onChange({ ...valor, ...patch });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Em que fase está a obra?</Label>
        <div className="flex flex-wrap gap-1.5">
          {FASES_DA_OBRA.map((f) => (
            <Button
              key={f.chave}
              type="button"
              size="sm"
              variant={valor.fase === f.chave ? 'default' : 'outline'}
              disabled={disabled}
              className="h-7 text-xs"
              // Um toque escolhe; tocar de novo na mesma desmarca — a resposta é opcional e
              // precisa poder voltar a ficar vazia (decisão 8).
              onClick={() => atualizar({ fase: valor.fase === f.chave ? '' : f.chave })}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="visita-concorrente">Viu produto de concorrente?</Label>
        <div className="flex gap-2">
          <Input
            id="visita-concorrente"
            value={valor.concorrentes}
            disabled={disabled}
            placeholder="Qual marca?"
            className="flex-1 min-w-0"
            onChange={(e) => atualizar({ concorrentes: e.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="shrink-0"
            onClick={() => atualizar({ concorrentes: 'Nenhum' })}
          >
            Nenhum
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Com quem você falou?</Label>
        <Select
          value={valor.contatoId || NAO_INFORMAR}
          disabled={disabled}
          onValueChange={(v) => atualizar({ contatoId: v === NAO_INFORMAR ? '' : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="— não informar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NAO_INFORMAR}>— não informar</SelectItem>
            {contatos.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nomeContato || 'Contato sem nome'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Próximo passo</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={valor.proximoPasso}
            disabled={disabled}
            placeholder="O que fazer a seguir?"
            className="flex-1"
            onChange={(e) => atualizar({ proximoPasso: e.target.value })}
          />
          <Input
            type="date"
            value={valor.proximoPassoEm}
            disabled={disabled}
            className="sm:w-40"
            onChange={(e) => atualizar({ proximoPassoEm: e.target.value })}
          />
        </div>
        <p className="text-xs text-muted-foreground">sem data, não vira tarefa</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="visita-observacao">Mais alguma coisa?</Label>
        <Textarea
          id="visita-observacao"
          value={valor.observacao}
          disabled={disabled}
          placeholder="O que você viu na obra?"
          className="min-h-20 text-sm"
          onChange={(e) => atualizar({ observacao: e.target.value })}
        />
      </div>
    </div>
  );
}
