import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { caminhoDaLogo, prepararLogo } from '@/lib/logo-da-empresa';

/**
 * O campo onde o gestor sobe a logo da empresa.
 *
 * 🔴 É A MESMA LOGO DE TUDO. Ela vai para o cabeçalho dos PDFs exportados (negócios, painel,
 * conversas) e para o rodapé da assinatura de e-mail. Antes de 31/08/2026 esses lugares
 * carregavam a marca da MD Representações chumbada no código — para as dez empresas.
 *
 * 🔴 QUEM NÃO SUBIR NADA NÃO FICA SEM NADA. O PDF sai com a logo da Repply e o nome da empresa
 * escrito. É o caminho normal, não um erro: a maioria dos assinantes vai ficar assim.
 */

interface Props {
  empresaId: string;
  /** A logo atual. `null` quando ainda não há. */
  logoUrl: string | null;
  /** Chamado depois de gravar, com a URL nova (ou `null` ao remover). */
  aoMudar?: (url: string | null) => void;
}

export function CampoDeLogoDaEmpresa({ empresaId, logoUrl, aoMudar }: Props) {
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['minha_empresa'] });
    qc.invalidateQueries({ queryKey: ['empresas_admin'] });
    // O perfil carrega a empresa embutida, e é de lá que os PDFs leem a logo. Sem isto, a
    // exportação seguiria com a logo antiga até a pessoa recarregar a página.
    qc.invalidateQueries({ queryKey: ['usuarios'] });
  };

  /** Grava a URL na empresa, conferindo que o banco realmente aceitou. */
  const gravarNaEmpresa = async (url: string | null) => {
    const { data, error } = await supabase
      .from('empresas')
      .update({ logo_url: url })
      .eq('id', empresaId)
      .select('id');
    if (error) throw error;
    // Recusa da regra de segurança não devolve erro: devolve sucesso com zero linhas.
    if (!data?.length) {
      throw new Error('A logo não foi salva: o banco não autorizou esta alteração.');
    }
  };

  const enviar = async (file: File) => {
    setEnviando(true);
    try {
      const preparo = await prepararLogo(file);

      const { error: erroDoEnvio } = await supabase.storage
        .from('branding')
        .upload(caminhoDaLogo(empresaId), preparo.blob, {
          upsert: true,
          contentType: 'image/png',
        });
      if (erroDoEnvio) throw erroDoEnvio;

      const { data } = supabase.storage.from('branding').getPublicUrl(caminhoDaLogo(empresaId));
      // 🔴 O `?v=` NÃO É ENFEITE. O caminho é sempre o mesmo (`<empresa>/logo.png`), então sem
      // um endereço novo o navegador — e o servidor de imagens — continuariam entregando a
      // logo ANTERIOR por horas depois da troca.
      const url = `${data.publicUrl}?v=${Date.now()}`;

      await gravarNaEmpresa(url);
      invalidar();
      aoMudar?.(url);

      if (preparo.quaseInvisivelNoBranco) {
        // Avisa, não recusa: pode ser exatamente a versão que a pessoa quer usar.
        toast.warning(
          'Logo salva — mas ela é muito clara e pode sumir no PDF, que tem fundo branco. Se tiver uma versão escura da marca, prefira ela.',
          { duration: 9000 },
        );
      } else {
        toast.success('Logo da empresa atualizada.');
      }
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível salvar a logo.'));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remover = async () => {
    setEnviando(true);
    try {
      // A linha primeiro, o arquivo depois. Se a ordem fosse a inversa e a gravação falhasse,
      // a empresa ficaria apontando para um arquivo que não existe mais — e o PDF sairia sem
      // logo e sem o nome, porque a URL ainda estaria preenchida.
      await gravarNaEmpresa(null);
      await supabase.storage.from('branding').remove([caminhoDaLogo(empresaId)]);
      invalidar();
      aoMudar?.(null);
      toast.success('Logo removida. As exportações voltam a sair com o nome da empresa.');
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível remover a logo.'));
    } finally {
      setEnviando(false);
    }
  };

  const escolher = (arquivos: FileList | null) => {
    const file = arquivos?.[0];
    if (file) void enviar(file);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="logo-da-empresa">Logo da empresa</Label>

      <div
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
        className={`flex flex-wrap items-center gap-4 rounded-lg border border-dashed p-4 transition-colors ${
          arrastando ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        {/* O quadro tem fundo branco fixo, e não o fundo do tema: é assim que a logo vai
            aparecer no PDF. Mostrar sobre o fundo escuro do sistema esconderia justamente o
            problema da logo clara. */}
        <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo da empresa"
              className="max-h-14 max-w-24 object-contain"
            />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground/60" aria-hidden />
          )}
        </div>

        <div className="min-w-[200px] flex-1 space-y-1">
          <p className="text-sm text-muted-foreground">
            Entra no topo dos PDFs que você exporta e na assinatura dos e-mails, ao lado da
            marca da Repply.
          </p>
          <p className="text-xs text-muted-foreground">
            Sem logo, sai o nome da empresa. PNG, JPG ou WEBP, até 5 MB — arraste aqui ou
            escolha o arquivo.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <input
            id="logo-da-empresa"
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => escolher(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
          >
            {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {logoUrl ? 'Trocar' : 'Escolher arquivo'}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={enviando}
              onClick={() => void remover()}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
