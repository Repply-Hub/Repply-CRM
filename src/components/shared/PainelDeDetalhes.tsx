import * as React from 'react';
import { SheetContent, SheetHeader, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * A moldura dos painéis laterais de DETALHE — o de uma obra, o de um negócio.
 *
 * 🔴 O PROBLEMA QUE ELA RESOLVE. Os dois painéis eram `<SheetContent className="overflow-y-auto">`
 * com tudo dentro no mesmo fluxo: cabeçalho, miolo e rodapé rolavam juntos. Num negócio com
 * histórico longo, os botões de Editar e Excluir ficam a várias telas de distância — quem quer
 * editar precisa rolar até o fim para achar o botão, toda vez.
 *
 * Aqui só o miolo rola. Cabeçalho e rodapé ficam parados, e os botões estão sempre à mão.
 *
 * É a mesma ideia do `DialogoResponsivo` (que faz isso para os modais), e existe separada porque
 * o painel lateral é outra primitiva do Radix — `Sheet`, não `Dialog`. Pedido do Lucas em
 * 27/08/2026: "essa seção de baixo onde tem botões como editar, excluir e fechar devem estar
 * congeladas", e os dois painéis no mesmo padrão.
 *
 * COMO USAR:
 *
 *     <Sheet open={...} onOpenChange={...}>
 *       <ConteudoDoPainel className="sm:max-w-xl">
 *         <CabecalhoDoPainel>
 *           <SheetTitle>...</SheetTitle>
 *         </CabecalhoDoPainel>
 *         <CorpoDoPainel>
 *           ...tudo o que rola...
 *         </CorpoDoPainel>
 *         <RodapeDoPainel esquerda={<><Editar/><Fechar/></>}>
 *           <Excluir/>
 *         </RodapeDoPainel>
 *       </ConteudoDoPainel>
 *     </Sheet>
 */

/**
 * Substitui `SheetContent`.
 *
 * 🔴 `flex flex-col` no lugar do fluxo comum, e `p-0` no lugar do `p-6` da primitiva: o
 * espaçamento passa a ser de cada faixa, senão o miolo rolaria POR DENTRO do respiro lateral e
 * o texto encostaria na borda ao rolar.
 */
export const ConteudoDoPainel = React.forwardRef<
  React.ElementRef<typeof SheetContent>,
  React.ComponentPropsWithoutRef<typeof SheetContent>
>(({ className, ...props }, ref) => (
  <SheetContent ref={ref} className={cn('flex flex-col p-0', className)} {...props} />
));
ConteudoDoPainel.displayName = 'ConteudoDoPainel';

/** Cabeçalho parado. */
export const CabecalhoDoPainel = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <SheetHeader className={cn('shrink-0 px-6 pt-6 pb-4', className)} {...props} />
);

/**
 * O único pedaço que rola.
 *
 * 🔴 `min-h-0` não é enfeite: item de flex tem altura mínima igual ao conteúdo por padrão, e sem
 * isto o miolo cresceria em vez de rolar — empurrando o rodapé para fora da tela, que é
 * exatamente o defeito que esta moldura existe para consertar.
 */
export const CorpoDoPainel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 pb-6', className)} {...props} />
);

interface RodapeDoPainelProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * O que fica à ESQUERDA — as ações do dia a dia (editar, fechar).
   *
   * 🔴 A separação não é estética. A ação destrutiva fica sozinha do outro lado, longe do
   * caminho do dedo de quem só queria editar. Juntar tudo num canto só é como um clique errado
   * vira uma exclusão.
   */
  esquerda?: React.ReactNode;
}

/**
 * Rodapé parado. Os filhos vão para a DIREITA — é onde mora a ação destrutiva.
 */
export const RodapeDoPainel = ({
  className,
  esquerda,
  children,
  ...props
}: RodapeDoPainelProps) => (
  <SheetFooter
    className={cn(
      // 🔴 PRECISA DAS DUAS: `justify-between` E `sm:justify-between`.
      //
      // O `SheetFooter` da primitiva traz `sm:justify-end` (ui/sheet.tsx:76). O tailwind-merge
      // só resolve conflito DENTRO da mesma variante — `justify-between` (sem prefixo) e
      // `sm:justify-end` são variantes diferentes, então as duas sobrevivem à mesclagem e, de
      // 640px para cima, quem vale é a da primitiva. Resultado até 28/08/2026: os dois lados
      // colavam no canto DIREITO em qualquer tela de desktop, e a separação só existia no
      // celular. O comentário anterior aqui já dizia `sm:justify-between` — a classe escrita
      // é que estava sem o prefixo.
      //
      // Conferido com o próprio tailwind-merge do projeto: com `sm:justify-between` o
      // `sm:justify-end` some da saída; sem ele, permanece.
      //
      // `flex-row` desde o celular: o `flex-col-reverse` da primitiva empilharia os botões e
      // desmancharia a divisão.
      'shrink-0 flex-row items-center justify-between sm:justify-between gap-2 border-t border-border bg-background px-6 py-4 sm:space-x-0',
      className,
    )}
    {...props}
  >
    <div className="flex items-center gap-2">{esquerda}</div>
    <div className="flex items-center gap-2">{children}</div>
  </SheetFooter>
);
