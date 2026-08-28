import { useEffect, useMemo, useState, useRef } from 'react';
import { Plus, FolderOpen, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FilePreviewDialog, type FilePreviewTarget } from '@/components/chat/FilePreviewDialog';
import { supabase } from '@/integrations/supabase/client';
import { enderecoDoObjeto } from '@/lib/arquivo-privado';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { cn } from '@/lib/utils';
import { useIsGestor } from '@/hooks/use-novo-pedido';
import { useMinhaPermissao } from '@/hooks/use-minha-permissao';
import {
  useArquivosDaFabrica, useExcluirArquivo, BALDE,
  type ArquivoDaFabrica,
} from '@/hooks/use-fabricante-arquivos';
import { CartaoDeArquivo } from './CartaoDeArquivo';
import { AnexarArquivoDialog } from './AnexarArquivoDialog';
import { EditarArquivoDialog } from './EditarArquivoDialog';
import { EnviarCatalogoDialog } from './EnviarCatalogoDialog';
import { useQuery } from '@tanstack/react-query';

/**
 * O drive de catálogos da fábrica — a grade de cartões dentro da ficha do fabricante.
 *
 * Substitui o cartão "Catálogo de Produtos", removido em 26/08/2026 junto com o módulo de
 * cadastro de produto (commit acbcb415), que nunca teve dado real em nenhuma empresa.
 *
 * Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md
 *
 * 🔴 O BALDE É PRIVADO. Nenhum endereço daqui existe sem assinatura, e a assinatura vence.
 * Por isso os links são pedidos ao montar a lista e refeitos quando a lista muda — nunca
 * guardados no banco nem montados à mão.
 */

interface Props {
  fabricanteId: string;
  empresaId: string;
}

