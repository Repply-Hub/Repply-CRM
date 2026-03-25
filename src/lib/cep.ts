export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

export function unmaskCep(value: string): string {
  return value.replace(/\D/g, '');
}

export interface CepData {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
}

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchCepData(cep: string): Promise<CepData> {
  const digits = cep.replace(/\D/g, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('CEP não encontrado');
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Consulta de CEP expirou. Verifique sua conexão e tente novamente.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface EnderecoFields {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export const emptyEndereco: EnderecoFields = {
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
};

export function enderecoToString(e: EnderecoFields): string {
  return [
    e.logradouro,
    e.numero,
    e.complemento,
    e.bairro,
    e.cidade && e.uf ? `${e.cidade} - ${e.uf}` : e.cidade || e.uf,
    e.cep,
  ].filter(Boolean).join(', ');
}

export function stringToEndereco(addr: string): EnderecoFields {
  if (!addr) return { ...emptyEndereco };
  const parts = addr.split(',').map(s => s.trim());
  const logradouro = parts[0] || '';
  const numero = parts[1] || '';
  // Handle variable-length: "log, num, bairro, cidade - UF, cep" or "log, num, cidade - UF, cep"
  let complemento = '';
  let bairro = '';
  let cidadeUfRaw = '';
  let cep = '';

  if (parts.length >= 5) {
    complemento = parts[2] || '';
    bairro = parts[3] || '';
    cidadeUfRaw = parts[4] || '';
    cep = parts[5] || '';
  } else if (parts.length === 4) {
    bairro = parts[2] || '';
    cidadeUfRaw = parts[3] || '';
  } else if (parts.length === 3) {
    cidadeUfRaw = parts[2] || '';
  }

  // If last part looks like a CEP (5 digits + dash + 3 digits or 8 digits), treat it as cep
  const lastPart = parts[parts.length - 1] || '';
  if (/^\d{5}-?\d{3}$/.test(lastPart.replace(/\s/g, ''))) {
    cep = lastPart;
    // Re-parse without cep
    if (parts.length === 5) {
      bairro = parts[2] || '';
      cidadeUfRaw = parts[3] || '';
      complemento = '';
    } else if (parts.length >= 6) {
      complemento = parts[2] || '';
      bairro = parts[3] || '';
      cidadeUfRaw = parts[4] || '';
    }
  }

  const cidadeUfMatch = cidadeUfRaw.match(/^(.+?)\s*-\s*(.+)$/);
  const cidade = cidadeUfMatch ? cidadeUfMatch[1].trim() : cidadeUfRaw;
  const uf = cidadeUfMatch ? cidadeUfMatch[2].trim() : '';

  return { cep: maskCep(cep), logradouro, numero, complemento, bairro, cidade, uf };
}
