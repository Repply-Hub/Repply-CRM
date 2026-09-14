import { describe, it, expect, afterEach, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useCampoComMencao } from './use-campo-com-mencao';
import { ListaDeMencao } from '@/components/mencao/ListaDeMencao';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const PESSOAS = [{ id: 'u1', nome: 'Ângela Souza' }, { id: 'u2', nome: 'Carlos Lima' }];
let apurado: { ids: string[]; todos: boolean } | null = null;

function Campo({ ativo = true, conversaChave }: { ativo?: boolean; conversaChave?: string }) {
  const [texto, setTexto] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const m = useCampoComMencao({ texto, setTexto, pessoas: PESSOAS, ativo, totalDaConversa: 2, ref, conversaChave });
  return (
    <div>
      {m.aberta && (
        <ListaDeMencao consulta={m.consulta} sugestoes={m.sugestoes} ativa={m.ativa} onEscolher={m.escolher} mensagemVazia="vazio" />
      )}
      <textarea
        aria-label="mensagem"
        ref={ref}
        value={texto}
        onChange={m.aoMudar}
        onKeyDown={(e) => {
          if (m.aoTeclar(e)) return;
          if (e.key === 'Enter') apurado = m.paraEnviar(texto);
        }}
      />
      {/* só existe para o teste acionar `limpar()`, que não tem outra porta de entrada na tela */}
      <button type="button" aria-label="limpar" onClick={() => m.limpar()} />
    </div>
  );
}

const digitar = (valor: string) => {
  const campo = screen.getByLabelText('mensagem') as HTMLTextAreaElement;
  fireEvent.change(campo, { target: { value: valor, selectionStart: valor.length } });
  return campo;
};

const indiceDaOpcaoAtiva = () =>
  screen.getAllByRole('option').findIndex((o) => o.getAttribute('aria-selected') === 'true');