export function DriveDaFabrica({ fabricanteId }: Props) {
  const { data: arquivos, isLoading } = useArquivosDaFabrica(fabricanteId);
  const excluir = useExcluirArquivo();
  const { data: isGestor } = useIsGestor();
  const { permitido: temPermissaoExcluir } = useMinhaPermissao('fabricantes', 'excluir');
  const podeExcluir = !!isGestor || temPermissaoExcluir;

  // ⚠️ EDITAR usa a permissão de EDITAR, e aqui a tela é mais rígida que o banco: a política
  // `fabricante_arquivos_update` está aberta para qualquer pessoa da empresa, no mesmo espírito
  // do anexar ("um sobe, todos usam"). Ou seja, esconder este botão NÃO impede ninguém — quem
  // souber chamar o banco direto continua conseguindo.
  //
  // Escolhi assim mesmo assim porque o estrago de um metadado errado é coletivo: o mês manda na
  // ordem da prateleira, e renomear o catálogo da fábrica muda o que os treze da equipe veem.
  // Enquanto isso for só uma trava de tela, é conveniência, não segurança (CLAUDE.md §6.1) —
  // virar regra de verdade exige mudar a política no banco, e isso é decisão do Lucas.
  const { permitido: temPermissaoEditar } = useMinhaPermissao('fabricantes', 'editar');
  const podeEditar = !!isGestor || temPermissaoEditar;

  const [anexarAberto, setAnexarAberto] = useState(false);
  /**
   * Arrastar um arquivo para QUALQUER lugar do drive abre o diálogo com ele dentro.
   *
   * Antes só funcionava depois de abrir "Anexar" — e não era código nosso: é o
   * `<input type="file">` que aceita solta por conta própria. Quem arrastava para o drive
   * fechado via o navegador ABRIR o arquivo e a página do CRM sumir. Pedido do Lucas em
   * 28/08/2026.
   */
  const [arquivoArrastado, setArquivoArrastado] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  // 🔴 CONTADOR, e não booleano. `dragleave` dispara toda vez que o ponteiro cruza a borda de
  // um FILHO — e o drive é uma grade de cartões. Com booleano, o destaque pisca a cada cartão
  // que o arquivo sobrevoa. O contador só zera quando o arrasto sai do container de verdade.
  const profundidadeDoArrasto = useRef(0);

  const temArquivo = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const aoEntrarArrastando = (e: React.DragEvent) => {
    if (!temArquivo(e)) return;
    profundidadeDoArrasto.current += 1;
    setArrastando(true);
  };

  const aoSairArrastando = (e: React.DragEvent) => {
    if (!temArquivo(e)) return;
    profundidadeDoArrasto.current -= 1;
    if (profundidadeDoArrasto.current <= 0) {
      profundidadeDoArrasto.current = 0;
      setArrastando(false);
    }
  };

  const aoArrastarPorCima = (e: React.DragEvent) => {
    if (!temArquivo(e)) return;
    // 🔴 SEM ESTE `preventDefault` o navegador ABRE o arquivo e a pessoa perde a tela do CRM
    // — com o que estivesse preenchido junto. É o comportamento padrão de soltar arquivo
    // numa página, e ele vale mesmo que o `drop` abaixo exista.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const aoSoltar = (e: React.DragEvent) => {
    if (!temArquivo(e)) return;
    e.preventDefault();
    profundidadeDoArrasto.current = 0;
    setArrastando(false);

    const arquivos = Array.from(e.dataTransfer.files);
    if (arquivos.length === 0) return; // pasta ou item sem arquivo de verdade

    // O cadastro é de um material por vez — cada um tem nome, mês e ano próprios. Dizer que
    // só o primeiro entrou é melhor que aceitar em silêncio e a pessoa descobrir depois que
    // faltaram três.
    if (arquivos.length > 1) {
      toast.info(`Vai um material por vez. Comecei por "${arquivos[0].name}".`);
    }
    setArquivoArrastado(arquivos[0]);
    setAnexarAberto(true);
  };
  const [aEditar, setAEditar] = useState<ArquivoDaFabrica | null>(null);
  const [previa, setPrevia] = useState<FilePreviewTarget | null>(null);
  const [aExcluir, setAExcluir] = useState<ArquivoDaFabrica | null>(null);
  const [capas, setCapas] = useState<Record<string, string>>({});
  const [aEnviar, setAEnviar] = useState<ArquivoDaFabrica | null>(null);

  // O botão de enviar só existe para quem tem WhatsApp vinculado. É a MESMA consulta que a
  // função de servidor faz para descobrir de qual número o envio sai — se ela não achar
  // nada, o envio seria recusado com "seu WhatsApp não está vinculado", e mostrar um botão
  // que só serve para dar esse recado é pior que não mostrar botão.
  const { data: temWhatsapp } = useQuery({
    queryKey: ['tem-whatsapp-vinculado'],
    queryFn: async () => {
      const { data: sessao } = await supabase.auth.getUser();
      if (!sessao?.user) return false;
      const { count } = await supabase
        .from('wapi_instancia_usuarios')
        .select('instancia_id', { count: 'exact', head: true })
        .eq('usuario_auth_id', sessao.user.id);
      return (count ?? 0) > 0;
    },
  });

  // As capas, TODAS DE UMA VEZ. Pedir uma assinatura por cartão faria vinte chamadas em
  // paralelo cada vez que alguém abrisse uma fábrica.
  const comCapa = useMemo(
    () => (arquivos ?? []).filter((a) => a.capa_caminho),
    [arquivos],
  );

  useEffect(() => {
    let vivo = true;
    if (comCapa.length === 0) { setCapas({}); return; }
    void (async () => {
      const pares = await Promise.all(
        comCapa.map(async (a) => [a.id, await enderecoDoObjeto(BALDE, a.capa_caminho!)] as const),
      );
      if (!vivo) return;
      // Assinatura que falhou entra como ausente: o cartão mostra o ícone do formato. Uma
      // imagem quebrada seria pior que nenhuma imagem.
      setCapas(Object.fromEntries(pares.filter(([, url]) => !!url) as [string, string][]));
    })();
    return () => { vivo = false; };
  }, [comCapa]);

  const abrirPrevia = async (a: ArquivoDaFabrica) => {
    const url = await enderecoDoObjeto(BALDE, a.caminho);
    if (!url) { toast.error('Não foi possível abrir este arquivo agora. Tente de novo.'); return; }
    setPrevia({ url, nome: a.nome, mime: a.mime });
  };

  const baixar = async (a: ArquivoDaFabrica) => {
    const url = await enderecoDoObjeto(BALDE, a.caminho);
    if (!url) { toast.error('Não foi possível baixar este arquivo agora. Tente de novo.'); return; }
    // `window.open` e não `<a download>`: o endereço assinado é de outro domínio, e o atributo
    // `download` é ignorado entre domínios — o arquivo abriria na aba em vez de baixar.
    window.open(url, '_blank', 'noopener');
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      await excluir.mutateAsync({ ...aExcluir, fabricanteId });
      toast.success('Arquivo excluído.');
      setAExcluir(null);
    } catch (e) {
      toast.error(`Não foi possível excluir: ${mensagemDeErro(e)}`);
    }
  };

  return (
    <div
      onDragEnter={aoEntrarArrastando}
      onDragOver={aoArrastarPorCima}
      onDragLeave={aoSairArrastando}
      onDrop={aoSoltar}
      className={cn(
        'relative flex flex-1 flex-col min-h-0 rounded-xl border bg-card transition-colors',
        arrastando ? 'border-primary border-dashed bg-primary/5' : 'border-border',
      )}
    >
      {/* 🔴 `pointer-events-none` é o que faz o aviso funcionar. Um painel por cima da área de
          solta ROUBARIA o `drop` — o arquivo cairia no aviso, não no container que tem o
          handler, e o arrasto morreria em silêncio bem quando a pessoa vê "pode soltar". */}
      {arrastando && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80">
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-card-foreground">Solte para anexar</p>
            <p className="text-xs text-muted-foreground">Abre o cadastro com o arquivo já dentro</p>
          </div>
        </div>
      )}
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-card-foreground">
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
            Catálogos, folders e materiais
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Visível para toda a equipe. A edição mais nova aparece primeiro.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAnexarAberto(true)}>
          <Plus className="h-4 w-4" /> Anexar
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
          </div>
        ) : (arquivos ?? []).length === 0 ? (
          // O vazio CONVIDA. Espaço em branco onde havia conteúdo lê-se como "quebrou".
          <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="max-w-sm">
              <p className="text-sm font-medium text-card-foreground">Nenhum material ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Anexe o catálogo, o folder ou a tabela desta fábrica. Todo mundo da equipe passa
                a ver e usar.
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setAnexarAberto(true)}>
              <Plus className="h-4 w-4" /> Anexar o primeiro
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {arquivos!.map((a) => (
              <CartaoDeArquivo
                key={a.id}
                arquivo={a}
                capaUrl={capas[a.id] ?? null}
                podeEditar={podeEditar}
                podeExcluir={podeExcluir}
                ocupado={excluir.isPending}
                aoVer={() => void abrirPrevia(a)}
                aoBaixar={() => void baixar(a)}
                aoEditar={() => setAEditar(a)}
                aoExcluir={() => setAExcluir(a)}
                aoEnviar={temWhatsapp ? () => setAEnviar(a) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <AnexarArquivoDialog
        open={anexarAberto}
        // Esquece o arrastado ao fechar: sem isto, clicar em "Anexar" depois abriria com o
        // arquivo da vez anterior já dentro.
        onOpenChange={(aberto) => {
          setAnexarAberto(aberto);
          if (!aberto) setArquivoArrastado(null);
        }}
        fabricanteId={fabricanteId}
        arquivoInicial={arquivoArrastado}
      />

      {/* Fica montado o tempo todo, como os outros diálogos daqui: quem manda é o `open`.
          O formulário se reconstrói a partir do arquivo escolhido — ver o efeito lá dentro. */}
      <EditarArquivoDialog
        open={!!aEditar}
        onOpenChange={(o) => !o && setAEditar(null)}
        arquivo={aEditar}
        fabricanteId={fabricanteId}
      />

      <EnviarCatalogoDialog
        open={!!aEnviar}
        onOpenChange={(o) => !o && setAEnviar(null)}
        arquivo={aEnviar}
      />

      <FilePreviewDialog file={previa} onClose={() => setPrevia(null)} />

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{aExcluir?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo sai para toda a equipe, não só para você. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={excluir.isPending}
              onClick={(e) => { e.preventDefault(); void confirmarExclusao(); }}
            >
              {excluir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
