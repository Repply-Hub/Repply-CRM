import { useRef, useState } from 'react';
import { FileText, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LinkAnexoPrivado } from '@/components/shared/LinkAnexoPrivado';
import { ImagemPrivada } from '@/components/shared/ImagemPrivada';
import { ACCEPT_DO_CAMPO, ehImagem, recusaDoAnexo, tamanhoLegivel } from '@/lib/anexos-do-negocio';
import type { AnexoDoNegocio } from '@/hooks/use-pedido-anexos';
import { useSelecaoDeArquivos } from '@/hooks/use-selecao-de-arquivos';
import { cn } from '@/lib/utils';

/**
 * A lista de anexos de um negócio, com o botão de acrescentar embaixo dela.
 *
 * 🔴 O DESENHO É PEDIDO DO LUCAS (12/09/2026): "o anexo adicionado sobe e o botão de adicionar
 * desce para baixo dele" — a tela precisa deixar claro, sem explicação, que cabe mais de um
 * anexo. Por isso a `<ul>` vem ANTES do botão na marcação, nunca depois.
 *
 * COMPONENTE CONTROLADO E PURO, na mesma linha de `CampoDeResponsaveis`: não fala com o banco,
 * só recebe a lista e devolve os gestos (`onAdicionar`/`onRemover`). É o que permite usá-lo no
 * cadastro — onde o negócio ainda não existe e os arquivos ficam em memória até o negócio nascer
 * — e na edição/ficha, onde cada gesto já grava na hora pelos ganchos da Tarefa 3.
 *
 * 🔴 ORDENA DE NOVO, POR CONTA PRÓPRIA — não reaproveitando `ordenarAnexos` de
 * `@/lib/anexos-do-negocio`. Não é escolha estética: aquela função pede `created_at` (a coluna
 * crua do banco, o que o gancho da Tarefa 3 lê ANTES de mapear para `AnexoDoNegocio`), e este
 * componente só recebe o já mapeado, com `criadoEm`. Comparar aqui, pelo mesmo campo que a
 * `AnexoDoNegocio` de verdade tem, é o que garante a ordem visual do desenho tanto na ficha
 * (lista já vem ordenada do gancho) quanto no cadastro (lista local, em memória, que ninguém
 * promete vir ordenada). Não muta o array recebido — mesma garantia de `ordenarAnexos`.
 */

export interface CampoDeAnexosProps {
  anexos: AnexoDoNegocio[];
  onAdicionar: (arquivo: File) => void | Promise<void>;
  onRemover?: (anexoId: string) => void | Promise<void>;
  enviando?: boolean;
  somenteLeitura?: boolean;
  obrigatorio?: boolean;
}

export function CampoDeAnexos({
  anexos,
  onAdicionar,
  onRemover,
  enviando = false,
  somenteLeitura = false,
  obrigatorio = false,
}: CampoDeAnexosProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mensagemRecusa, setMensagemRecusa] = useState<string | null>(null);

  // × e botão de adicionar somem juntos: sem `onRemover` não há como desfazer um acréscimo, e
  // oferecer só "adicionar" sem "tirar" é pior que não oferecer nenhum dos dois.
  const editavel = !somenteLeitura && !!onRemover;

  const ordenados = [...anexos].sort(
    (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
  );

  // Hook compartilhado com o campo de anexo da tarefa: processa a seleção vinda do input
  // (`multiple`) OU do arrastar-e-soltar, valida cada arquivo com `recusaDoAnexo` e entrega os
  // aceitos de uma vez. `desabilitado` cobre tanto o input quanto o arrasto — sem isso, quem tem
  // `somenteLeitura`/sem `onRemover` continuaria podendo soltar arquivos por cima do campo.
  const selecao = useSelecaoDeArquivos({
    recusar: recusaDoAnexo,
    onArquivos: (aceitos) => {
      aceitos.forEach((arquivo) => onAdicionar(arquivo));
    },
    onRecusa: setMensagemRecusa,
    desabilitado: !editavel,
  });

  return (
    <div className="space-y-2">
      <div
        onDragOver={selecao.aoArrastarSobre}
        onDragLeave={selecao.aoSairDoArrasto}
        onDrop={selecao.aoSoltar}
        className={cn(
          'space-y-2 rounded-md',
          selecao.arrastando && editavel && 'ring-2 ring-primary/40 ring-offset-2',
        )}
      >
        {(ordenados.length > 0 || enviando) && (
          <ul className="space-y-1.5">
            {enviando && (
              <li className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Enviando…</span>
              </li>
            )}
            {ordenados.map((anexo) => {
              const tamanho = tamanhoLegivel(anexo.tamanhoBytes);
              return (
                <li
                  key={anexo.id}
                  data-testid="anexo-linha"
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                >
                  {/* O nome (e a miniatura/ícone) inteiros clicáveis, abrindo o arquivo por
                      `LinkAnexoPrivado` — o mesmo componente que o resto do sistema já usa para
                      anexo privado (ele assina o endereço e abre no aplicativo do aparelho). */}
                  <LinkAnexoPrivado
                    url={anexo.url}
                    title={anexo.nome}
                    className="flex min-w-0 flex-1 items-center gap-2 text-foreground hover:underline"
                  >
                    {ehImagem(anexo.tipo) ? (
                      <ImagemPrivada
                        src={anexo.url}
                        alt=""
                        data-testid="miniatura-anexo"
                        className="h-8 w-8 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <FileText
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        data-testid="icone-arquivo"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{anexo.nome}</span>
                  </LinkAnexoPrivado>
                  {tamanho && <span className="shrink-0 text-xs text-muted-foreground">{tamanho}</span>}
                  {editavel && (
                    <button
                      type="button"
                      onClick={() => onRemover!(anexo.id)}
                      title={`Remover ${anexo.nome}`}
                      className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                    >
                      <X className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Remover {anexo.nome}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editavel && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_DO_CAMPO}
              multiple
              data-testid="input-anexo"
              className="hidden"
              onChange={selecao.aoEscolherNoInput}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
              className="h-auto min-h-9 gap-1.5 text-muted-foreground"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              Adicionar anexo
            </Button>
            <p className="text-xs text-muted-foreground">ou arraste arquivos aqui</p>
          </>
        )}
      </div>

      {mensagemRecusa && (
        <p role="alert" className="text-xs text-destructive">
          {mensagemRecusa}
        </p>
      )}

      {/* Só um lembrete visual — a validação de verdade é de quem usa o campo (ex.: o cadastro
          olha `arquivosPendentes.length > 0` antes de deixar salvar), porque só ele sabe se o
          negócio pode ser salvo sem anexo nenhum. */}
      {obrigatorio && editavel && ordenados.length === 0 && !mensagemRecusa && !enviando && (
        <p className="text-xs text-muted-foreground">Pelo menos um anexo é obrigatório.</p>
      )}
    </div>
  );
}
