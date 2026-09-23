/** Pares de cor (fundo suave + ícone forte) para a aparência de grupo/Geral.
 *  Preferência por tons claros no fundo, como o das Anotações. Cor livre pode
 *  ajustar fundo e ícone separadamente; estes são os atalhos da paleta. */
export interface ParDeCor {
  nome: string;
  fundo: string;
  icone: string;
}

export const CORES_DE_CHAT: readonly ParDeCor[] = [
  { nome: 'Laranja', fundo: '#FFE9E0', icone: '#FF5A1F' },
  { nome: 'Azul', fundo: '#E3F0FF', icone: '#2563EB' },
  { nome: 'Verde', fundo: '#E4F7EC', icone: '#16A34A' },
  { nome: 'Roxo', fundo: '#F1E9FF', icone: '#7C3AED' },
  { nome: 'Rosa', fundo: '#FFE7F1', icone: '#DB2777' },
  { nome: 'Âmbar', fundo: '#FFF3D6', icone: '#D97706' },
  { nome: 'Teal', fundo: '#DEF7F5', icone: '#0D9488' },
  { nome: 'Cinza', fundo: '#ECEEF1', icone: '#475569' },
];

/** Usadas quando a pessoa escolhe um símbolo mas ainda não mexeu na cor. */
export const COR_FUNDO_PADRAO = '#FFE9E0';
export const COR_ICONE_PADRAO = '#FF5A1F';
