/**
 * Os sons que a pessoa pode escolher para as próprias notificações.
 *
 * Puro de propósito: é a lista que a tela desenha e que `som.ts` consulta, e um id
 * que sumir da lista (som retirado no futuro) precisa cair no padrão sem erro — é a
 * regra que o teste trava.
 *
 * Rótulos: vieram da análise do áudio (notas, altura, duração) — ninguém da equipe
 * precisa decorar nome de arquivo. Trocar um rótulo é mexer só aqui.
 */
export type GrupoDoSom = 'padrao' | 'opcoes' | 'repply';

export interface SomDeNotificacao {
  id: string;
  rotulo: string;
  arquivo: string;
  grupo: GrupoDoSom;
}

export const SOM_PADRAO = 'padrao';

export const CATALOGO_DE_SONS: readonly SomDeNotificacao[] = [
  { id: SOM_PADRAO, rotulo: 'Padrão', arquivo: '/sons/notificacao.mp3', grupo: 'padrao' },
  { id: 'toque-suave', rotulo: 'Toque suave', arquivo: '/sons/opcoes/toque-suave.mp3', grupo: 'opcoes' },
  { id: 'plim', rotulo: 'Plim', arquivo: '/sons/opcoes/plim.mp3', grupo: 'opcoes' },
  { id: 'cristal', rotulo: 'Cristal', arquivo: '/sons/opcoes/cristal.mp3', grupo: 'opcoes' },
  { id: 'arpejo', rotulo: 'Arpejo', arquivo: '/sons/opcoes/arpejo.mp3', grupo: 'opcoes' },
  { id: 'pop', rotulo: 'Pop', arquivo: '/sons/opcoes/pop.mp3', grupo: 'opcoes' },
  { id: 'marimba', rotulo: 'Marimba', arquivo: '/sons/opcoes/marimba.mp3', grupo: 'repply' },
  { id: 'sino', rotulo: 'Sino', arquivo: '/sons/opcoes/sino.mp3', grupo: 'repply' },
  { id: 'gota', rotulo: 'Gota', arquivo: '/sons/opcoes/gota.mp3', grupo: 'repply' },
  { id: 'bipe-duplo', rotulo: 'Bipe duplo', arquivo: '/sons/opcoes/bipe-duplo.mp3', grupo: 'repply' },
];

export function somDoCatalogo(id: string | null | undefined): SomDeNotificacao {
  return CATALOGO_DE_SONS.find((s) => s.id === id) ?? CATALOGO_DE_SONS[0];
}
