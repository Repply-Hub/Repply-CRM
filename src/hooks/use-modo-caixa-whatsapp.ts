import { useAuth } from '@/hooks/use-auth';
import { modoCaixaDaEmpresa, type ModoCaixaWhatsapp } from '@/lib/modo-caixa-whatsapp';

/**
 * Modo da caixa de WhatsApp da empresa do usuário logado. Lê o campo já presente no perfil
 * (profile.empresas.whatsapp_lista_unica), então não faz consulta nova nem invalida nada.
 */
export function useModoCaixaWhatsapp(): { modo: ModoCaixaWhatsapp; listaUnica: boolean } {
  const { profile } = useAuth();
  const listaUnica = !!profile?.empresas?.whatsapp_lista_unica;
  return { modo: modoCaixaDaEmpresa(listaUnica), listaUnica };
}
