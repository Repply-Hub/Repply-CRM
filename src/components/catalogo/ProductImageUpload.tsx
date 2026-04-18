import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeFileName, validateFile } from '@/lib/file-validation';

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  fabricanteId: string;
}

export function ProductImageUpload({ value, onChange, fabricanteId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!validateFile(file, {
      allowedMimePrefixes: ['image/'],
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
      maxBytes: 5 * 1024 * 1024, // 5 MB para imagens
    })) return;

    setUploading(true);
    try {
      const safeName = sanitizeFileName(file.name);
      const path = `${fabricanteId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from('catalogo-produtos')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('catalogo-produtos').getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success('Imagem enviada!');
    } catch (err: any) {
      toast.error(err.message || 'Falha no upload da imagem');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!value) return;
    // Remove ref no banco; arquivo no Storage fica órfão (limpeza opcional futura).
    onChange(null);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-20 w-20 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
        {value ? (
          <img src={value} alt="Produto" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? 'Trocar imagem' : 'Enviar imagem'}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" /> Remover
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground">JPG/PNG/WebP até 5MB</p>
      </div>
    </div>
  );
}
