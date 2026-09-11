/**
 * A moldura da pauta, para os blocos do Radar que usam `Card`.
 *
 * A pauta (`ItemPauta`, em `src/pages/Hoje.tsx`) desenha cada item com a borda de força total e
 * nenhuma sombra — e é por isso que ela se destaca no tema claro, onde cartão e fundo são o mesmo
 * branco (`--card` e `--background` em `0 0% 100%`, `src/index.css`). O `Card` traz de fábrica a
 * borda a 30%, uma sombra e um efeito ao passar o mouse (`src/components/ui/card.tsx`); no branco
 * sobre branco, a borda some.
 *
 * Estas classes vencem as da base porque `cn` usa tailwind-merge: a última classe de cada grupo
 * fica. A primitiva não é editada — ela serve o sistema inteiro (CLAUDE.md §5.4).
 *
 * Sem efeito de mouse DE PROPÓSITO: nenhum destes blocos é clicável como um todo, e o efeito
 * prometia um clique que não existe. O que é clicável dentro deles (as linhas da tabela do time)
 * tem o próprio efeito.
 */
export const MOLDURA_DA_PAUTA = 'border-border shadow-none hover:border-border hover:shadow-none';
