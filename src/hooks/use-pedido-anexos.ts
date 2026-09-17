import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { recusaSemErro } from '@/lib/recusa-do-banco';
import { recusaDoAnexo, nomeDoAnexo, ordenarAnexos } from '@/lib/anexos-do-negocio';
import { sanitizeFileName } from '@/lib/file-validation';

/**
 * Os anexos de um negócio — e o ÚNICO lugar que fala com o balde `pedido-anexos`.
 *
 * 🔴 O trecho de envio estava copiado em `NovoNegocioDialog` e `EditarPedido`. Duas cópias do
 * mesmo upload é como o caminho da pasta da empresa se perde numa delas — e arquivo fora da
 * pasta da empresa fica invisível quando o balde fechar (`docs/operacao/plano-baldes-privados.md`).
 */

export interface AnexoDoNegocio {
  id: string;
  url: string;
  nome: string;
  tipo: string | null;
  tamanhoBytes: number | null;
  criadoEm: string;
}

interface LinhaDeAnexo {
  id: string;
  url: string;
  nome: string;
  tipo: string | null;
  tamanho_bytes: number | null;
  created_at: string;
}

function mapearLinha(l: LinhaDeAnexo): AnexoDoNegocio {
  return {
    id: l.id,
    url: l.url,
    // Defesa igual à da migration que copiou o `pdf_url` antigo: a coluna é NOT NULL, mas isso
    // não impede string vazia. Melhor tirar um nome do endereço que mostrar uma linha muda.
    nome: l.nome || nomeDoAnexo(l.url),
    tipo: l.tipo,
    tamanhoBytes: l.tamanho_bytes,
    criadoEm: l.created_at,
  };
}

/** Os anexos de um negócio, mais novo em cima. */
export function useAnexosDoNegocio(pedidoId?: string | null) {
  return useQuery({
    queryKey: ['pedido_anexos', pedidoId],
    queryFn: async (): Promise<AnexoDoNegocio[]> => {
      const { data, error } = await supabase
        .from('pedido_anexos')
        .select('id, url, nome, tipo, tamanho_bytes, created_at')
        .eq('pedido_id', pedidoId!);
      if (error) throw error;

      return ordenarAnexos((data ?? []) as LinhaDeAnexo[]).map(mapearLinha);
    },
    enabled: !!pedidoId,
    staleTime: 30_000,
  });
}

function invalidarLista(qc: QueryClient, pedidoId: string) {
  qc.invalidateQueries({ queryKey: ['pedido_anexos', pedidoId] });
}

/**
 * Sobe um arquivo para a pasta da empresa no balde e prende a linha ao negócio.
 */
export function useAdicionarAnexo(pedidoId: string) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (arquivo: File): Promise<AnexoDoNegocio> => {
      // A recusa de tipo/tamanho vem ANTES de qualquer rede: barrar aqui evita gastar o upload
      // inteiro — e o tempo de quem está numa obra, com internet ruim — num arquivo que já se
      // sabe que não vai entrar.
      const recusa = recusaDoAnexo(arquivo);
      if (recusa) throw new Error(recusa);

      // Sem empresa não há pasta onde gravar, e gravar fora dela deixaria o arquivo invisível
      // quando o balde fechar para leitura pública — mesma regra do upload que este gancho
      // substitui (`docs/operacao/plano-baldes-privados.md`, Passo 5).
      if (!profile?.empresa_id) {
        throw new Error('Sua empresa não foi identificada. Recarregue a página e tente de novo.');
      }

      // O `uuid` isola cada envio — é ele que evita colisão quando duas pessoas mandam arquivo
      // de mesmo nome para o mesmo negócio.
      const caminho = `${profile.empresa_id}/${crypto.randomUUID()}/${sanitizeFileName(arquivo.name)}`;

      const { error: erroDoEnvio } = await supabase.storage
        .from('pedido-anexos')
        .upload(caminho, arquivo);
      if (erroDoEnvio) throw erroDoEnvio;

      const { data: { publicUrl } } = supabase.storage.from('pedido-anexos').getPublicUrl(caminho);

      const { data, error } = await supabase
        .from('pedido_anexos')
        .insert({
          pedido_id: pedidoId,
          url: publicUrl,
          // O nome que a PESSOA reconhece — não o sanitizado acima, que é só a chave no balde.
          // "Orcamento_Obra_Exemplo.pdf" não é o que ela via no computador dela.
          nome: arquivo.name,
          tipo: arquivo.type || null,
          tamanho_bytes: arquivo.size,
          criado_por: profile.id,
        })
        .select('id, url, nome, tipo, tamanho_bytes, created_at')
        .single();

      if (error) {
        // 🔴 O ARQUIVO JÁ SUBIU quando a linha falha aqui. Fingir sucesso deixaria um arquivo
        // órfão no balde — sem erro nenhum na tela, e sem ele aparecer na lista do negócio,
        // porque é a linha (não o arquivo) que a lista lê.
        throw new Error(
          `O arquivo foi enviado, mas não ficou preso a este negócio: ${mensagemDeErro(error)}. Tente anexar de novo.`,
        );
      }

      return mapearLinha(data as LinhaDeAnexo);
    },
    onSuccess: () => {
      invalidarLista(qc, pedidoId);
      toast.success('Anexo enviado.');
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível enviar o anexo.')),
  });
}

