import { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarDeChat } from './AvatarDeChat';
import { SIMBOLOS_DE_CHAT } from '@/lib/simbolos-de-chat';
import { CORES_DE_CHAT, COR_FUNDO_PADRAO, COR_ICONE_PADRAO } from '@/lib/cores-de-chat';
import { SeletorCorLivre } from '@/components/shared/SeletorCorLivre';

export interface AparenciaValor {
  icone: string | null;
  corFundo: string | null;
  corIcone: string | null;
  fotoUrl?: string | null;
}

export function SeletorDeAparencia({
  valor, onChange, onEscolherImagem, IconePadrao, nome,
}: {
  valor: AparenciaValor;
  onChange: (v: AparenciaValor) => void;
  onEscolherImagem: (file: File) => void;
  IconePadrao: LucideIcon;
  nome: string;
}) {
  const imgRef = useRef<HTMLInputElement>(null);

  const escolherSimbolo = (chave: string) =>
    onChange({
      ...valor,
      fotoUrl: null,
      icone: chave,
      corFundo: valor.corFundo ?? COR_FUNDO_PADRAO,
      corIcone: valor.corIcone ?? COR_ICONE_PADRAO,
    });

  return (
    <div className="space-y-3">
      {/* Prévia + enviar imagem */}
      <div className="flex items-center gap-3">
        <AvatarDeChat
          className="h-14 w-14 border border-border"
          fotoUrl={valor.fotoUrl}
          icone={valor.icone}
          corFundo={valor.corFundo}
          corIcone={valor.corIcone}
          IconePadrao={IconePadrao}
          nome={nome}
          tamanhoIcone="h-6 w-6"
        />
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onEscolherImagem(f);
          }}
        />
        <button
          type="button"
          onClick={() => imgRef.current?.click()}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Camera className="h-3.5 w-3.5" /> Enviar uma imagem
        </button>
      </div>

      {/* Grade de símbolos */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Ou escolha um símbolo</p>
        <div className="flex flex-wrap gap-1.5">
          {SIMBOLOS_DE_CHAT.map((s) => {
            const Icone = s.Icone;
            const ativo = !valor.fotoUrl && valor.icone === s.chave;
            return (
              <button
                key={s.chave}
                type="button"
                aria-label={`Símbolo ${s.rotulo}`}
                title={s.rotulo}
                onClick={() => escolherSimbolo(s.chave)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
                  ativo ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted/50',
                )}
              >
                <Icone className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Cores: paleta clara + escura + cor livre (fundo e ícone) */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground">Cores</p>
        {([
          { titulo: 'Claras', variante: 'clara' as const },
          { titulo: 'Escuras', variante: 'escura' as const },
        ]).map(({ titulo, variante }) => (
          <div key={variante}>
            <p className="mb-1 text-[10px] text-muted-foreground">{titulo}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {CORES_DE_CHAT.map((c) => {
                const fundo = variante === 'clara' ? c.fundo : c.fundoEscuro;
                const icone = variante === 'clara' ? c.icone : c.iconeEscuro;
                return (
                  <button
                    key={`${c.nome}-${variante}`}
                    type="button"
                    aria-label={`Cor ${c.nome} (${variante})`}
                    title={`${c.nome} (${titulo.toLowerCase()})`}
                    onClick={() => onChange({ ...valor, fotoUrl: null, corFundo: fundo, corIcone: icone, icone: valor.icone ?? 'balao' })}
                    className="h-7 w-7 rounded-full border border-border"
                    style={{ backgroundColor: fundo, color: icone }}
                  >
                    <span className="text-xs font-bold">A</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">Fundo:
            <SeletorCorLivre hexAtual={valor.corFundo ?? COR_FUNDO_PADRAO} onEscolher={(hex) => onChange({ ...valor, fotoUrl: null, corFundo: hex, icone: valor.icone ?? 'balao' })} />
          </span>
          <span className="flex items-center gap-1">Ícone:
            <SeletorCorLivre hexAtual={valor.corIcone ?? COR_ICONE_PADRAO} onEscolher={(hex) => onChange({ ...valor, fotoUrl: null, corIcone: hex, icone: valor.icone ?? 'balao' })} />
          </span>
        </div>
      </div>
    </div>
  );
}
