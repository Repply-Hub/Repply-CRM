import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Link as LinkIcon, Type, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { validateFile } from '@/lib/file-validation';
import {
  assinaturaImagemPath,
  ehAssinaturaImagem,
  getAssinaturaImagemUrl,
  montarAssinaturaImagemHtml,
} from '@/lib/assinatura-email';

interface Props {
  name: string;
  value: string;
  onChange: (html: string) => void;
  userId: string;
  /**
   * Avisa o pai qual aba está selecionada — "imagem" vs "texto" não dá pra
   * inferir só pelo `value` quando o modo Imagem ainda não tem arquivo
   * enviado (valor fica `''`, indistinguível de um texto vazio). O pai usa
   * isso pra, por exemplo, esconder o upload de logotipo da empresa
   * (exclusivo do modo texto) assim que o usuário troca de aba, mesmo antes
   * de subir uma imagem.
   */
  onModoChange?: (modo: 'texto' | 'imagem') => void;
}

/**
 * Editor de assinatura de e-mail com dois modos: "Texto" (negrito/itálico/
 * sublinhado/link via `contentEditable` + `execCommand` — não puxa uma lib de
 * rich-text inteira pra um campo deste tamanho) e "Imagem" (sobe um arquivo
 * único que vira a assinatura inteira, para quem já tem uma assinatura
 * pronta como imagem). Os dois modos gravam no MESMO campo
 * `assinatura_email`: o modo imagem grava só uma tag `<img>` e
 * `ehAssinaturaImagem` reconhece isso ao recarregar, sem precisar de coluna
 * nova no banco.
 *
 * `contentEditable` não participa de `FormData` nativo, então mantém um
 * `<input type="hidden">` em sincronia: o resto do formulário em `ProfileTab`
 * é não controlado (lê tudo via `FormData` no submit) — isto deixa este campo
 * ser a única exceção controlada sem mudar o resto do form.
 */
