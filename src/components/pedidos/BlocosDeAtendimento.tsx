import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LinhaDoHistorico } from '@/hooks/use-blocos-do-negocio';

/**
 * Cada atendimento do negócio: um bloco de WhatsApp, ou um assunto de e-mail.
 *
 * O teto existe por um caso real — há uma conversa na MD com 150 fechamentos.
 * Sem ele, um extremo empurra comentários, visitas e ligações para fora da tela.
 */
const MOSTRAR_NO_MAXIMO = 10;

function periodo(inicio: string, fim: string): string {
  const f = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  const a = f(inicio);
  const b = f(fim);
  return a === b ? a : `${a} a ${b}`;
}

/**
 * 🔴 RECEBE as linhas prontas em vez de buscá-las.
 *
 * Antes ele chamava o gancho por dentro, e o pai não tinha como saber se
 * alguma linha havia sido desenhada — resultado: o painel mostrava um
 * atendimento E, logo abaixo, "Nenhuma conversa, e-mail, visita ou ligação
 * neste negócio". Quem decide o vazio precisa enxergar os dois lados, e quem
 * enxerga os dois é o pai.
 */
export function BlocosDeAtendimento({ linhas }: { linhas: LinhaDoHistorico[] }) {
  const navigate = useNavigate();
  const [verTodas, setVerTodas] = useState(false);

  if (linhas.length === 0) return null;

  const visiveis = verTodas ? linhas : linhas.slice(0, MOSTRAR_NO_MAXIMO);
  const restantes = linhas.length - visiveis.length;

  return (
    <div className="space-y-1.5">
      {visiveis.map((l) => {
        const Icone = l.canal === 'email' ? Mail : MessageSquare;
        return (
          <button
            key={l.chave}
            type="button"
            onClick={() =>
              l.destino.tipo === 'whatsapp'
                ? navigate(
                    `/whatsapp?conversaId=${encodeURIComponent(l.destino.conversaId)}` +
                      `&mensagemId=${encodeURIComponent(l.destino.mensagemId)}`,
                  )
                : navigate(
                    `/emails?mensagemId=${encodeURIComponent(l.destino.mensagemId)}`,
                  )
            }
            className="flex w-full gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted/60"
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icone className="h-3 w-3 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-card-foreground">{l.titulo}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {periodo(l.inicioEm, l.fimEm)} · {l.detalhe}
              </p>
            </div>
          </button>
        );
      })}

      {restantes > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-xs text-muted-foreground"
          onClick={() => setVerTodas(true)}
        >
          Ver todas ({restantes} a mais)
        </Button>
      )}
    </div>
  );
}
