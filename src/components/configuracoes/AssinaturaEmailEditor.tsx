import { EditorTextoRico } from '@/components/shared/EditorTextoRico';
import { sanitizarHtmlEmail } from '@/lib/sanitizar-html-email';
import { enviarImagemEmail } from '@/lib/imagem-email';

interface Props {
  name: string;
  value: string;
  onChange: (html: string) => void;
  /** Upload de imagem é por EMPRESA (caixa compartilhada), não por usuário. */
  empresaId: string;
  /**
   * @deprecated Desde 18/09/2026 a assinatura é um editor único (sem abas
   * Texto/Imagem) — não há mais "modo" a avisar. Mantida só para não quebrar
   * quem ainda chama o componente passando esta prop; não tem efeito.
   */
  onModoChange?: (modo: 'texto' | 'imagem') => void;
  /**
   * @deprecated O "rodapé automático" (nome/logo somados no envio) deixou de
   * existir — a assinatura é o que a pessoa escreve no editor, incluindo
   * nome e imagens se quiser. Sem efeito.
   */
  mostrarNomeImagem?: boolean;
  /** @deprecated Ver `mostrarNomeImagem`. Sem efeito. */
  onMostrarNomeImagemChange?: (mostrar: boolean) => void;
  /** @deprecated Ver `mostrarNomeImagem`. Sem efeito. */
  mostrarEmpresaImagem?: boolean;
  /** @deprecated Ver `mostrarNomeImagem`. Sem efeito. */
  onMostrarEmpresaImagemChange?: (mostrar: boolean) => void;
}

/**
 * Editor de assinatura de e-mail — desde 18/09/2026, um editor único (o
 * mesmo `EditorTextoRico` do corpo da mensagem), sem a antiga divisão em
 * abas "Texto"/"Imagem". A pessoa monta a assinatura livremente: texto,
 * várias imagens, cores, links. Grava HTML sanitizado direto no campo
 * `usuarios.assinatura_email` (sem mudança de banco — o campo já é HTML).
 */
export function AssinaturaEmailEditor({ name, value, onChange, empresaId }: Props) {
  return (
    <div className="rounded-md border">
      <EditorTextoRico
        value={value}
        onChange={(html) => onChange(sanitizarHtmlEmail(html))}
        onEnviarImagem={(file) => enviarImagemEmail(file, empresaId)}
        aria-label="Assinatura de e-mail"
        placeholder="Monte sua assinatura: nome, cargo, telefone, imagens..."
        minHeight={160}
      />
      {/* `readOnly` porque quem escreve aqui é o `onChange` do editor acima,
          não digitação direta neste input — React reclamaria de um
          controlado sem `onChange` próprio. O resto do formulário em
          `ProfileTab` é não controlado (lê tudo via `FormData` no submit). */}
      <input type="hidden" name={name} value={value} readOnly />
      {/* Mantidos por compatibilidade com o FormData do pai (que ainda lê e
          grava estas duas colunas — inofensivo). Sem uso no editor novo: o
          "modo imagem" que eles controlavam deixou de existir. */}
      <input type="hidden" name="assinatura_imagem_mostrar_nome" value="true" readOnly />
      <input type="hidden" name="assinatura_imagem_mostrar_empresa" value="true" readOnly />
    </div>
  );
}
