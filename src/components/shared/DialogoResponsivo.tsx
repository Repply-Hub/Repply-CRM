import * as React from 'react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Casca de modal que não prende o usuário.
 *
 * O DEFEITO QUE ISTO CONSERTA (medido, e já acontece hoje num notebook
 * 1366x768 sem zoom, em 67 dos 89 modais do sistema):
 * o `DialogContent` do shadcn não tem teto de altura nem rolagem, e é
 * centralizado por deslocamento de 50%. Conteúdo mais alto que a janela
 * transborda para os DOIS lados ao mesmo tempo — o botão Salvar some por baixo
 * e o "X" some por cima. Como este projeto ainda desligou Esc e clique-fora
 * (ui/dialog.tsx:42), a pessoa preenche o formulário inteiro e só sai
 * recarregando a página.
 *
 * POR QUE UM COMPONENTE NOVO E NÃO DUAS CLASSES NA PRIMITIVA:
 * CLAUDE.md §5.4 manda estender `src/components/ui/`, não editar. Este arquivo
 * é a extensão.
 *
 * ALTURA EM `dvh`, NÃO `vh`: no celular `100vh` mede a tela COM a barra de
 * endereço escondida, que é maior que a área realmente visível — o rodapé do
 * modal, justamente onde ficam Cancelar e Salvar, fica atrás da barra do
 * navegador. `dvh` mede o que dá para ver de verdade.
 *
 * COMO USAR (as 7 telas copiam daqui):
 *
 *   import {
 *     Dialog, DialogTitle, DialogDescription,
 *     ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo,
 *   } from '@/components/shared/DialogoResponsivo';
 *
 *   <Dialog open={aberto} onOpenChange={setAberto}>
 *     <ConteudoDialogo className="sm:max-w-2xl">
 *       <CabecalhoDialogo>
 *         <DialogTitle>Novo Negócio</DialogTitle>
 *         <DialogDescription>Preencha os dados do orçamento.</DialogDescription>
 *       </CabecalhoDialogo>
 *
 *       <CorpoDialogo>
 *         ...os campos do formulário, à vontade, na altura que precisar...
 *       </CorpoDialogo>
 *
 *       <RodapeDialogo>
 *         <Button variant="outline" onClick={fechar}>Cancelar</Button>
 *         <Button onClick={salvar}>Salvar</Button>
 *       </RodapeDialogo>
 *     </ConteudoDialogo>
 *   </Dialog>
 *
 * TROCA MÍNIMA: só trocar `<DialogContent>` por `<ConteudoDialogo>` já tira a
 * tela do beco sem saída — o modal ganha teto de altura e rola por inteiro.
 * Envolver o miolo em `<CorpoDialogo>` é o que deixa título e botões parados
 * enquanto só o meio rola, que é o resultado bom. Prefira a versão completa
 * quando estiver mexendo no arquivo de qualquer jeito.
 */

export type ConteudoDialogoProps = React.ComponentPropsWithoutRef<typeof DialogContent>;

/**
 * Substitui o `<DialogContent>`. Aceita as mesmas propriedades — inclusive
 * `className` para a largura (`sm:max-w-2xl`, `sm:max-w-4xl`...), que continua
 * funcionando porque o tailwind-merge deixa a classe da tela vencer.
 */
export const ConteudoDialogo = React.forwardRef<HTMLDivElement, ConteudoDialogoProps>(({ className, ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      // `flex flex-col` no lugar do `grid` da primitiva: assim o miolo é o único
      // pedaço que estica e encolhe, e cabeçalho e rodapé ficam parados.
      'flex flex-col',
      // Teto de altura. No celular sobra uma folga de 16px em cima e embaixo
      // para o modal não colar nas bordas.
      'max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh]',
      // Largura: no celular ocupa a tela menos 24px; a partir do `sm` volta a
      // mandar o `max-w-*` da primitiva (ou o que a tela passar).
      'w-[calc(100vw-1.5rem)] sm:w-full',
      // Rede de segurança para quem só trocou a tag e não usou o CorpoDialogo:
      // com CorpoDialogo esta rolagem nunca aparece, porque o conteúdo já cabe.
      'overflow-y-auto',
      className,
    )}
    {...props}
  />
));
ConteudoDialogo.displayName = 'ConteudoDialogo';

/** Cabeçalho fixo. Substitui o `<DialogHeader>`; mesmas propriedades. */
export const CabecalhoDialogo = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <DialogHeader className={cn('shrink-0', className)} {...props} />
);
CabecalhoDialogo.displayName = 'CabecalhoDialogo';

/**
 * O miolo que rola. É o único pedaço com rolagem própria.
 *
 * `min-h-0` não é enfeite: sem ele um item de flex se recusa a encolher abaixo
 * do próprio conteúdo, a rolagem nunca aparece e o modal volta a estourar.
 *
 * As margens negativas fazem a barra de rolagem nascer na borda do modal, sem
 * desfazer o `p-6` que a primitiva usa no cabeçalho e no rodapé.
 */
export const CorpoDialogo = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('min-h-0 flex-1 overflow-y-auto -mx-6 px-6', className)} {...props} />
);
CorpoDialogo.displayName = 'CorpoDialogo';

/**
 * Rodapé fixo — onde ficam Cancelar e Salvar. Substitui o `<DialogFooter>`.
 *
 * O `gap-2` existe porque no celular os botões empilham e a primitiva não põe
 * espaço nenhum entre eles: ficam colados, com risco de tocar o errado.
 */
export const RodapeDialogo = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <DialogFooter className={cn('shrink-0 gap-2 sm:gap-0', className)} {...props} />
);
RodapeDialogo.displayName = 'RodapeDialogo';

// Reexportados para a tela precisar de UM import só: o resto das peças do
// modal continua sendo exatamente o shadcn, sem nenhuma alteração.
export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
