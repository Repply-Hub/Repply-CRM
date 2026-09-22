/**
 * Peças de exibição de ENDEREÇO/CABEÇALHO compartilhadas pelo leitor e por cada
 * mensagem da conversa (`LeitorEmail`, `MensagemConversa`). Ficam num módulo
 * neutro para os dois importarem sem depender um do outro (evita import
 * circular, já que o `LeitorEmail` importa o `MensagemConversa`).
 */

/**
 * Um endereço no formato que o Nylas grava em `email_mensagens.destinatarios`/
 * `cc`/`bcc` (jsonb): `{ name?, email }` — ver migration
 * `20260804121322_email_nylas.sql` e `mensagemParaLinha` em
 * `supabase/functions/_shared/nylas.ts`. `email` vem opcional aqui só porque a
 * coluna é `Json` no tipo gerado (`types.ts`); item sem endereço é descartado
 * na exibição.
 */
export interface EnderecoDoEmail {
  name?: string | null;
  email?: string | null;
}

/** Separa "Fulano <fulano@x.com>" em nome e endereço. */
export function separarRemetente(valor?: string | null): { nome: string; endereco: string } {
  const bruto = (valor ?? '').trim();
  if (!bruto) return { nome: 'Desconhecido', endereco: '' };
  const m = bruto.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { nome: m[1].trim() || m[2], endereco: m[2] };
  return { nome: bruto, endereco: bruto.includes('@') ? bruto : '' };
}

/**
 * Converte a lista do Nylas (`EnderecoDoEmail[]`, `{name?, email}`) para
 * `{nome, endereco}` — mesmo par que `separarRemetente` produz a partir de uma
 * string única, usado para "Para"/"Cc"/"Cco" no cabeçalho do leitor. Item sem
 * endereço é descartado (não há o que mostrar nem para onde clicar).
 */
export function itensDeEndereco(
  lista?: EnderecoDoEmail[] | null,
): { nome: string; endereco: string }[] {
  return (lista ?? [])
    .map((item) => {
      const endereco = (item?.email ?? '').trim();
      const nome = (item?.name ?? '').trim();
      return { nome: nome || endereco, endereco };
    })
    .filter((item) => item.endereco);
}

/**
 * Uma linha de endereços (Para com vários destinatários, Cc, Cco) — cada um
 * clicável, com o próprio endereço da caixa trocado por "mim". Mesma regra que
 * "Para" já usava para um endereço só, agora para lista: por isso não é um
 * componente do zero, é a mesma marcação (span clicável com `role="button"` e
 * Enter/Espaço) reaplicada por item.
 */
export function ListaDeEnderecos({
  itens,
  emailDaConta,
  onClicarEndereco,
}: {
  itens: { nome: string; endereco: string }[];
  emailDaConta: string | null;
  onClicarEndereco?: (endereco: string) => void;
}) {
  return (
    <>
      {itens.map((item, i) => {
        const rotulo = item.endereco === emailDaConta ? 'mim' : item.nome;
        return (
          <span key={`${item.endereco}-${i}`}>
            {onClicarEndereco ? (
              <span
                className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                role="button"
                tabIndex={0}
                onClick={() => onClicarEndereco(item.endereco)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClicarEndereco(item.endereco);
                  }
                }}
              >
                {rotulo}
              </span>
            ) : (
              rotulo
            )}
            {i < itens.length - 1 ? ', ' : ''}
          </span>
        );
      })}
    </>
  );
}

export function tamanhoLegivel(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
