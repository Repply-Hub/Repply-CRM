import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { sanitizeFileName } from '@/lib/file-validation';

/**
 * Os catálogos, folders e materiais de cada fabricante.
 *
 * Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md
 *
 * 🔴 O BALDE É PRIVADO. Diferente dos outros 6 baldes deste projeto, que são abertos e estão
 * sendo fechados pela outra frente de trabalho, este nasceu fechado. Nenhum endereço daqui
 * abre sem assinatura — quem for mostrar arquivo na tela usa `enderecoDoObjeto`
 * (`src/lib/arquivo-privado.ts`), nunca monta URL à mão.
 */

export const BALDE = 'fabricante-arquivos';

/**
 * 50 MB. Abaixo do teto do WhatsApp para documento, DE PROPÓSITO: empatar com ele faria o
 * arquivo subir bonito, aparecer no drive, e falhar só na hora do envio — na frente do
 * cliente. Ver o desenho §5.2.
 */
export const TETO_BYTES = 50 * 1024 * 1024;

export interface ArquivoDaFabrica {
  id: string;
  nome: string;
  caminho: string;
  capa_caminho: string | null;
  tamanho: number;
  mime: string | null;
  edicao_ano: number;
  edicao_mes: number | null;
  enviado_por: string | null;
  created_at: string;
}

function chave(fabricanteId?: string | null) {
  return ['fabricante-arquivos', fabricanteId] as const;
}

export function useArquivosDaFabrica(fabricanteId?: string | null) {
  return useQuery({
    queryKey: chave(fabricanteId),
    enabled: !!fabricanteId,
    queryFn: async (): Promise<ArquivoDaFabrica[]> => {
      const { data, error } = await supabase
        .from('fabricante_arquivos' as never)
        .select('*')
        .eq('fabricante_id', fabricanteId!)
        .order('edicao_ano', { ascending: false })
        // 🔴 `nullsFirst: false` NÃO é detalhe. Em ordem decrescente o Postgres põe NULO
        // PRIMEIRO, então sem isto o catálogo do ANO ("2026") apareceria acima da edição de
        // setembro do mesmo ano — o inverso do que a pessoa precisa ver. Medido no banco em
        // 26/08/2026, e fixado em teste em `compararPorEdicao` (src/lib/fabricante-arquivos.ts).
        .order('edicao_mes', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ArquivoDaFabrica[];
    },
  });
}

export interface NovoArquivo {
  fabricanteId: string;
  arquivo: File;
  nome: string;
  edicaoAno: number;
  edicaoMes: number | null;
  /** A capa da 1ª página, quando o arquivo é PDF e deu para gerar. Ver `capa-do-pdf.ts`. */
  capa: Blob | null;
}

export function useAnexarArquivo() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (args: NovoArquivo) => {
      const empresaId = profile?.empresa_id ?? profile?.empresas?.id;
      if (!empresaId) throw new Error('Sem empresa definida');
      if (args.arquivo.size > TETO_BYTES) throw new Error('Arquivo acima de 50 MB');

      // A PRIMEIRA pasta do caminho é o `empresa_id`, e é ela que a política do Storage usa
      // para recusar quem é de outra empresa. Não é organização visual — é a trava.
      const id = crypto.randomUUID();
      const pasta = `${empresaId}/${args.fabricanteId}`;
      const caminho = `${pasta}/${id}-${sanitizeFileName(args.arquivo.name)}`;
      const capaCaminho = args.capa ? `${pasta}/capas/${id}.jpg` : null;

      const { error: erroArquivo } = await supabase.storage
        .from(BALDE)
        .upload(caminho, args.arquivo, { contentType: args.arquivo.type || undefined });
      if (erroArquivo) throw erroArquivo;

      if (args.capa && capaCaminho) {
        // A capa falhar não derruba o anexo: o cartão cai no ícone do formato. Trocar a
        // funcionalidade pelo enfeite dela seria o pior negócio possível.
        const { error: erroCapa } = await supabase.storage
          .from(BALDE)
          .upload(capaCaminho, args.capa, { contentType: 'image/jpeg' });
        if (erroCapa) console.warn('capa não subiu:', erroCapa.message);
      }

      const { error: erroLinha } = await supabase.from('fabricante_arquivos' as never).insert({
        empresa_id: empresaId,
        fabricante_id: args.fabricanteId,
        nome: args.nome.trim() || args.arquivo.name,
        caminho,
        capa_caminho: capaCaminho,
        tamanho: args.arquivo.size,
        mime: args.arquivo.type || null,
        edicao_ano: args.edicaoAno,
        edicao_mes: args.edicaoMes,
        // 🔴 `profile.id`, que é o `usuarios.id` — a coluna aponta para `usuarios(id)`.
        // NÃO é `user_id` aqui. As colunas "quem fez" deste banco se dividem entre os dois e
        // não dá para saber qual pelo nome: `configuracoes_automacao.updated_by` quer o outro,
        // e mandar o errado faz a gravação inteira ser recusada em silêncio. CLAUDE.md §4.5.
        enviado_por: profile?.id ?? null,
      } as never);

      if (erroLinha) {
        // 🔴 A LINHA FALHOU: apaga o que já subiu antes de propagar o erro.
        //
        // Sem isto, cada falha de rede deixa um arquivo de até 50 MB no balde que nenhuma tela
        // mostra e ninguém consegue apagar. É assim que um balde engorda sem explicação — e a
        // conta chega meses depois, sem ninguém saber de onde veio.
        await supabase.storage.from(BALDE).remove(
          capaCaminho ? [caminho, capaCaminho] : [caminho],
        );
        throw erroLinha;
      }
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: chave(args.fabricanteId) });
    },
  });
}

export function useExcluirArquivo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (arquivo: ArquivoDaFabrica & { fabricanteId: string }) => {
      // 🔴 O OBJETO SAI ANTES DA LINHA, e a ordem importa.
      //
      // Apagar a linha primeiro deixaria o arquivo no balde para sempre: some da tela, some do
      // banco, e continua ocupando espaço sem nada apontando para ele. Se o Storage recusar
      // (a política exige gestor ou permissão de excluir), a linha NÃO é apagada e a pessoa vê
      // o erro — em vez de a tela dizer que sumiu enquanto o arquivo continua lá.
      const alvos = arquivo.capa_caminho
        ? [arquivo.caminho, arquivo.capa_caminho]
        : [arquivo.caminho];

      const { error: erroObjeto } = await supabase.storage.from(BALDE).remove(alvos);
      if (erroObjeto) throw erroObjeto;

      const { error: erroLinha } = await supabase
        .from('fabricante_arquivos' as never)
        .delete()
        .eq('id', arquivo.id);
      if (erroLinha) throw erroLinha;
    },
    onSuccess: (_d, arquivo) => {
      qc.invalidateQueries({ queryKey: chave(arquivo.fabricanteId) });
    },
  });
}