describe('useCampoComMencao', () => {
  it('digitar @ abre a lista com @todos primeiro', () => {
    render(<Campo />);
    digitar('oi @');
    const opcoes = screen.getAllByRole('option');
    expect(opcoes[0].textContent).toContain('@todos');
    expect(opcoes[0].textContent).toContain('avisa as 2 pessoas desta conversa');
  });

  it('Enter escolhe a opção ativa e o texto ganha o nome inteiro', () => {
    render(<Campo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(campo.value).toBe('oi @Ângela Souza ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('no envio, só vale quem foi escolhido e continua no texto', () => {
    render(<Campo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter' });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(apurado).toEqual({ ids: ['u1'], todos: false });
  });

  it('Esc fecha a lista e mantém o texto', () => {
    render(<Campo />);
    const campo = digitar('oi @car');
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(campo.value).toBe('oi @car');
  });

  it('desligado (conversa direta), @ não abre nada', () => {
    render(<Campo ativo={false} />);
    digitar('oi @');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // (a) — o cursor pousa depois do nome inserido mais o separador, e isso só acontece
  // dentro do requestAnimationFrame que `escolher` agenda.
  it('depois de escolher, o cursor pousa logo depois do nome inserido (via requestAnimationFrame)', () => {
    vi.useFakeTimers();
    render(<Campo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter' });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(campo.value).toBe('oi @Ângela Souza ');
    expect(campo.selectionStart).toBe(campo.value.length);
    expect(campo.selectionEnd).toBe(campo.value.length);
  });

  // (b) — ArrowDown/ArrowUp andam pela lista e dão a volta (wrap) nas pontas: a
  // implementação usa módulo, não trava (clamp) no primeiro/último item.
  it('ArrowDown/ArrowUp movem a opção ativa e dão a volta nas pontas', () => {
    render(<Campo />);
    const campo = digitar('oi @'); // 3 opções: @todos, Ângela Souza, Carlos Lima
    expect(indiceDaOpcaoAtiva()).toBe(0);
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    expect(indiceDaOpcaoAtiva()).toBe(1);
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    expect(indiceDaOpcaoAtiva()).toBe(2);
    fireEvent.keyDown(campo, { key: 'ArrowDown' }); // volta pro começo
    expect(indiceDaOpcaoAtiva()).toBe(0);
    fireEvent.keyDown(campo, { key: 'ArrowUp' }); // volta pro fim
    expect(indiceDaOpcaoAtiva()).toBe(2);
  });

  // (c) — escolher "@todos" na lista faz a apuração do envio devolver todos: true.
  it('escolher @todos faz paraEnviar devolver todos: true', () => {
    render(<Campo />);
    const campo = digitar('oi @'); // @todos é a primeira opção
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(campo.value).toBe('oi @todos ');
    fireEvent.keyDown(campo, { key: 'Enter' }); // sem @ em curso: apura o texto final
    expect(apurado).toEqual({ ids: [], todos: true });
  });

  // (d) — limpar() derruba o "@" em curso (fecha a lista) e esvazia quem tinha sido
  // escolhido, então a próxima apuração não acha mais ninguém.
  it('limpar() fecha a lista aberta e apaga quem tinha sido escolhido', () => {
    render(<Campo />);
    const primeiraEscolha = digitar('oi @ang');
    fireEvent.keyDown(primeiraEscolha, { key: 'Enter' }); // escolhe Ângela Souza
    const campo = digitar('oi @Ângela Souza @car'); // reabre a lista, buscando "car"
    expect(screen.queryByRole('listbox')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('limpar'));
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.keyDown(campo, { key: 'Enter' }); // sem @ em curso: apura
    expect(apurado).toEqual({ ids: [], todos: false }); // Ângela não sobrevive ao limpar()
  });

  // (e) — Tab escolhe a opção ativa exatamente como o Enter.
  it('Tab escolhe a opção ativa como o Enter', () => {
    render(<Campo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Tab' });
    expect(campo.value).toBe('oi @Ângela Souza ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // (f) — Esc só é nosso quando a lista está aberta. Aberta, ele para no React (nunca
  // chega no listener nativo de `window`, que é como o chat escuta "Esc → Geral").
  // Fechada, o gancho nem toca no evento, e o listener de fora ouve normalmente.
  it('Esc com a lista aberta fecha só a lista, sem deixar o atalho de fora ouvir', () => {
    const ouvinteDeFora = vi.fn();
    window.addEventListener('keydown', ouvinteDeFora);
    render(<Campo />);
    const campo = digitar('oi @car');
    fireEvent.keyDown(campo, { key: 'Escape' });
    window.removeEventListener('keydown', ouvinteDeFora);

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(campo.value).toBe('oi @car');
    expect(ouvinteDeFora).not.toHaveBeenCalled();
  });

  it('Esc com a lista fechada não é tocado pelo gancho, e o atalho de fora ouve normalmente', () => {
    const ouvinteDeFora = vi.fn();
    window.addEventListener('keydown', ouvinteDeFora);
    render(<Campo />);
    const campo = digitar('oi, tudo bem?'); // nenhum @ foi digitado: a lista nunca abriu
    fireEvent.keyDown(campo, { key: 'Escape' });
    window.removeEventListener('keydown', ouvinteDeFora);

    expect(ouvinteDeFora).toHaveBeenCalled();
  });

  // (g) — no meio de compor um caractere (acento, IME de chinês/japonês/coreano), o
  // Enter pertence à composição: o gancho não escolhe nada e a lista continua aberta.
  it('Enter durante composição de IME não é consumido e não escolhe nada', () => {
    render(<Campo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter', isComposing: true });
    expect(campo.value).toBe('oi @ang');
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  // (h) — Chat.tsx reaproveita uma instância só do componente ao trocar de conversa.
  // Trocar `conversaChave` com a lista aberta fecha a lista, e quem tinha sido escolhido
  // na conversa anterior não conta mais na apuração da conversa nova.
  it('trocar conversaChave fecha a lista e apaga quem tinha sido escolhido antes', () => {
    const { rerender } = render(<Campo conversaChave="conversa-a" />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter' }); // escolhe Ângela Souza na conversa A
    expect(campo.value).toBe('oi @Ângela Souza ');

    digitar('oi @Ângela Souza @car'); // reabre a lista, ainda na conversa A
    expect(screen.queryByRole('listbox')).not.toBeNull();

    rerender(<Campo conversaChave="conversa-b" />); // trocou de conversa
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.keyDown(campo, { key: 'Enter' }); // sem @ em curso: apura
    expect(apurado).toEqual({ ids: [], todos: false });
  });

  // (i) — desligar o @ (virar campo de conversa direta) fecha a lista aberta e esvazia
  // quem tinha sido escolhido; religar não devolve as escolhas antigas.
  it('ativo desligando fecha a lista e religar não devolve quem tinha sido escolhido antes', () => {
    const { rerender } = render(<Campo ativo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter' }); // escolhe Ângela Souza
    expect(campo.value).toBe('oi @Ângela Souza ');

    digitar('oi @Ângela Souza @car'); // reabre a lista, buscando "car"
    expect(screen.queryByRole('listbox')).not.toBeNull();

    rerender(<Campo ativo={false} />);
    expect(screen.queryByRole('listbox')).toBeNull();

    rerender(<Campo ativo />); // religa
    fireEvent.keyDown(campo, { key: 'Enter' }); // sem @ em curso: apura
    expect(apurado).toEqual({ ids: [], todos: false }); // Ângela não sobrevive ao ciclo
  });

  // (j) — Shift+Enter é "quebra linha" pra quem chama, não "escolher": o gancho não
  // consome a tecla (deixa a quebra de linha normal acontecer), mas fecha a lista.
  it('Shift+Enter não é consumido pela lista, e a lista fecha', () => {
    render(<Campo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter', shiftKey: true });
    expect(campo.value).toBe('oi @ang'); // nada foi escolhido
    expect(screen.queryByRole('listbox')).toBeNull(); // mas a lista fechou
  });
});
