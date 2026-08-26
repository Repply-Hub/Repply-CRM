import { useArquivoPrivado } from '@/hooks/use-arquivo-privado';

/**
 * Uma `<img>` que sabe pedir link temporário — Passo 2 do plano dos baldes privados
 * (`docs/operacao/plano-baldes-privados.md`).
 *
 * Existe porque o app desenha imagem do nosso armazenamento em dezenas de lugares, sempre
 * com o mesmo formato: `<img src={algum_url} …>`. Trocar cada um por um `useQuery` à mão
 * seria dezenas de chances de esquecer um — e arquivo esquecido só aparece no dia em que o
 * balde fecha, com a foto sumindo da tela do cliente.
 *
 * NÃO QUEBRA NADA HOJE. Enquanto a assinatura não chega, e sempre que ela falha, o endereço
 * usado é o ORIGINAL — que ainda funciona porque os baldes seguem públicos. É justamente por
 * isso que a queda é contada (`quedasRegistradas`): sem o contador, uma falha aqui é
 * invisível até o fechamento.
 *
 * Endereço de fora do nosso armazenamento (CDN do Bitrix, foto de perfil do próprio WhatsApp)
 * passa direto, sem nenhuma chamada.
 *
 * Uma consulta por endereço DISTINTO, não por tag: o TanStack Query junta pela chave, então
 * o mesmo avatar repetido em vinte lugares da tela vira um pedido só.
 */
export function ImagemPrivada({
  src,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | null | undefined }) {
  const { data } = useArquivoPrivado(src);

  // `data` só é indefinido enquanto a assinatura não voltou; aí vale o endereço de hoje, e a
  // imagem aparece na hora em vez de piscar em branco.
  return <img src={data ?? src ?? undefined} {...props} />;
}
