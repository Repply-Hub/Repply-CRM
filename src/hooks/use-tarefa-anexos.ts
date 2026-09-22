import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { recusaSemErro } from '@/lib/recusa-do-banco';
import { recusaDoAnexoDeTarefa, nomeDoAnexo, ordenarAnexos } from '@/lib/anexos-de-tarefa';
import { sanitizeFileName } from '@/lib/file-validation';

/**
 * Os anexos de uma tarefa — e o ÚNICO lugar que fala com o balde `tarefa-anexos`.
 *
 * 🔴 Espelha `use-pedido-anexos.ts` (o gancho de anexo de negócio). Duas cópias do mesmo
 * upload é como o caminho da pasta da empresa se perde numa delas — e arquivo fora da pasta
 * da empresa fica invisível quando o balde fechar (`docs/operacao/plano-baldes-privados.md`).
 */

export interface AnexoDaTarefa {
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

function mapearLinha(l: LinhaDeAnexo): AnexoDaTarefa {
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

/** Os anexos de uma tarefa, mais novo em cima. */
export function useAnexosDaTarefa(tarefaId?: string | null) {
  return useQuery({
    queryKey: ['tarefa_anexos', tarefaId],
    queryFn: async (): Promise<AnexoDaTarefa[]> => {
      const { data, error } = await supabase
        .from('tarefa_anexos')
        .select('id, url, nome, tipo, tamanho_bytes, created_at')
        .eq('tarefa_id', tarefaId!);
      if (error) throw error;

      return ordenarAnexos((data ?? []) as LinhaDeAnexo[]).map(mapearLinha);
    },
    enabled: !!tarefaId,
    staleTime: 30_000,
  });
}

function invalidarLista(qc: QueryClient, tarefaId: string) {
  qc.invalidateQueries({ queryKey: ['tarefa_anexos', tarefaId] });
}

/**
 * Sobe um arquivo para a pasta da empresa no balde e prende a linha à tarefa.
 *
 * Função pura EXPORTADA (fora do hook) para o fluxo de CRIAR outra tarefa reutilizar o mesmo
 * envio+gravação sem precisar montar um `useMutation` só para isso.
 */
export async function enviarAnexoDeTarefa(
  tarefaId: string,
  arquivo: File,
  profile: { id: string; empresa_id: string },
): Promise<AnexoDaTarefa> {
  // A recusa de tipo/tamanho vem ANTES de qualquer rede: barrar aqui evita gastar o upload
  // inteiro — e o tempo de quem está numa obra, com internet ruim — num arquivo que já se sabe
  // que não vai entrar.
  const recusa = recusaDoAnexoDeTarefa(arquivo);
  if (recusa) throw new Error(recusa);

  // O `uuid` isola cada envio — é ele que evita colisão quando duas pessoas mandam arquivo de
  // mesmo nome para a mesma tarefa.
  const caminho = `${profile.empresa_id}/${crypto.randomUUID()}/${sanitizeFileName(arquivo.name)}`;

  const { error: erroDoEnvio } = await supabase.storage.from('tarefa-anexos').upload(caminho, arquivo);
  if (erroDoEnvio) throw erroDoEnvio;

  const { data: { publicUrl } } = supabase.storage.from('tarefa-anexos').getPublicUrl(caminho);

  const { data, error } = await supabase
    .from('tarefa_anexos')
    .insert({
      tarefa_id: tarefaId,
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
    // órfão no balde — sem erro nenhum na tela, e sem ele aparecer na lista da tarefa, porque
    // é a linha (não o arquivo) que a lista lê.
    throw new Error(
      `O arquivo foi enviado, mas não ficou preso a esta tarefa: ${mensagemDeErro(error)}. Tente anexar de novo.`,
    );
  }

  return mapearLinha(data as LinhaDeAnexo);
}

export function useAdicionarAnexoDaTarefa(tarefaId: string) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (arquivo: File): Promise<AnexoDaTarefa> => {
      // Sem empresa não há pasta onde gravar, e gravar fora dela deixaria o arquivo invisível
      // quando o balde fechar para leitura pública — mesma regra do upload que este gancho
      // substitui (`docs/operacao/plano-baldes-privados.md`, Passo 5).
      if (!profile?.empresa_id) {
        throw new Error('Sua empresa não foi identificada. Recarregue a página e tente de novo.');
      }
      if (!profile?.id) {
        throw new Error('Seu usuário não foi identificado. Recarregue a página e tente de novo.');
      }

      return enviarAnexoDeTarefa(tarefaId, arquivo, { id: profile.id, empresa_id: profile.empresa_id });
    },
    onSuccess: () => {
      invalidarLista(qc, tarefaId);
      toast.success('Anexo enviado.');
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível enviar o anexo.')),
  });
}

/** Tira um anexo da tarefa — só a linha; o arquivo no balde fica (não é este o passo que o apaga). */
export function useRemoverAnexoDaTarefa(tarefaId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (anexoId: string) => {
      const { error, count } = await supabase
        .from('tarefa_anexos')
        .delete({ count: 'exact' })
        .eq('id', anexoId)
        .eq('tarefa_id', tarefaId);
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
      invalidarLista(qc, tarefaId);
      toast.success('Anexo removido.');
    },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível remover o anexo.')),
  });
}
