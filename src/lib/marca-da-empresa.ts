import type { MarcaDaEmpresa } from '@/lib/marca-do-pdf';

/**
 * Extrai do perfil a identidade da empresa que vai no cabeçalho dos PDFs.
 *
 * 🔴 NÃO FAZ CONSULTA, e isso é o ponto. O `useAuth` já busca `"*, empresas(*)"` — nome, nome
 * fantasia e `logo_url` estão em memória desde o login. Uma consulta nova aqui atrasaria a
 * exportação para reler o que a tela já tinha.
 *
 * Função pura, fora do React, pelo mesmo motivo dos geradores: dá para fixar em teste sem
 * simular nada.
 */

interface EmpresaDoPerfil {
  nome?: unknown;
  nome_fantasia?: unknown;
  logo_url?: unknown;
}

interface PerfilComEmpresa {
  empresas?: EmpresaDoPerfil | null;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function marcaDaEmpresa(profile: PerfilComEmpresa | null | undefined): MarcaDaEmpresa {
  const empresa = profile?.empresas ?? null;

  return {
    /**
     * 🔴 NOME FANTASIA NA FRENTE DA RAZÃO SOCIAL. O PDF sai do sistema e vai para o cliente do
     * representante: ali vale o nome pelo qual a empresa é conhecida, não
     * "PR & COCENTINO REPRESENTACOES COMERCIAIS LTDA".
     *
     * E o último recurso é STRING VAZIA, não um nome inventado. Sem nome, o cabeçalho
     * simplesmente não escreve nada — melhor que estampar "Minha empresa" num documento que
     * vai para fora.
     */
    nome: texto(empresa?.nome_fantasia) ?? texto(empresa?.nome) ?? '',
    logoUrl: texto(empresa?.logo_url),
  };
}
