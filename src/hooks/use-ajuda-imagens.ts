import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { recusaSemErro } from '@/lib/recusa-do-banco';

/**
 * Uma imagem por espaço reservado da página de Ajuda (`topico.imagem.chave`, ver
 * `src/content/ajuda-conteudo.ts`). Global, não por empresa: a Ajuda é a mesma para todo
 * mundo, e só o admin da plataforma grava (migration `20260915090000_ajuda_imagens.sql`).
 */

const BALDE = 'ajuda-imagens';
const CHAVE_DA_QUERY = ['ajuda_imagens'];

export interface ImagemDaAjuda {
  chave: string;
  path: string;
  atualizadoEm: string;
  url: string;
}

function montarUrl(path: string, atualizadoEm: string): string {
  const { data } = supabase.storage.from(BALDE).getPublicUrl(path);
  // O `?v=` não é enfeite: o caminho é sempre <chave>.<extensão>, então sem um endereço novo
  // a cada envio o navegador continuaria mostrando a imagem anterior (mesmo motivo do
  // CampoDeLogoDaEmpresa.tsx).
  return `${data.publicUrl}?v=${encodeURIComponent(atualizadoEm)}`;
}

export function useAjudaImagens() {
  return useQuery({
    queryKey: CHAVE_DA_QUERY,
    queryFn: async () => {
      const { data, error } = await supabase.from('ajuda_imagens').select('chave, path, atualizado_em');
      if (error) throw error;

      const mapa = new Map<string, ImagemDaAjuda>();
      for (const row of data ?? []) {
        mapa.set(row.chave, {
          chave: row.chave,
          path: row.path,
          atualizadoEm: row.atualizado_em,
          url: montarUrl(row.path, row.atualizado_em),
        });
      }
      return mapa;
    },
    staleTime: 5 * 60_000,
  });
}

export function useEnviarImagemDaAjuda() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      chave,
      arquivo,
      caminhoAnterior,
    }: {
      chave: string;
      arquivo: File;
      /** Caminho já gravado para esta chave, se houver — para apagar o arquivo velho depois. */
      caminhoAnterior?: string;
    }) => {
      const extensao = (arquivo.name.split('.').pop() || 'png').toLowerCase();
      const path = `${chave}.${extensao}`;

      const { error: erroDoEnvio } = await supabase.storage
        .from(BALDE)
        .upload(path, arquivo, { upsert: true, contentType: arquivo.type || undefined });
      if (erroDoEnvio) throw erroDoEnvio;

      const { data, error } = await supabase
        .from('ajuda_imagens')
        .upsert(
          { chave, path, atualizado_em: new Date().toISOString(), atualizado_por: profile?.id },
          { onConflict: 'chave' },
        )
        .select('chave');
      if (error) throw error;
      // Recusa da regra de segurança não devolve erro: devolve sucesso com zero linhas.
      if (!data?.length) {
        throw new Error(
          recusaSemErro('A imagem não foi salva.', 'Só o admin da plataforma pode enviar imagens da Ajuda.'),
        );
      }

      // O caminho mudou de extensão (era .jpg, virou .png, por exemplo): tira o arquivo velho
      // para não deixar lixo público no balde.
      if (caminhoAnterior && caminhoAnterior !== path) {
        await supabase.storage.from(BALDE).remove([caminhoAnterior]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE_DA_QUERY });
    },
  });
}

export function useRemoverImagemDaAjuda() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chave, path }: { chave: string; path: string }) => {
      const { error, count } = await supabase.from('ajuda_imagens').delete({ count: 'exact' }).eq('chave', chave);
      if (error) throw error;
      if (count === 0) {
        throw new Error(
          recusaSemErro(
            'A imagem NÃO foi removida: ela continua na página.',
            'Só o admin da plataforma pode remover imagens da Ajuda.',
          ),
        );
      }
      await supabase.storage.from(BALDE).remove([path]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE_DA_QUERY });
    },
  });
}
