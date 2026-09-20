import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageIcon, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
import { useAuth } from '@/hooks/use-auth';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { useAjudaImagens, useEnviarImagemDaAjuda, useRemoverImagemDaAjuda, type ImagemDaAjuda } from '@/hooks/use-ajuda-imagens';

/** Escapa caracteres especiais de regex — `prefixo` vem do código, mas mais vale prevenir. */
function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A sequência de fotos de um passo numerado (`PassoComGaleria`, `ajuda-conteudo.ts`).
 *
 * Diferente de `ImagemDaAjuda` (uma `chave` fixa = uma imagem), aqui `prefixo` é a BASE do
 * nome de um grupo: cada foto enviada pela tela vira `<prefixo>-1`, `<prefixo>-2`, e assim por
 * diante, calculado sozinho a partir do maior número já usado. O admin master monta a
 * sequência direto na tela, sem precisar de código novo a cada foto — só a legenda inicial (o
 * que fotografar) vem do código, como em `ImagemDaAjuda`.
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
    const padrao = new RegExp(`^${escaparRegex(prefixo)}-(\\d+)$`);
    const comIndice: Array<ImagemDaAjuda & { indice: number }> = [];
    for (const img of imagens.values()) {
      const m = padrao.exec(img.chave);
      if (m) comIndice.push({ ...img, indice: Number(m[1]) });
    }
    return comIndice.sort((a, b) => a.indice - b.indice);
  }, [imagens, prefixo]);

  const enviar = useEnviarImagemDaAjuda();
  const remover = useRemoverImagemDaAjuda();
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        <Carousel className="w-full" opts={{ align: 'start' }}>
          <CarouselContent className="ml-0">
            {fotos.map((foto, i) => (
              <CarouselItem key={foto.chave} className="basis-full pl-0">
                <div className="relative overflow-hidden rounded-md border">
                  <img src={foto.url} alt={`${legenda} — foto ${i + 1} de ${fotos.length}`} className="w-full" />
                  {fotos.length > 1 && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground backdrop-blur">
                      {i + 1}/{fotos.length}
                    </span>
                  )}
                  {ehAdmin && (
                    <button
                      type="button"
                      onClick={() => apagarFoto(foto)}
                      disabled={ocupado}
                      title="Remover esta foto"
                      className="absolute right-1.5 top-1.5 rounded-md bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {fotos.length > 1 && (
            <>
              <CarouselPrevious className="left-1.5 top-1/2 h-7 w-7 -translate-y-1/2" />
              <CarouselNext className="right-1.5 top-1/2 h-7 w-7 -translate-y-1/2" />
            </>
          )}
        </Carousel>
      )}

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
