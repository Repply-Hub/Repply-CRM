/**
 * O resumo, somente leitura, da análise de uma visita já realizada — fase da obra, concorrente
 * visto, com quem falou, próximo passo e a observação livre.
 *
 * 🔴 POR QUE ISTO É UM COMPONENTE À PARTE. Achado na revisão do Task 6a: `VisitasObrasPainel.tsx`
 * gravava as cinco respostas desde a primeira versão, mas só mostrava a observação de volta, e só
 * fora do modo de edição — quem tinha respondido "Fase: Acabamento" e "Concorrente: Marca X" via
 * essas respostas sumirem assim que fechava o formulário. A análise pertence a quem VÊ o cartão,
 * não só a quem escreveu: por isso este bloco não checa `criadoPor`.
 *
 * Extraído para fora de `VisitasObrasPainel.tsx` para ter teste próprio em `jsdom` sem precisar
 * montar o painel inteiro (busca, agrupamento por dia, rotas, diálogos).
 */
import { resumoDaAnalise, type AnaliseDaVisita } from '@/lib/analise-da-visita';

export interface ResumoDaVisitaProps {
  analise?: AnaliseDaVisita | null;
}

export function ResumoDaVisita({ analise }: ResumoDaVisitaProps) {
  const linhas = resumoDaAnalise(analise);
  if (linhas.length === 0) return null;

  return (
    <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-foreground">
      {linhas.map((linha) => (
        <p key={linha}>{linha}</p>
      ))}
    </div>
  );
}
