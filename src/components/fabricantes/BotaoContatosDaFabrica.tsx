import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Users, Pencil, Phone, Mail } from 'lucide-react';
import { ordenarContatos, type ContatoDaFabrica, type FuncaoDaFabrica } from '@/lib/contatos-da-fabrica';

/**
 * O botão "Contatos" da ficha da fábrica, irmão do Editar e do Excluir.
 *
 * POR QUE É UM BOTÃO, E NÃO UMA SEÇÃO NA TELA: decisão do dono do produto em 31/08/2026.
 * A primeira versão era um bloco na ficha; ele pediu que fosse pequeno, do tamanho do
 * Editar e do Excluir, e entre os dois — para a tela de Fabricantes não ganhar mais um
 * quadro.
 *
 * A lista aqui é só de LEITURA. Quem mexe é o painel de edição da fábrica, que é para onde
 * o botão "Editar contatos" leva — assim existe UM lugar de edição, não dois.
 */
export function BotaoContatosDaFabrica({
  contatos,
  funcoes,
  onEditar,
}: {
  contatos: ContatoDaFabrica[];
  funcoes: FuncaoDaFabrica[];
  onEditar: () => void;
}) {
  const emOrdem = ordenarContatos(contatos, funcoes);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9">
          <Users className="h-3.5 w-3.5" />
          <span>Contatos</span>
          {emOrdem.length > 0 && (
            <span className="text-xs text-muted-foreground">({emOrdem.length})</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Contatos da fábrica</p>
        </div>

        {emOrdem.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum contato cadastrado.
          </p>
        ) : (
          // Teto de altura: uma fábrica com muitos contatos não pode empurrar o rodapé
          // para fora da tela, que é onde fica o único botão daqui.
          <ul className="max-h-72 overflow-y-auto divide-y divide-border">
            {emOrdem.map((c) => {
              const funcao = funcoes.find((f) => f.id === c.funcao_id);
              return (
                <li key={c.id} className="px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{c.nome}</span>
                    {c.principal && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Principal
                      </span>
                    )}
                  </div>
                  {funcao && (
                    <p className="text-xs text-muted-foreground">{funcao.nome}</p>
                  )}
                  {c.telefone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3 flex-shrink-0" /> {c.telefone}
                    </p>
                  )}
                  {c.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 break-all">
                      <Mail className="h-3 w-3 flex-shrink-0" /> {c.email}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-border p-2">
          <Button
            variant="outline" size="sm" className="w-full gap-1.5 h-8"
            onClick={onEditar}
          >
            <Pencil className="h-3.5 w-3.5" />
            {emOrdem.length === 0 ? 'Cadastrar contatos' : 'Editar contatos'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