export interface AnexoParaHerdar {
  url: string;
  nome: string;
  tipo: string | null;
}

/**
 * Herda anexos de outro negócio — insere uma linha por item, apontando para o MESMO arquivo do
 * original. SEM upload: é a cópia do "Duplicar negócio" (pacote 3) reaproveitando os arquivos
 * que já estão no balde, nunca duplicando-os. É o irmão do `useAdicionarAnexo`, mas para anexo
 * que JÁ tem URL — pense num `INSERT` em lote no lugar do `INSERT` de um só.
 */
export function useHerdarAnexos(pedidoId: string) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (anexos: AnexoParaHerdar[]): Promise<void> => {
      // Lista vazia não faz nada — nem checa empresa, nem toca o banco. Duplicar um negócio
      // sem anexo nenhum é o caso mais comum.
      if (anexos.length === 0) return;

      if (!profile?.id) {
        throw new Error('Sua empresa não foi identificada. Recarregue a página e tente de novo.');
      }

      const { error } = await supabase.from('pedido_anexos').insert(
        anexos.map((a) => ({
          pedido_id: pedidoId,
          url: a.url,
          nome: a.nome,
          tipo: a.tipo,
          criado_por: profile.id,
        })),
      );
      if (error) throw error;
    },
    onSuccess: (_data, anexos) => {
      if (anexos.length === 0) return;
      invalidarLista(qc, pedidoId);
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível herdar os anexos.')),
  });
}

/** Tira um anexo do negócio — só a linha; o arquivo no balde fica (não é este o passo que o apaga). */
export function useRemoverAnexo(pedidoId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (anexoId: string) => {
      const { error, count } = await supabase
        .from('pedido_anexos')
        .delete({ count: 'exact' })
        .eq('id', anexoId)
        .eq('pedido_id', pedidoId);
      if (error) throw error;

      // 🔴 ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6). A regra de segurança barra o DELETE sem
      // erro nenhum: o `USING` da política não acha a linha, o banco apaga zero registros e a
      // resposta volta com `error: null`. `count === 0`, nunca `!count` — `count` vem `null`
      // quando a resposta não traz o cabeçalho de contagem, e tratar `null` como recusa
      // gritaria "não removeu" em cima de uma remoção que funcionou.
      if (count === 0) {
        throw new Error(
          recusaSemErro(
            'O anexo NÃO foi removido: ele continua na lista.',
            'Remover anexo é uma permissão à parte, e o seu usuário não tem.',
          ),
        );
      }
    },
    onSuccess: () => {
      invalidarLista(qc, pedidoId);
      toast.success('Anexo removido.');
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível remover o anexo.')),
  });
}
