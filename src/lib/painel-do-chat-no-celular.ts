/**
 * Abaixo de `md` (768px) o Chat (`src/pages/Chat.tsx`) mostra uma coisa por vez:
 * a lista de conversas OU, depois de tocar numa, só a conversa — nunca as duas
 * juntas (é o que, antes, espremia as duas colunas e deslocava a busca da lista
 * ~34px para fora da tela).
 *
 * Função pura só para não depender de string de classe CSS para acertar a regra:
 * o estado local `mostrarConversaNoCelular` (`useState`, começa `false`) decide
 * qual painel mostrar. `false` é a lista — inclusive na primeira renderização,
 * mesmo o alvo padrão sendo o Geral (regra 1 do brief).
 */
export type PainelChatCelular = 'lista' | 'conversa';

export function painelVisivelNoCelular(mostrarConversaNoCelular: boolean): PainelChatCelular {
  return mostrarConversaNoCelular ? 'conversa' : 'lista';
}

/**
 * `teamCollapsed` (`Chat.tsx`) é um `useState` comum: só sabe "recolhido" ou
 * não, sem noção de largura de tela. O botão que o alterna ("Recolher
 * equipe") só existe a partir de `md` (`hidden md:flex`) — mas o estado
 * continua valendo depois que a janela estreita, porque nada o zera. Alguém
 * recolhe a equipe em ≥768px, dá resize na janela (ou gira o tablet, ou
 * arrasta a régua de viewport do devtools) SEM remontar `/chat`, e a lista
 * renderiza a versão ESTREITA (ícones, `w-12` fixo, sem alternativa de
 * largura cheia) bem na hora em que a regra do celular manda ela ocupar a
 * tela inteira — sobra uma faixa de 48px e o resto em branco.
 *
 * Por isso o valor que chega no `collapsed` do `<MembersList>` não é
 * `teamCollapsed` puro: abaixo de `md` ele é sempre tratado como recolhido
 * = não. O `useState` original não é zerado (`setTeamCollapsed` nunca é
 * chamado por causa da largura) — ao alargar a janela de volta pra ≥768px,
 * a equipe reaparece recolhida do jeito que a pessoa tinha deixado, sem
 * surpresa.
 */
export function equipeRecolhidaEfetiva(teamCollapsed: boolean, isMobile: boolean): boolean {
  return teamCollapsed && !isMobile;
}
