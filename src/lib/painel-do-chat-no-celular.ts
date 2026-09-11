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
