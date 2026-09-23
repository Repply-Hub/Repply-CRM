/** Pares de cor para a aparência de grupo/Geral. Cada cor tem duas versões:
 *  - clara: fundo suave + ícone na cor forte (`fundo`/`icone`);
 *  - escura: fundo na cor forte + ícone branco (`fundoEscuro`/`iconeEscuro`),
 *    o visual clássico do sistema. Cor livre ajusta fundo e ícone à parte. */
export interface ParDeCor {
  nome: string;
  fundo: string;
  icone: string;
  fundoEscuro: string;
  iconeEscuro: string;
}

const BRANCO = '#FFFFFF';

export const CORES_DE_CHAT: readonly ParDeCor[] = [
  { nome: 'Laranja', fundo: '#FFE9E0', icone: '#FF5A1F', fundoEscuro: '#FF5A1F', iconeEscuro: BRANCO },
  { nome: 'Azul', fundo: '#E3F0FF', icone: '#2563EB', fundoEscuro: '#2563EB', iconeEscuro: BRANCO },
  { nome: 'Verde', fundo: '#E4F7EC', icone: '#16A34A', fundoEscuro: '#16A34A', iconeEscuro: BRANCO },
  { nome: 'Roxo', fundo: '#F1E9FF', icone: '#7C3AED', fundoEscuro: '#7C3AED', iconeEscuro: BRANCO },
  { nome: 'Rosa', fundo: '#FFE7F1', icone: '#DB2777', fundoEscuro: '#DB2777', iconeEscuro: BRANCO },
  { nome: 'Âmbar', fundo: '#FFF3D6', icone: '#D97706', fundoEscuro: '#D97706', iconeEscuro: BRANCO },
  { nome: 'Teal', fundo: '#DEF7F5', icone: '#0D9488', fundoEscuro: '#0D9488', iconeEscuro: BRANCO },
  { nome: 'Cinza', fundo: '#ECEEF1', icone: '#475569', fundoEscuro: '#475569', iconeEscuro: BRANCO },
];

/** Usadas quando a pessoa escolhe um símbolo mas ainda não mexeu na cor:
 *  o laranja escuro + branco, o padrão clássico do sistema. */
export const COR_FUNDO_PADRAO = '#FF5A1F';
export const COR_ICONE_PADRAO = '#FFFFFF';
