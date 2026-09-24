import { useState } from 'react';
import { Dialog, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Loader2, Users2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { SeletorDeAparencia, AparenciaValor } from '@/components/chat/SeletorDeAparencia';
import { SeletorDeMembros, MembroSelecionavel } from '@/components/chat/SeletorDeMembros';
import {
  useUpdateChatGrupo, useUpdateChatGeralConfig,
  useAddChatGrupoMembros, useRemoveChatGrupoMembros,
  ChatGrupo, ChatGeralConfig,
} from '@/hooks/use-chat';

/**
 * Modal único que edita um grupo (estilo + participantes) ou o Chat Geral
 * (só estilo + nome — o Geral não tem lista de participantes própria).
 *
 * Renderiza o próprio botão-gatilho e só aparece quando `podeEditar` é
 * verdadeiro; a tela que consome decide essa permissão (a autorização de
 * verdade continua na RLS — esconder o botão aqui não substitui isso).
 */
export type AlvoEdicao =
  | { tipo: 'grupo'; grupo: ChatGrupo }
  | { tipo: 'geral'; config: ChatGeralConfig | null };

export function EditarConversaDialog({
  alvo, membros, membrosAtuais = [], meuId, podeEditar,
}: {
  alvo: AlvoEdicao;
  membros: MembroSelecionavel[];
  membrosAtuais?: { id: string }[];
  meuId: string | null;
  podeEditar: boolean;
}) {
  const ehGrupo = alvo.tipo === 'grupo';
  const origem = ehGrupo ? alvo.grupo : alvo.config;
  const nomeInicial = origem?.nome ?? (ehGrupo ? '' : 'Chat Geral');

  // Membros atuais que a lista gerencia (exclui o próprio, como na criação).
  const atuaisGerenciados = membrosAtuais.map((m) => m.id).filter((id) => id !== meuId);

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(nomeInicial);
  const [aparencia, setAparencia] = useState<AparenciaValor>({
    icone: origem?.icone ?? null,
    corFundo: origem?.cor_fundo ?? null,
    corIcone: origem?.cor_icone ?? null,
    fotoUrl: origem?.foto_url ?? null,
  });
  const [novaFoto, setNovaFoto] = useState<File | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>(atuaisGerenciados);
  const [salvando, setSalvando] = useState(false);

  const updateGrupo = useUpdateChatGrupo();
  const updateGeral = useUpdateChatGeralConfig();
  const addMembros = useAddChatGrupoMembros();
  const removeMembros = useRemoveChatGrupoMembros();

  // Recarrega o rascunho a cada abertura (o alvo pode ter mudado enquanto fechado).
  const aoAbrir = (v: boolean) => {
    setOpen(v);
    if (v) {
      setNome(nomeInicial);
      setAparencia({ icone: origem?.icone ?? null, corFundo: origem?.cor_fundo ?? null, corIcone: origem?.cor_icone ?? null, fotoUrl: origem?.foto_url ?? null });
      setNovaFoto(null);
      setSelecionados(atuaisGerenciados);
    }
  };

  const escolherImagem = (file: File) => {
    setNovaFoto(file);
    setAparencia((a) => ({ ...a, icone: null, fotoUrl: URL.createObjectURL(file) }));
  };

  const salvar = async () => {
    if (!nome.trim()) { toast.error('Informe o nome'); return; }
    setSalvando(true);
    try {
      if (ehGrupo) {
        const grupoId = alvo.grupo.id;
        if (novaFoto) {
          await updateGrupo.mutateAsync({ grupoId, nome: nome.trim(), foto: novaFoto });
        } else {
          await updateGrupo.mutateAsync({ grupoId, nome: nome.trim(), icone: aparencia.icone, corFundo: aparencia.corFundo, corIcone: aparencia.corIcone, limparFoto: true });
        }
        const aAdicionarIds = selecionados.filter((id) => !atuaisGerenciados.includes(id));
        const aRemoverIds = atuaisGerenciados.filter((id) => !selecionados.includes(id));
        if (aAdicionarIds.length) await addMembros.mutateAsync({ grupoId, usuarioIds: aAdicionarIds });
        if (aRemoverIds.length) await removeMembros.mutateAsync({ grupoId, usuarioIds: aRemoverIds });
      } else if (novaFoto) {
        await updateGeral.mutateAsync({ nome: nome.trim(), foto: novaFoto });
      } else {
        await updateGeral.mutateAsync({ nome: nome.trim(), icone: aparencia.icone, corFundo: aparencia.corFundo, corIcone: aparencia.corIcone, limparFoto: true });
      }
      setOpen(false);
    } catch {
      // os hooks já mostram o toast do erro/recusa
    } finally {
      setSalvando(false);
    }
  };

  if (!podeEditar) return null;

  const IconePadrao = ehGrupo ? Users2 : MessageCircle;
  const titulo = ehGrupo ? 'Editar grupo' : 'Editar Chat Geral';

  return (
    <Dialog open={open} onOpenChange={aoAbrir}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
          <Pencil className="h-3.5 w-3.5" /> {ehGrupo ? 'Editar grupo' : 'Editar'}
        </Button>
      </DialogTrigger>
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <IconePadrao className="h-5 w-5 text-primary" /> {titulo}
          </DialogTitle>
        </CabecalhoDialogo>
        <CorpoDialogo className="space-y-4">
          <SeletorDeAparencia
            nome={nome || (ehGrupo ? 'Grupo' : 'Chat Geral')}
            IconePadrao={IconePadrao}
            valor={aparencia}
            onChange={(v) => { setAparencia(v); if (v.icone) setNovaFoto(null); }}
            onEscolherImagem={escolherImagem}
          />
          <div className="space-y-2">
            <Label htmlFor="editar-nome">Nome</Label>
            <Input id="editar-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          {ehGrupo && (
            <SeletorDeMembros
              titulo="Participantes"
              membros={membros}
              meuId={meuId}
              selecionados={selecionados}
              onChange={setSelecionados}
            />
          )}
        </CorpoDialogo>
        <RodapeDialogo>
          <Button onClick={salvar} disabled={salvando} className="w-full">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
