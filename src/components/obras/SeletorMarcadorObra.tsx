import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tag } from 'lucide-react';
import { useMarcadoresObras } from '@/hooks/use-marcadores-obras';

/**
 * O <Select> do Radix não aceita item com valor vazio, então "sem marcador" precisa de um
 * valor de mentirinha só na tela. Ele nunca chega ao banco — vira nulo ao salvar.
 */
const SEM_MARCADOR = '__sem_marcador__';

export interface SeletorMarcadorObraProps {
  /** Id do marcador, ou string vazia para "sem marcador" (que é o padrão). */
  value: string;
  onChange: (marcadorId: string) => void;
  /**
   * Abre a tela de gerenciar marcadores. Quando não é passado, o estado vazio só explica
   * onde criar — é o caso dos atalhos de dentro do negócio, que não têm essa tela à mão.
   */
  onGerenciar?: () => void;
  label?: string;
  disabled?: boolean;
}

/**
 * O campo de marcador da obra, igual nos QUATRO lugares que criam obra: a tela de Obras, a
 * ficha do cliente, e os atalhos "Nova Obra" de dentro de Novo Negócio e de Editar Negócio.
 *
 * Estar num componente só é o ponto. O campo que este substituiu — o "Status Inicial" —
 * existia copiado em dois lugares com LISTAS DIFERENTES: um lia a lista configurável, o
 * outro tinha quatro opções cravadas no código. As 2.312 obras apagadas em agosto/2026 foram
 * criadas pelo segundo, todas com o mesmo status. Cópia diverge; componente não.
 *
 * O ESTADO VAZIO NÃO É DECORAÇÃO. A lista de marcadores nasce vazia de propósito (decisão do
 * dono do produto), então TODA empresa vê este estado no primeiro acesso. Um <Select> mudo e
 * em branco foi exatamente o que tornou o Status Inicial intransponível: a pessoa não tinha
 * como saber se estava quebrado ou vazio. Aqui a frase diz que é normal e que o campo é
 * opcional — e, onde dá, o botão resolve na mesma tela.
 */
export function SeletorMarcadorObra({
  value,
  onChange,
  onGerenciar,
  label = 'Marcador',
  disabled,
}: SeletorMarcadorObraProps) {
  const { data: marcadores } = useMarcadoresObras();
  const lista = marcadores ?? [];

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {lista.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nenhum marcador cadastrado ainda. O campo é opcional — a obra pode ser criada sem
            um{onGerenciar ? '' : ', e os marcadores se cadastram na tela de Obras'}.
          </p>
          {onGerenciar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs"
              onClick={onGerenciar}
            >
              <Tag className="h-3.5 w-3.5" />
              Criar o primeiro marcador
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Select
            value={value || SEM_MARCADOR}
            disabled={disabled}
            onValueChange={(v) => onChange(v === SEM_MARCADOR ? '' : v)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Sem marcador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_MARCADOR}>Sem marcador</SelectItem>
              {lista.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex items-center gap-2">
                    {/* A cor vem de um dos 7 tokens do tema. A classe é montada por texto,
                        o que o Tailwind normalmente apagaria — funciona porque existe um
                        safelist em tailwind.config.ts:6-9 cobrindo exatamente esses 7. */}
                    <span className={`h-2 w-2 shrink-0 rounded-full bg-${m.cor}`} />
                    {m.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {onGerenciar && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              title="Gerenciar marcadores"
              aria-label="Gerenciar marcadores"
              onClick={onGerenciar}
            >
              <Tag className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
