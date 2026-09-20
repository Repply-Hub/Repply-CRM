import { useRef, useState, type ClipboardEvent } from 'react';
import { toast } from 'sonner';
import { Copy, ImageIcon, ImagePlus, Loader2, Maximize2, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTitle,
  ConteudoDialogo,
  CabecalhoDialogo,
  CorpoDialogo,
  RodapeDialogo,
} from '@/components/shared/DialogoResponsivo';
import { useAuth } from '@/hooks/use-auth';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { useAjudaImagens, useEnviarImagemDaAjuda, useRemoverImagemDaAjuda } from '@/hooks/use-ajuda-imagens';
import type { ImagemDoTopico } from '@/content/ajuda-conteudo';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_PASSO = 0.25;

/**
 * O print de um tópico da Ajuda. Só o admin da plataforma (`profile.role === 'admin'`) vê o
 * botão de enviar/trocar/remover — a Ajuda é documentação do produto, não dado de empresa, e
 * gestor de empresa não edita o texto dela nem as imagens.
 *
 * Quem não administra a plataforma só vê a imagem quando ela já existe: sem placeholder, sem
 * "print pendente" na cara do usuário final. A Ajuda continua completa em texto enquanto a
 * imagem não chega.
 */
export function ImagemDaAjuda({ imagem }: { imagem: ImagemDoTopico }) {
  const { chave, legenda } = imagem;
  const { profile } = useAuth();
  const ehAdmin = profile?.role === 'admin';

  const { data: imagens } = useAjudaImagens();
  const atual = imagens?.get(chave);

  const enviar = useEnviarImagemDaAjuda();
  const remover = useRemoverImagemDaAjuda();
  const [arrastando, setArrastando] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const [zoom, setZoom] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!ehAdmin && !atual) return null;

  const ocupado = enviar.isPending || remover.isPending;

  const enviarArquivo = (arquivo: File | null | undefined) => {
    if (!arquivo) return;
    enviar.mutate(
      { chave, arquivo, caminhoAnterior: atual?.path },
      {
        onSuccess: () => toast.success('Imagem da Ajuda enviada.'),
        onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível enviar a imagem.')),
        onSettled: () => {
          if (inputRef.current) inputRef.current.value = '';
        },
      },
    );
  };

  const escolher = (arquivos: FileList | null) => enviarArquivo(arquivos?.[0]);

  // Cola uma imagem copiada de fora (print do sistema operacional, outra aba, etc.) sem
  // precisar passar pelo seletor de arquivo. Só o admin sobe imagem, então quem não é admin
  // nem tem este manipulador ligado (ver os dois `onPaste` mais abaixo).
  const aoColar = (e: ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    enviarArquivo(item.getAsFile());
  };

  // Copia a imagem atual para a área de transferência do sistema operacional, pronta para
  // colar em outro lugar (um chat, um documento). `navigator.clipboard.write` exige contexto
  // seguro (https) e nem todo navegador suporta — falha silenciosa vira aviso, não trava a
  // tela.
  const copiarImagemAtual = async () => {
    if (!atual) return;
    try {
      const resposta = await fetch(atual.url);
      const blob = await resposta.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast.success('Imagem copiada.');
    } catch {
      toast.error('Não foi possível copiar a imagem. Seu navegador pode não suportar essa ação.');
    }
  };

  const aoCopiar = (e: ClipboardEvent<HTMLDivElement>) => {
    if (!atual) return;
    e.preventDefault();
    void copiarImagemAtual();
  };

  const apagar = () => {
    if (!atual) return;
    remover.mutate(
      { chave, path: atual.path },
      {
        onSuccess: () => toast.success('Imagem removida.'),
        onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível remover a imagem.')),
      },
    );
  };

  const abrirAmpliada = () => {
    setZoom(1);
    setAmpliada(true);
  };

  const inputDeArquivo = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      onChange={(e) => escolher(e.target.files)}
    />
  );

  if (atual) {
    return (
      <div className="space-y-1.5">
        <div
          className="relative overflow-hidden rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          // Focável para o Ctrl+C (copiar) e, sendo admin, o Ctrl+V (trocar a imagem) funcionarem
          // — sem foco, o navegador não sabe para qual elemento mandar o evento de teclado.
          tabIndex={0}
          onCopy={aoCopiar}
          onPaste={ehAdmin ? aoColar : undefined}
          title={ehAdmin ? 'Clique aqui e use Ctrl+C para copiar ou Ctrl+V para trocar a imagem' : 'Clique aqui e use Ctrl+C para copiar a imagem'}
        >
          <img src={atual.url} alt={legenda} className="w-full" />
          {/* Sempre visíveis, não só no hover: em tela de toque não existe hover, e sem isto
              os botões ficariam invisíveis para quem abre pelo celular. */}
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => void copiarImagemAtual()}
              title="Copiar imagem"
              className="rounded-md bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={abrirAmpliada}
              title="Ampliar imagem"
              className="rounded-md bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <Dialog open={ampliada} onOpenChange={setAmpliada}>
          <ConteudoDialogo className="sm:max-w-4xl p-0">
            <CabecalhoDialogo className="px-4 pt-4">
              <DialogTitle className="text-sm font-normal text-muted-foreground">{legenda}</DialogTitle>
            </CabecalhoDialogo>
            <CorpoDialogo className="mx-0 flex items-center justify-center px-4 pb-2">
              <img
                src={atual.url}
                alt={legenda}
                style={{ transform: `scale(${zoom})` }}
                className="max-h-[70dvh] w-auto max-w-full rounded-md object-contain transition-transform"
              />
            </CorpoDialogo>
            <RodapeDialogo className="justify-center px-4 py-3 sm:justify-center">
              <div className="flex items-center gap-0.5 rounded-full border bg-background px-1 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_PASSO).toFixed(2))))}
                  title="Diminuir zoom"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_PASSO).toFixed(2))))}
                  title="Aumentar zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                {zoom !== 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => setZoom(1)}
                    title="Restaurar zoom"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </RodapeDialogo>
          </ConteudoDialogo>
        </Dialog>

        {ehAdmin && (
          <div className="flex items-center gap-2">
            {inputDeArquivo}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => inputRef.current?.click()}
            >
              {enviar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Trocar imagem
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={ocupado}
              onClick={apagar}
            >
              {remover.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Remover
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Só chega aqui quando é admin e a chave ainda não tem imagem: mostra o espaço reservado
  // com a legenda de que print tirar (o mesmo texto que orientava o desenvolvimento, agora
  // servindo de guia para quem for fotografar a tela), o botão de enviar e o atalho de colar.
  return (
    <div className="space-y-1">
      <div
        tabIndex={0}
        onPaste={aoColar}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          escolher(e.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${
          arrastando ? 'border-primary bg-primary/5' : ''
        }`}
      >
        <ImageIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1">Print pendente: {legenda}</span>
        {inputDeArquivo}
        <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => inputRef.current?.click()}>
          {enviar.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Enviar imagem
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        PNG, JPG ou WEBP, até 5 MB. Clique na caixa acima e cole com Ctrl+V, ou arraste o
        arquivo. A imagem fica pública: use dado fictício na tela antes de fotografar, nunca
        nome ou valor real de cliente.
      </p>
    </div>
  );
}
