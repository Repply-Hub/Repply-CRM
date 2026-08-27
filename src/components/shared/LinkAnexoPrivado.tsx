import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { useArquivoPrivado } from '@/hooks/use-arquivo-privado';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';

/**
 * O link para o anexo de um negócio — Passo 2 do plano dos baldes privados
 * (`docs/operacao/plano-baldes-privados.md`), módulo 2.
 *
 * Existe porque quase a mesma marcação aparecia em quatro lugares (a coluna "Anexo" da lista
 * de Negócios, o alias legado `pdf_url` da mesma lista, a lista dentro da ficha do cliente e a
 * prévia da importação). Quatro cópias é onde uma passa despercebida — e anexo esquecido só
 * aparece no dia em que o balde fecha, com o orçamento sumindo da tela do vendedor.
 *
 * O REPARO VEM ANTES DA ASSINATURA, e a ordem importa: parte dos endereços herdados veio do
 * Bitrix com os pontos trocados por vírgulas (`repairCorruptedBitrixUrl`), e tentar extrair o
 * caminho de um endereço quebrado não acharia arquivo nenhum. Endereço que não é do nosso
 * armazenamento — os 4 que ainda apontam para o CDN do Bitrix, e o que a planilha traz na
 * prévia da importação — passa intacto, sem nenhuma chamada.
 *
 * NÃO QUEBRA NADA HOJE: enquanto a assinatura não chega — e sempre que ela falha — vale o
 * endereço de hoje, que ainda abre porque o balde segue público. A queda fica registrada em
 * `quedasDeArquivo`, o único lugar onde ela é visível antes do fechamento.
 */
export function LinkAnexoPrivado({
  url,
  className = 'inline-flex items-center gap-1 text-primary hover:underline',
  title,
  children = <><FileText className="h-3.5 w-3.5" /> PDF</>,
}: {
  url: string;
  className?: string;
  title?: string;
  children?: ReactNode;
}) {
  const reparado = repairCorruptedBitrixUrl(url);
  const { data } = useArquivoPrivado(reparado);

  return (
    <a
      href={data ?? reparado}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      // O título mostra o endereço ORIGINAL de propósito: é o que a pessoa reconhece e o que
      // ela colou na planilha. O link temporário é uma parede de caracteres sem sentido.
      title={title}
    >
      {children}
    </a>
  );
}
