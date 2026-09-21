import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, ImageIcon, ImagePlus, Loader2, Maximize2, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
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
import { useAjudaImagens, useEnviarImagemDaAjuda, useRemoverImagemDaAjuda, type ImagemDaAjuda } from '@/hooks/use-ajuda-imagens';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_PASSO = 0.25;

/** Escapa caracteres especiais de regex — `prefixo` vem do código, mas mais vale prevenir. */
function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A sequência de fotos de um tópico ou de um passo numerado (`PassoComGaleria`,
 * `ajuda-conteudo.ts`) — qualquer `chave`/`prefixo` do conteúdo pode virar galeria, sem
 * precisar decidir isso de antemão no código: `prefixo` é a BASE do nome de um grupo, cada
 * foto enviada pela tela vira `<prefixo>-1`, `<prefixo>-2`, e assim por diante, calculado
 * sozinho a partir do maior número já usado. O admin master monta a sequência direto na
 * tela, sem precisar de código novo a cada foto — só a legenda inicial (o que fotografar)
 * vem do código.
 *
 * A chave SEM sufixo (`<prefixo>`, exatamente) também casa, como foto de índice 0 — é o
 * formato que `ImagemDaAjuda` (uma chave fixa = uma imagem, usado até 21/09/2026) gravava
 * para a imagem única de um tópico. Sem este caso, toda imagem de tópico já enviada antes
 * da galeria virar padrão ficaria órfã: existe na tabela e no balde, mas nenhuma tela
 * mostraria mais. Não precisa migração de dado nenhuma — só ler os dois formatos.
 *
 * Mesma regra de visibilidade: quem não administra a plataforma só vê a galeria quando ela já
 * tem pelo menos uma foto.
 */
