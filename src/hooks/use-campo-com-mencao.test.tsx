import { describe, it, expect, afterEach } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useCampoComMencao } from './use-campo-com-mencao';
import { ListaDeMencao } from '@/components/mencao/ListaDeMencao';

afterEach(cleanup);

const PESSOAS = [{ id: 'u1', nome: 'Ângela Souza' }, { id: 'u2', nome: 'Carlos Lima' }];
let apurado: { ids: string[]; todos: boolean } | null = null;

function Campo({ ativo = true }: { ativo?: boolean }) {
  const [texto, setTexto] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const m = useCampoComMencao({ texto, setTexto, pessoas: PESSOAS, ativo, totalDaConversa: 2, ref });
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
    </div>
  );
}

const digitar = (valor: string) => {
  const campo = screen.getByLabelText('mensagem') as HTMLTextAreaElement;
  fireEvent.change(campo, { target: { value: valor, selectionStart: valor.length } });
  return campo;
};

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
});