export function AssinaturaEmailEditor({ name, value, onChange, userId, onModoChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const ultimoValorEmitidoRef = useRef(value);
  const savedRangeRef = useRef<Range | null>(null);
  const [modo, setModo] = useState<'texto' | 'imagem'>(() => (ehAssinaturaImagem(value) ? 'imagem' : 'texto'));
  const [isUploading, setIsUploading] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imagemDragAtiva, setImagemDragAtiva] = useState(false);
  // Cache-bust local: o path no Storage é fixo por usuário, então sem isto o
  // navegador continuaria servindo a imagem antiga do cache logo após trocar.
  const [imagemVersion, setImagemVersion] = useState(() => Date.now());

  // Roda no mount (avisa o modo inicial) e a cada troca — não depende de
  // `onModoChange` estar memoizado no pai, só reage à mudança do próprio `modo`.
  useEffect(() => {
    onModoChange?.(modo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  // Só escreve no DOM quando o valor mudou por FORA (troca de usuário,
  // carregamento inicial) e o editor não está em foco — nunca a cada
  // re-render por causa do próprio `onChange`, senão o cursor pularia pro
  // início do texto a cada tecla digitada.
  useEffect(() => {
    if (value === ultimoValorEmitidoRef.current) return;
    setModo(ehAssinaturaImagem(value) ? 'imagem' : 'texto');
    if (
      editorRef.current &&
      !ehAssinaturaImagem(value) &&
      document.activeElement !== editorRef.current
    ) {
      editorRef.current.innerHTML = value;
    }
    ultimoValorEmitidoRef.current = value;
  }, [value]);

  const emitir = () => {
    if (!editorRef.current) return;
    ultimoValorEmitidoRef.current = editorRef.current.innerHTML;
    onChange(editorRef.current.innerHTML);
  };

  const executar = (comando: string, argumento?: string) => {
    editorRef.current?.focus();
    document.execCommand(comando, false, argumento);
    emitir();
  };

  // Abre o modal de link salvando a seleção atual: o clique no botão (ou o
  // foco indo pro campo do modal) tira o foco/seleção do editor, então sem
  // isto o "criar link" na confirmação não teria mais sobre qual texto agir.
  const abrirDialogoLink = () => {
    const selection = window.getSelection();
    savedRangeRef.current =
      selection && selection.rangeCount > 0 && editorRef.current?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
    setLinkUrl('');
    setLinkDialogOpen(true);
  };

  const confirmarLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    document.execCommand('createLink', false, url);
    emitir();
    setLinkDialogOpen(false);
  };

  const trocarModo = (novoModo: 'texto' | 'imagem') => {
    if (novoModo === modo) return;
    setModo(novoModo);
    // Cada modo grava SÓ o que promete: a imagem sozinha, ou o texto sozinho
    // com suas estilizações — nunca sobra do modo anterior. Trocar pra
    // "texto" com um `<img>` parado no valor, ou pra "imagem" com texto
    // digitado parado no valor, deixaria a assinatura salva inconsistente com
    // o modo mostrado na tela caso o usuário não mexa em mais nada e salve.
    const incompativel =
      (novoModo === 'texto' && ehAssinaturaImagem(value)) ||
      (novoModo === 'imagem' && value !== '' && !ehAssinaturaImagem(value));
    if (incompativel) {
      ultimoValorEmitidoRef.current = '';
      onChange('');
      if (editorRef.current) editorRef.current.innerHTML = '';
    }
  };

  const uploadImagem = async (file: File) => {
    if (!validateFile(file, {
      allowedMimePrefixes: ['image/'],
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
      maxBytes: 5 * 1024 * 1024, // 5 MB
    })) return;

    try {
      setIsUploading(true);
      const { error: uploadError } = await supabase.storage
        .from('email-assets')
        .upload(assinaturaImagemPath(userId), file, { upsert: true, contentType: file.type || 'image/png' });
      if (uploadError) throw uploadError;

      setImagemVersion(Date.now());
      const html = montarAssinaturaImagemHtml(getAssinaturaImagemUrl(userId));
      ultimoValorEmitidoRef.current = html;
      onChange(html);
      toast.success('Imagem de assinatura enviada!');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Erro ao enviar imagem: ' + message);
    } finally {
      setIsUploading(false);
    }
  };

  const selecionarImagemPorInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) uploadImagem(file);
  };

  const arrastarImagem = (ativa: boolean) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setImagemDragAtiva(ativa);
  };

  const soltarImagem = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setImagemDragAtiva(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadImagem(file);
  };

  // Área precisa de `tabIndex` pra ser focável: evento `paste` só chega em
  // elementos com foco (ou em inputs/textareas), e este é um `div`.
  const colarImagem = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    uploadImagem(file);
  };

  const removerImagem = () => {
    ultimoValorEmitidoRef.current = '';
    onChange('');
  };

  // Modo texto é só texto + estilizações do próprio editor — colar uma
  // imagem aqui (o navegador embutiria como `<img>` base64) misturaria os
  // dois modos. `sanitizarAssinaturaEmail` já barra isso no salvar também,
  // mas bloquear aqui evita a imagem aparecer no editor e sumir só depois.
  const bloquearImagemNoTexto = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const temImagem = Array.from(event.clipboardData.items).some((i) => i.type.startsWith('image/'));
    if (!temImagem) return;
    event.preventDefault();
    toast.error('Para usar uma imagem como assinatura, troque para o modo "Imagem".');
  };

  const temImagem = modo === 'imagem' && ehAssinaturaImagem(value);

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-1 border-b bg-muted/30 px-1 py-1">
        <button
          type="button"
          onClick={() => trocarModo('texto')}
          className={cn(
            'flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors',
            modo === 'texto' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Type className="h-3.5 w-3.5" /> Texto
        </button>
        <button
          type="button"
          onClick={() => trocarModo('imagem')}
          className={cn(
            'flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors',
            modo === 'imagem' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" /> Imagem
        </button>

        {modo === 'texto' && (
          <div className="ml-auto flex items-center gap-1">
            {/* `onMouseDown` com `preventDefault`: sem isto, o clique no botão tira o
                foco/seleção do editor ANTES do `onClick` rodar, e o "negrito" não
                teria mais em cima de qual texto aplicar. */}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => executar('bold')} title="Negrito">
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => executar('italic')} title="Itálico">
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => executar('underline')} title="Sublinhado">
              <Underline className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={abrirDialogoLink} title="Link">
              <LinkIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {modo === 'texto' ? (
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Assinatura de e-mail"
          data-placeholder="Ex: Atenciosamente, Fulano — Cargo"
          className="min-h-[100px] px-3 py-2 text-sm outline-none [&_a]:text-primary [&_a]:underline empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
          onInput={emitir}
          onPaste={bloquearImagemNoTexto}
        />
      ) : (
        <div
          tabIndex={0}
          onDragOver={arrastarImagem(true)}
          onDragEnter={arrastarImagem(true)}
          onDragLeave={arrastarImagem(false)}
          onDrop={soltarImagem}
          onPaste={colarImagem}
          className={cn(
            'flex flex-col items-center justify-center gap-2 px-3 py-4 outline-none transition-colors',
            imagemDragAtiva && 'bg-primary/5 ring-1 ring-inset ring-primary'
          )}
        >
          {temImagem ? (
            <>
              <img
                key={imagemVersion}
                src={`${getAssinaturaImagemUrl(userId)}?v=${imagemVersion}`}
                alt="Assinatura"
                className="max-h-24 max-w-full object-contain"
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" asChild disabled={isUploading} className="h-7 gap-1.5 text-xs">
                  <label className="cursor-pointer">
                    {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Trocar imagem
                    <input type="file" accept="image/*" onChange={selecionarImagemPorInput} disabled={isUploading} className="hidden" />
                  </label>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive" onClick={removerImagem} disabled={isUploading}>
                  <X className="h-3.5 w-3.5" /> Remover
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Arraste ou cole (Ctrl+V) uma nova imagem para trocar</p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Nenhuma imagem enviada</p>
              <Button type="button" variant="outline" size="sm" asChild disabled={isUploading} className="h-7 gap-1.5 text-xs">
                <label className="cursor-pointer">
                  {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {isUploading ? 'Enviando...' : 'Escolher imagem'}
                  <input type="file" accept="image/*" onChange={selecionarImagemPorInput} disabled={isUploading} className="hidden" />
                </label>
              </Button>
              <p className="text-[10px] text-muted-foreground">Ou arraste aqui, ou cole com Ctrl+V · PNG/JPG/WEBP · até 5MB</p>
            </>
          )}
        </div>
      )}

      {/* `readOnly` porque quem escreve aqui é o `useEffect`/`onInput`/upload
          acima, não digitação direta — React reclamaria de um controlado sem
          `onChange` próprio. */}
      <input type="hidden" name={name} value={value} readOnly />

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Inserir link</DialogTitle>
            <DialogDescription>Endereço para onde o link vai apontar.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmarLink();
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="assinatura-link-url">URL</Label>
              <Input
                id="assinatura-link-url"
                autoFocus
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={!linkUrl.trim()}>
                Inserir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