export function GaleriaDaAjuda({ prefixo, legenda }: { prefixo: string; legenda: string }) {
  const { profile } = useAuth();
  const ehAdmin = profile?.role === 'admin';

  const { data: imagens } = useAjudaImagens();

  const fotos = useMemo(() => {
    if (!imagens) return [];
    const prefixoEscapado = escaparRegex(prefixo);
    const padraoNumerado = new RegExp(`^${prefixoEscapado}-(\\d+)$`);
    const comIndice: Array<ImagemDaAjuda & { indice: number }> = [];
    for (const img of imagens.values()) {
      if (img.chave === prefixo) {
        comIndice.push({ ...img, indice: 0 });
        continue;
      }
      const m = padraoNumerado.exec(img.chave);
      if (m) comIndice.push({ ...img, indice: Number(m[1]) });
    }
    return comIndice.sort((a, b) => a.indice - b.indice);
  }, [imagens, prefixo]);

  const enviar = useEnviarImagemDaAjuda();
  const remover = useRemoverImagemDaAjuda();
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // O ÍNDICE (posição em `fotos`) da foto ampliada no momento, não a foto em si — é o que
  // permite "próxima"/"anterior" dentro do próprio diálogo, sem fechar e reabrir. `null` é
  // diálogo fechado. Independe de qual slide o carrossel da página está mostrando: o clique
  // em "ampliar" já diz exatamente qual posição abrir.
  const [ampliadaIndice, setAmpliadaIndice] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const ampliada = ampliadaIndice !== null ? fotos[ampliadaIndice] : undefined;

  const abrirAmpliada = (indice: number) => {
    setZoom(1);
    setAmpliadaIndice(indice);
  };
  const fecharAmpliada = () => setAmpliadaIndice(null);
  const irParaAnterior = () => {
    setZoom(1);
    setAmpliadaIndice((i) => (i === null ? i : Math.max(0, i - 1)));
  };
  const irParaProxima = () => {
    setZoom(1);
    setAmpliadaIndice((i) => (i === null ? i : Math.min(fotos.length - 1, i + 1)));
  };

  // Setas do teclado navegam a sequência enquanto o diálogo de zoom está aberto — mesmo
  // atalho de qualquer visualizador de fotos. Só liga o listener com o diálogo aberto, para
  // não competir com o `onKeyDownCapture` do carrossel da página (ArrowLeft/Right também).
  useEffect(() => {
    if (ampliadaIndice === null || fotos.length <= 1) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') irParaAnterior();
      else if (e.key === 'ArrowRight') irParaProxima();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ampliadaIndice, fotos.length]);

  if (!ehAdmin && fotos.length === 0) return null;

  const ocupado = enviandoLote || remover.isPending;

  // Sobe os arquivos em SEQUÊNCIA, não em paralelo: cada envio precisa saber o próximo número
  // livre, e disparar tudo de uma vez faria duas fotos brigarem pelo mesmo `<prefixo>-N` antes
  // que a lista em cache (`imagens`) refletisse o envio anterior.
  const enviarArquivos = async (lista: FileList | File[] | null) => {
    const arquivos = lista ? Array.from(lista).filter((a) => a.type.startsWith('image/')) : [];
    if (arquivos.length === 0) return;

    setEnviandoLote(true);
    let proximoIndice = fotos.length ? Math.max(...fotos.map((f) => f.indice)) + 1 : 1;
    let enviadas = 0;
    try {
      for (const arquivo of arquivos) {
        await enviar.mutateAsync({ chave: `${prefixo}-${proximoIndice}`, arquivo });
        proximoIndice++;
        enviadas++;
      }
      toast.success(enviadas > 1 ? `${enviadas} fotos enviadas.` : 'Foto enviada.');
    } catch (e) {
      toast.error(
        mensagemDeErro(
          e,
          enviadas > 0
            ? `${enviadas} de ${arquivos.length} fotos enviadas — as demais falharam.`
            : 'Não foi possível enviar as fotos.',
        ),
      );
    } finally {
      setEnviandoLote(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const apagarFoto = (foto: ImagemDaAjuda) => {
    remover.mutate(
      { chave: foto.chave, path: foto.path },
      {
        onSuccess: () => toast.success('Foto removida.'),
        onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível remover a foto.')),
      },
    );
  };

  const inputDeArquivos = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      className="hidden"
      onChange={(e) => void enviarArquivos(e.target.files)}
    />
  );

  return (
    <div className="space-y-1.5">
      {fotos.length > 0 && (
        // `px-7` só entra com mais de uma foto — é o espaço reservado para as setas. Sem
        // ele as setas (absolutas, então ignoram o padding do próprio pai) cairiam por
        // cima da imagem; com ele, `CarouselContent` (fluxo normal) nasce OFERECIDO pra
        // dentro por esse respiro, e `left-0`/`right-0` das setas — que medem a partir da
        // borda do Carousel, não do conteúdo — caem exatamente nesse respiro, do lado de
        // fora da imagem.
        <Carousel className={fotos.length > 1 ? 'w-full px-7' : 'w-full'} opts={{ align: 'start' }}>
          <CarouselContent className="ml-0">
            {fotos.map((foto, i) => (
              <CarouselItem key={foto.chave} className="basis-full pl-0">
                <div className="relative overflow-hidden rounded-md border">
                  {/* A imagem inteira é clicável, não só o ícone de lupa — pedido do Lucas,
                      e é o gesto mais natural em qualquer galeria de fotos. O botão de lupa
                      continua ali por cima, redundante de propósito: sinaliza pra quem não
                      tentou clicar direto que a imagem é ampliável. */}
                  <button type="button" onClick={() => abrirAmpliada(i)} className="block w-full cursor-zoom-in">
                    <img src={foto.url} alt={`${legenda} — foto ${i + 1} de ${fotos.length}`} className="w-full" />
                  </button>
                  {fotos.length > 1 && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground backdrop-blur">
                      {i + 1}/{fotos.length}
                    </span>
                  )}
                  <div className="absolute right-1.5 top-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => abrirAmpliada(i)}
                      title="Ampliar imagem"
                      className="rounded-md bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                    {ehAdmin && (
                      <button
                        type="button"
                        onClick={() => apagarFoto(foto)}
                        disabled={ocupado}
                        title="Remover esta foto"
                        className="rounded-md bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {fotos.length > 1 && (
            <>
              <CarouselPrevious variant="default" className="left-0 top-1/2 h-7 w-7 -translate-y-1/2" />
              <CarouselNext variant="default" className="right-0 top-1/2 h-7 w-7 -translate-y-1/2" />
            </>
          )}
        </Carousel>
      )}
      {fotos.length > 1 && (
        <p className="text-[11px] text-muted-foreground/70">
          {fotos.length} fotos nesta sequência — arraste ou use as setas para ver as outras.
        </p>
      )}

      <Dialog open={!!ampliada} onOpenChange={(aberto) => !aberto && fecharAmpliada()}>
        <ConteudoDialogo className="sm:max-w-4xl p-0">
          <CabecalhoDialogo className="px-4 pt-4">
            <DialogTitle className="text-sm font-normal text-muted-foreground">
              {legenda}
              {fotos.length > 1 && ampliadaIndice !== null && (
                <span className="ml-2 tabular-nums text-muted-foreground/70">
                  {ampliadaIndice + 1}/{fotos.length}
                </span>
              )}
            </DialogTitle>
          </CabecalhoDialogo>
          {/* `px-10`, não `px-4`, com mais de uma foto: a imagem some ATÉ `max-w-full`, então
              sem esse respiro extra ela cresce até encostar nas duas bordas do diálogo — e
              as setas (absolutas, medidas a partir da borda do PADDING, não do conteúdo)
              caíam por cima dela. `px-10` (40px) é maior que o botão (32px, h-8 w-8): o
              botão cabe inteiro no respiro, do lado de fora da imagem, com folga. */}
          <CorpoDialogo className={cn('relative mx-0 flex items-center justify-center pb-2', fotos.length > 1 ? 'px-10' : 'px-4')}>
            {ampliada && (
              <img
                src={ampliada.url}
                alt={legenda}
                style={{ transform: `scale(${zoom})` }}
                className="max-h-[70dvh] w-auto max-w-full rounded-md object-contain transition-transform"
              />
            )}
            {/* Navegar a sequência sem fechar o diálogo — só quando há mais de uma foto.
                Desabilita nas pontas em vez de dar a volta: "próxima" da última foto não é a
                primeira de novo, é o fim da sequência. */}
            {fotos.length > 1 && ampliadaIndice !== null && (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  className="absolute left-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
                  disabled={ampliadaIndice <= 0}
                  onClick={irParaAnterior}
                  title="Foto anterior"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
                  disabled={ampliadaIndice >= fotos.length - 1}
                  onClick={irParaProxima}
                  title="Próxima foto"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
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
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            void enviarArquivos(e.dataTransfer.files);
          }}
          className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground transition-colors ${
            arrastando ? 'border-primary bg-primary/5' : ''
          }`}
        >
          <ImageIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{fotos.length === 0 ? `Sequência pendente: ${legenda}` : 'Adicionar mais fotos à sequência'}</span>
          {inputDeArquivos}
          <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => inputRef.current?.click()}>
            {enviandoLote ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            )}
            {fotos.length === 0 ? 'Enviar fotos' : 'Adicionar fotos'}
          </Button>
        </div>
      )}
      {ehAdmin && fotos.length === 0 && (
        <p className="text-[11px] text-muted-foreground/70">
          PNG, JPG ou WEBP, até 5 MB cada. Selecione ou arraste mais de um arquivo de uma vez
          para montar a sequência na ordem escolhida. A imagem fica pública: use dado fictício
          na tela antes de fotografar, nunca nome ou valor real de cliente.
        </p>
      )}
    </div>
  );
}
