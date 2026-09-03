import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFileName } from '@/lib/file-validation';

/**
 * Anexos de UM rascunho de e-mail.
 *
 * 🔴 O balde `email-anexos` é PRIVADO — diferente do `email-assets` (logo/assinatura),
 * que é público porque a logo precisa de URL aberta no corpo do e-mail. Anexo é
 * proposta, contrato, tabela de preços: nenhum endereço daqui abre sem sessão.
 * Quem envia é a função de servidor `email-enviar`, que lê o binário com a chave
 * de serviço, repassa ao Nylas via multipart e depois apaga balde + linhas.
 *
 * O caminho é `{empresa_id}/{usuario_id}/{rascunho_id}/{uuid}.{ext}` — as duas
 * primeiras pastas são o que a RLS do balde usa para recusar quem é de outra
 * empresa ou outro usuário (anexo de rascunho é pessoal).
 */

export const BALDE_EMAIL_ANEXOS = 'email-anexos';

export interface AnexoDeRascunho {
  id: string;
  rascunho_id: string;
  nome_arquivo: string;
  caminho: string;
  tamanho: number;
  mime: string | null;
  created_at: string;
}

function chave(rascunhoId?: string | null) {
  return ['email_rascunho_anexos', rascunhoId] as const;
}

function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf('.');
  if (i <= 0) return '';
  return nome.slice(i).toLowerCase().replace(/[^a-z0-9.]/g, '');
}

export function useEmailAnexos(
  rascunhoId: string | null,
  identidade: { empresaId?: string | null; usuarioId?: string | null },
) {
  const queryClient = useQueryClient();
  const { empresaId, usuarioId } = identidade;

  const { data: anexos = [], isLoading } = useQuery({
    queryKey: chave(rascunhoId),
    enabled: !!rascunhoId,
    queryFn: async (): Promise<AnexoDeRascunho[]> => {
      const { data, error } = await supabase
        .from('email_rascunho_anexos')
        .select('id, rascunho_id, nome_arquivo, caminho, tamanho, mime, created_at')
        .eq('rascunho_id', rascunhoId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  /**
   * Sobe os arquivos JÁ VALIDADOS (extensão/tamanho conferidos por quem chama).
   *
   * `alvo` é passado explicitamente, não lido do `rascunhoId` do render: ao
   * anexar num compositor cujo rascunho acabou de ser criado, o `setRascunhoId`
   * ainda não propagou até aqui. Quem chama passa o id que tem em mãos.
   */
  const subirMutation = useMutation({
    mutationFn: async ({ arquivos, alvo }: { arquivos: File[]; alvo: string }) => {
      if (!empresaId || !usuarioId) {
        throw new Error('Perfil ainda não carregou.');
      }
      for (const arquivo of arquivos) {
        const nomeSeguro = sanitizeFileName(arquivo.name);
        const caminho = `${empresaId}/${usuarioId}/${alvo}/${crypto.randomUUID()}${extensaoDe(nomeSeguro)}`;

        const { error: erroUpload } = await supabase.storage
          .from(BALDE_EMAIL_ANEXOS)
          .upload(caminho, arquivo, {
            contentType: arquivo.type || 'application/octet-stream',
            upsert: false,
          });
        if (erroUpload) throw erroUpload;

        const { error: erroLinha } = await supabase.from('email_rascunho_anexos').insert({
          rascunho_id: alvo,
          empresa_id: empresaId,
          usuario_id: usuarioId,
          // Guarda o nome ORIGINAL (com acento e espaço) — é o que o
          // destinatário vê. O caminho no balde é que precisa ser são.
          nome_arquivo: arquivo.name,
          caminho,
          tamanho: arquivo.size,
          mime: arquivo.type || null,
        });
        if (erroLinha) {
          // Linha não gravou: não deixa o binário órfão no balde.
          await supabase.storage.from(BALDE_EMAIL_ANEXOS).remove([caminho]);
          throw erroLinha;
        }
      }
    },
    onSuccess: (_data, { alvo }) => {
      queryClient.invalidateQueries({ queryKey: chave(alvo) });
      queryClient.invalidateQueries({ queryKey: ['email_rascunhos'] });
    },
  });

  const removerMutation = useMutation({
    mutationFn: async (anexo: AnexoDeRascunho) => {
      await supabase.storage.from(BALDE_EMAIL_ANEXOS).remove([anexo.caminho]);
      const { error } = await supabase.from('email_rascunho_anexos').delete().eq('id', anexo.id);
      if (error) throw error;
    },
    onSuccess: (_data, anexo) => {
      queryClient.invalidateQueries({ queryKey: chave(anexo.rascunho_id) });
      queryClient.invalidateQueries({ queryKey: ['email_rascunhos'] });
    },
  });

  /**
   * Apaga TODOS os arquivos de um rascunho do balde. As linhas somem sozinhas
   * pelo `on delete cascade` quando o rascunho é descartado — mas o binário no
   * balde não, então isto tem de rodar ANTES de apagar a linha do rascunho.
   */
  async function limparBaldeDoRascunho(alvo: string): Promise<void> {
    const { data } = await supabase
      .from('email_rascunho_anexos')
      .select('caminho')
      .eq('rascunho_id', alvo);
    const caminhos = (data ?? []).map((r) => r.caminho).filter(Boolean);
    if (caminhos.length) {
      await supabase.storage.from(BALDE_EMAIL_ANEXOS).remove(caminhos);
    }
  }

  return {
    anexos,
    carregando: isLoading,
    /** `alvo` = o `rascunho_id` a que prender os arquivos (pode não ser o do render ainda). */
    subir: (arquivos: File[], alvo: string) => subirMutation.mutateAsync({ arquivos, alvo }),
    subindo: subirMutation.isPending,
    remover: removerMutation.mutateAsync,
    removendo: removerMutation.isPending,
    limparBaldeDoRascunho,
  };
}
