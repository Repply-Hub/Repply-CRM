import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  ImageIcon,
  ImagePlus,
  Loader2,
  Maximize2,
  MoveLeft,
  MoveRight,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi } from '@/components/ui/carousel';
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
import {
  useAjudaImagens,
  useEnviarImagemDaAjuda,
  useRemoverImagemDaAjuda,
  useTrocarPosicaoImagemDaAjuda,
  type ImagemDaAjuda,
} from '@/hooks/use-ajuda-imagens';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_PASSO = 0.25;
/** Nível que um clique na imagem aplica — perto o bastante para ler texto miúdo de print,
 * sem já estourar o teto (`ZOOM_MAX`) e deixar a rodada de + do rodapé sem margem. */
const ZOOM_CLIQUE = 2;
const ORIGEM_CENTRO = { x: 50, y: 50 };

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
  const trocarPosicao = useTrocarPosicaoImagemDaAjuda();
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // O ÍNDICE (posição em `fotos`) da foto ampliada no momento, não a foto em si — é o que
  // permite "próxima"/"anterior" dentro do próprio diálogo, sem fechar e reabrir. `null` é
  // diálogo fechado. Independe de qual slide o carrossel da página está mostrando: o clique
  // em "ampliar" já diz exatamente qual posição abrir.
  const [ampliadaIndice, setAmpliadaIndice] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  // Onde o zoom "abre" quando é maior que 100% — em porcentagem da imagem (CSS
  // `transform-origin`), não em pixel: sobrevive a redimensionar a janela. Some para o
  // centro sempre que o zoom volta a 1, para o próximo clique partir do ponto certo, não de
  // onde a pessoa tinha ampliado da vez anterior.
  const [origemZoom, setOrigemZoom] = useState(ORIGEM_CENTRO);
  const ampliada = ampliadaIndice !== null ? fotos[ampliadaIndice] : undefined;

  // A tira de miniaturas (abaixo da descrição, só com mais de uma foto) precisa saber qual
  // slide o carrossel principal está mostrando, para destacar a miniatura certa — e precisa
  // da API do embla para PULAR direto para um slide ao clicar numa miniatura (`scrollTo`),
  // não só avançar uma de cada vez como as setas fazem.
  const [carrosselApi, setCarrosselApi] = useState<CarouselApi>();
  const [slideAtivo, setSlideAtivo] = useState(0);
  useEffect(() => {
    if (!carrosselApi) return;
    setSlideAtivo(carrosselApi.selectedScrollSnap());
    const aoSelecionar = () => setSlideAtivo(carrosselApi.selectedScrollSnap());
    carrosselApi.on('select', aoSelecionar);
    return () => {
      carrosselApi.off('select', aoSelecionar);
    };
  }, [carrosselApi]);

  const abrirAmpliada = (indice: number) => {
    setZoom(1);
    setOrigemZoom(ORIGEM_CENTRO);
    setAmpliadaIndice(indice);
  };
  const fecharAmpliada = () => setAmpliadaIndice(null);
  const irParaAnterior = () => {
    setZoom(1);
    setOrigemZoom(ORIGEM_CENTRO);
    setAmpliadaIndice((i) => (i === null ? i : Math.max(0, i - 1)));
  };
  const irParaProxima = () => {
    setZoom(1);
    setOrigemZoom(ORIGEM_CENTRO);
    setAmpliadaIndice((i) => (i === null ? i : Math.min(fotos.length - 1, i + 1)));
  };

  // Clicar na imagem aproxima no ponto exato do clique — como abrir uma lupa —, e clicar de
  // novo (com QUALQUER zoom, não só o do clique) devolve ao tamanho normal. `getBoundingClientRect`
  // porque o zoom já pode estar aplicado (`transform: scale`), então `offsetX/Y` do próprio
  // evento mediriam em cima da imagem JÁ escalada, não da posição real na tela.
  const aoClicarNaImagemAmpliada = (e: MouseEvent<HTMLImageElement>) => {
    if (zoom !== 1) {
      setZoom(1);
      setOrigemZoom(ORIGEM_CENTRO);
      return;
    }
    const retangulo = e.currentTarget.getBoundingClientRect();
    setOrigemZoom({
      x: ((e.clientX - retangulo.left) / retangulo.width) * 100,
      y: ((e.clientY - retangulo.top) / retangulo.height) * 100,
    });
    setZoom(ZOOM_CLIQUE);
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

  const ocupado = enviandoLote || remover.isPending || trocarPosicao.isPending;

  // Troca de posição, para quando uma foto sobe no lugar errado da sequência — sem precisar
  // apagar e reenviar. `vizinho` é sempre a posição adjacente (mover uma casa por clique, não
  // arrastar para qualquer lugar): simples de usar e simples de entender o resultado.
  const moverFoto = (indice: number, vizinho: number) => {
    const atual = fotos[indice];
    const destino = fotos[vizinho];
    if (!atual || !destino) return;
    trocarPosicao.mutate(
      { chaveA: atual.chave, chaveB: destino.chave },
      { onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível trocar a ordem das fotos.')) },
    );
  };

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
        // `px-9` só entra com mais de uma foto — é o espaço reservado para as setas. Sem
        // ele as setas (absolutas, então ignoram o padding do próprio pai) cairiam por
        // cima da imagem; com ele, `CarouselContent` (fluxo normal) nasce OFERECIDO pra
        // dentro por esse respiro, e `left-0`/`right-0` das setas — que medem a partir da
        // borda do Carousel, não do conteúdo — caem exatamente nesse respiro, do lado de
        // fora da imagem. `px-9` (36px), não `px-7` (28px): a seta tem 28px (h-7 w-7) — com
        // `px-7` ela ocupava o respiro inteiro e encostava direto na borda da imagem, sem
        // folga nenhuma. `px-9` sobra 8px de respiro visível, mesma folga que o diálogo de
        // ampliar já usa entre a seta e a imagem (ver `px-10` mais abaixo, com botão de 32px).
        <Carousel
          setApi={setCarrosselApi}
          className={fotos.length > 1 ? 'w-full px-9' : 'w-full'}
          opts={{ align: 'start' }}
        >
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
                  {/* Todos os botões de ação (ampliar, mover, remover) empilhados no MESMO
                      canto — direita, um embaixo do outro — em vez de espalhados nos dois
                      cantos de cima: dois grupos (esquerda/direita) confundia mais do que
                      ajudava, e a lupa sozinha no canto direito não deixava claro que os
                      outros três eram do mesmo conjunto. Mover desabilita nas pontas em vez
                      de dar a volta: mover a primeira para trás não é ir para o fim. */}
                  <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => abrirAmpliada(i)}
                      title="Ampliar imagem"
                      className="rounded-md bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                    {ehAdmin && fotos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => moverFoto(i, i - 1)}
                          disabled={ocupado || i === 0}
                          title="Mover esta foto uma posição para trás"
                          className="rounded-md bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-50"
                        >
                          <MoveLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moverFoto(i, i + 1)}
                          disabled={ocupado || i === fotos.length - 1}
                          title="Mover esta foto uma posição para frente"
                          className="rounded-md bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-50"
                        >
                          <MoveRight className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
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

      {/* Tira de miniaturas: um jeito de PULAR direto para uma foto qualquer, sem clicar
          "próxima" várias vezes. A borda colorida marca qual é a que o carrossel principal
          está mostrando agora — atualiza sozinha ao arrastar ou usar as setas, não só ao
          clicar numa miniatura. */}
      {fotos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {fotos.map((foto, i) => (
            <button
              key={foto.chave}
              type="button"
              onClick={() => carrosselApi?.scrollTo(i)}
              title={`Ir para a foto ${i + 1}`}
              className={cn(
                'h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                slideAtivo === i
                  ? 'border-primary'
                  : 'border-transparent opacity-60 hover:opacity-100',
              )}
            >
              <img
                src={foto.url}
                alt={`${legenda} — miniatura ${i + 1} de ${fotos.length}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
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
                onClick={aoClicarNaImagemAmpliada}
                style={{ transform: `scale(${zoom})`, transformOrigin: `${origemZoom.x}% ${origemZoom.y}%` }}
                className={cn(
                  'max-h-[70dvh] w-auto max-w-full rounded-md border object-contain transition-transform',
                  zoom === 1 ? 'cursor-zoom-in' : 'cursor-zoom-out',
                )}
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
          {/* `flex-col`/`sm:flex-col` cancelam o padrão de `RodapeDialogo` (linha no desktop,
              pensado para par de botão Cancelar/Salvar) — aqui os dois blocos empilham em
              QUALQUER largura: miniaturas em cima, controle de zoom embaixo. `sm:space-x-0`
              cancela o respaçamento horizontal que o padrão também aplicaria entre os dois
              blocos empilhados. */}
          <RodapeDialogo className="flex-col sm:flex-col items-center justify-center gap-3 px-4 py-3 sm:space-x-0">
            {fotos.length > 1 && ampliadaIndice !== null && (
              <div className="flex w-full justify-center gap-1.5 overflow-x-auto">
                {fotos.map((foto, i) => (
                  <button
                    key={foto.chave}
                    type="button"
                    onClick={() => abrirAmpliada(i)}
                    title={`Ir para a foto ${i + 1}`}
                    className={cn(
                      'h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                      ampliadaIndice === i
                        ? 'border-primary'
                        : 'border-border opacity-60 hover:opacity-100',
                    )}
                  >
                    <img
                      src={foto.url}
                      alt={`${legenda} — miniatura ${i + 1} de ${fotos.length}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
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
                  onClick={() => {
                    setZoom(1);
                    setOrigemZoom(ORIGEM_CENTRO);
                  }}
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
          tabIndex={0}
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
          // Colar (Ctrl+V) sobe a imagem direto da área de transferência — o print de tela
          // que a pessoa acabou de tirar chega ao clipboard como um `item` de arquivo, não
          // como texto. Só dispara com o foco NESTA área (por isso o `tabIndex`, sem ele um
          // `<div>` nunca recebe evento de colar): clicar a área ou tabular até ela antes de
          // apertar Ctrl+V. Sem isso, colar em QUALQUER galeria da página tentaria subir a
          // mesma imagem em todas ao mesmo tempo — um listener global não sabe qual sequência
          // é a pretendida.
          onPaste={(e) => {
            const arquivos = Array.from(e.clipboardData.items)
              .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter((arquivo): arquivo is File => arquivo !== null);
            if (arquivos.length === 0) return;
            e.preventDefault();
            void enviarArquivos(arquivos);
          }}
          className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
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
          PNG, JPG ou WEBP, até 5 MB cada. Selecione, arraste ou clique na área acima e cole
          (Ctrl+V) uma imagem copiada — pode ser mais de um arquivo de uma vez, na ordem
          escolhida. A imagem fica pública: use dado fictício na tela antes de fotografar,
          nunca nome ou valor real de cliente.
        </p>
      )}
    </div>
  );
}
