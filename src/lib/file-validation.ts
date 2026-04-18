import { toast } from 'sonner';

export const MAX_FILE_SIZE_MB = 15;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Sanitiza nome de arquivo para uso seguro em paths de storage.
 * Remove acentos, caracteres especiais e espaços.
 */
export function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf('.');
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot) : '';
  const safeBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${safeBase || 'file'}${safeExt}`;
}

interface ValidateOptions {
  /** Lista de extensões permitidas (com ponto, lowercase). Ex: ['.xlsx', '.csv'] */
  allowedExtensions?: string[];
  /** Lista de prefixos/strings de MIME permitidos. Ex: ['image/', 'application/pdf'] */
  allowedMimePrefixes?: string[];
  /** Tamanho máximo customizado em bytes. Default 15MB. */
  maxBytes?: number;
  /** Se deve mostrar toast de erro automaticamente. Default true. */
  showToast?: boolean;
}

/**
 * Valida tamanho, extensão e MIME de um arquivo.
 * Retorna true se válido; false e (opcionalmente) dispara toast caso contrário.
 */
export function validateFile(file: File, opts: ValidateOptions = {}): boolean {
  const {
    allowedExtensions,
    allowedMimePrefixes,
    maxBytes = MAX_FILE_SIZE_BYTES,
    showToast = true,
  } = opts;

  if (file.size > maxBytes) {
    if (showToast) {
      toast.error(
        `Arquivo muito grande. Tamanho máximo permitido: ${Math.round(maxBytes / 1024 / 1024)}MB.`
      );
    }
    return false;
  }

  if (file.size === 0) {
    if (showToast) toast.error('Arquivo vazio.');
    return false;
  }

  if (allowedExtensions && allowedExtensions.length > 0) {
    const lower = file.name.toLowerCase();
    const ok = allowedExtensions.some((ext) => lower.endsWith(ext.toLowerCase()));
    if (!ok) {
      if (showToast) {
        toast.error(`Tipo de arquivo não permitido. Use: ${allowedExtensions.join(', ')}`);
      }
      return false;
    }
  }

  if (allowedMimePrefixes && allowedMimePrefixes.length > 0 && file.type) {
    const ok = allowedMimePrefixes.some((p) => file.type.startsWith(p) || file.type === p);
    if (!ok) {
      if (showToast) toast.error('Tipo de conteúdo não permitido.');
      return false;
    }
  }

  return true;
}
