import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CampoTelefones } from './CampoTelefones';

/** O formulário de quem usa: guarda o texto do banco e mostra o que seria gravado. */
function Formulario({ inicial = '', onValor = vi.fn() }: { inicial?: string; onValor?: (v: string) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <CampoTelefones
        value={valor}
        onChange={(v) => {
          setValor(v);
          onValor(v);
        }}
      />
      <output data-testid="banco">{valor}</output>
    </>
  );
}

const campos = () => screen.getAllByRole('textbox') as HTMLInputElement[];
const banco = () => screen.getByTestId('banco').textContent;

describe('CampoTelefones', () => {
  it('cadastro com dois números abre dois campos, cada um formatado', () => {
    render(<Formulario inicial="5584999998888, 558432221111" />);
    expect(campos().map((c) => c.value)).toEqual(['(84) 99999-8888', '(84) 3222-1111']);
  });

  it('🔴 abrir e não mexer não reescreve o que está no banco', () => {
    const onValor = vi.fn();
    render(<Formulario inicial="5584999998888, 558432221111" onValor={onValor} />);
    expect(onValor).not.toHaveBeenCalled();
    expect(banco()).toBe('5584999998888, 558432221111');
  });

  it('"+ outro telefone" abre um campo vazio que não some, e o número entra com vírgula', () => {
    render(<Formulario inicial="84999998888" />);
    fireEvent.click(screen.getByRole('button', { name: '+ outro telefone' }));
    expect(campos()).toHaveLength(2);
    fireEvent.change(campos()[1], { target: { value: '8432221111' } });
    fireEvent.blur(campos()[1]);
    expect(campos()[1].value).toBe('(84) 3222-1111');
    expect(banco()).toBe('(84) 99999-8888, (84) 3222-1111');
  });

  it('digita como a pessoa escreve, e formata só ao sair', () => {
    render(<Formulario />);
    fireEvent.change(campos()[0], { target: { value: '8499999' } });
    expect(campos()[0].value).toBe('8499999');
    fireEvent.change(campos()[0], { target: { value: '84999998888' } });
    fireEvent.blur(campos()[0]);
    expect(campos()[0].value).toBe('(84) 99999-8888');
  });

  it('🔴 o 12º dígito não entra', () => {
    render(<Formulario inicial="84999998888" />);
    fireEvent.change(campos()[0], { target: { value: '(84) 99999-88881' } });
    expect(campos()[0].value).toBe('(84) 99999-8888');
  });

  it('o × tira só aquele número; o primeiro campo não tem ×', () => {
    render(<Formulario inicial="84999998888, 8432221111, 84999997777" />);
    expect(screen.queryByRole('button', { name: 'Tirar o telefone 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar o telefone 2' }));
    expect(banco()).toBe('(84) 99999-8888, (84) 99999-7777');
  });

  it('colar dois números num campo abre um campo para cada', () => {
    render(<Formulario />);
    fireEvent.change(campos()[0], { target: { value: '84999998888, 8432221111' } });
    expect(campos().map((c) => c.value)).toEqual(['(84) 99999-8888', '(84) 3222-1111']);
    expect(banco()).toBe('(84) 99999-8888, (84) 3222-1111');
  });

  it('digitar a vírgula abre o próximo campo, sem gravar vírgula solta', () => {
    render(<Formulario inicial="84999998888" />);
    fireEvent.change(campos()[0], { target: { value: '(84) 99999-8888,' } });
    expect(campos()).toHaveLength(2);
    // Um campo vazio a mais não muda nada para o banco — e vírgula solta nunca chega lá.
    expect(banco()).not.toContain(',');
  });

  it('mudança de fora redesenha os campos (formulário limpo, consulta de CNPJ que preenche)', () => {
    const { rerender } = render(<CampoTelefones value="84999998888, 8432221111" onChange={vi.fn()} />);
    expect(campos()).toHaveLength(2);
    rerender(<CampoTelefones value="" onChange={vi.fn()} />);
    expect(campos()).toHaveLength(1);
    expect(campos()[0].value).toBe('');
    rerender(<CampoTelefones value="2121660000" onChange={vi.fn()} />);
    expect(campos()[0].value).toBe('(21) 2166-0000');
  });

  it('estrangeiro e identificador de grupo passam intactos', () => {
    render(<Formulario inicial="+1 415 555 0123, 120363012345678901@g.us" />);
    expect(campos().map((c) => c.value)).toEqual(['+1 415 555 0123', '120363012345678901@g.us']);
  });

  it('obrigatório e id valem para o primeiro campo', () => {
    render(<CampoTelefones value="" onChange={vi.fn()} obrigatorio id="telefone" />);
    expect(campos()[0]).toBeRequired();
    expect(campos()[0]).toHaveAttribute('id', 'telefone');
  });
});
