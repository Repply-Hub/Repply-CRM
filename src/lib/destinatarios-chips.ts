import { parseEnderecos, enderecoPareceValido } from "./enderecos-email";

/** Uma fichinha de destinatário: um nome opcional e um e-mail. */
export interface Ficha {
  nome?: string;
  email: string;
}

/** Separa "Nome <email>" em {nome, email}; "email" vira {email}. */
function separar(entrada: string): Ficha {
  const m = entrada.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) {
    const nome = m[1].trim();
    const email = m[2].trim();
    return nome ? { nome, email } : { email };
  }
  return { email: entrada.trim() };
}

/**
 * Lê a string "Nome <email>, …" (a mesma que mora em `formData.destinatario/cc/
 * cco`) numa lista de fichinhas. Delega a separação por vírgula/ponto-e-vírgula e
 * o dedupe ao `parseEnderecos`, que o envio já usa — assim as fichinhas e o texto
 * nunca divergem.
 */
export function parseFichas(valor: string): Ficha[] {
  return parseEnderecos(valor).map(separar);
}

/**
 * Serializa as fichinhas de volta para "Nome <email>, …" — o formato que o envio
 * (`parseEnderecos`) e o autosave já esperam. Só e-mail quando não há nome.
 */
export function serializarFichas(fichas: Ficha[]): string {
  return fichas
    .map((f) => (f.nome ? `${f.nome} <${f.email}>` : f.email))
    .join(", ");
}

/** Aviso leniente (o Nylas valida de verdade). Aceita "Nome <email>". */
export const ehEmailValido = enderecoPareceValido;
