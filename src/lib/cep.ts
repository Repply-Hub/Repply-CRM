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

export async function fetchCepData(cep: string): Promise<CepData> {
  const digits = cep.replace(/\D/g, '');
  const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`);
  if (!res.ok) throw new Error('CEP não encontrado');
  return res.json();
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
  // best-effort parse, mostly used for edit pre-fill
  return { ...emptyEndereco, logradouro: addr };
}
