import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CnpjData, ResultadoDaConsulta, SeNaoExistir } from '@/lib/cnpj';

const { consultarCnpjFalso } = vi.hoisted(() => ({
  consultarCnpjFalso: vi.fn<(cnpj: string) => Promise<ResultadoDaConsulta>>(),
}));

// Só a consulta é falsa: a classificação, a máscara e as frases são as de verdade.
vi.mock('@/lib/cnpj', async (original) => ({
  ...(await original<typeof import('@/lib/cnpj')>()),
  consultarCnpj: (cnpj: string) => consultarCnpjFalso(cnpj),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { CampoCnpj, type CampoCnpjHandle } from './CampoCnpj';
import { resultadoPermiteSalvar } from '@/lib/cnpj';

/** Um formulário mínimo com a mesma regra das telas: confere ao salvar e respeita a resposta. */
function Formulario({
  seNaoExistir = 'avisar',
  aceitaCpf = false,
  valorJaGravado,
  inicial = '',
  onSalvar = vi.fn(),
  onDados,
}: {
  seNaoExistir?: SeNaoExistir;
  aceitaCpf?: boolean;
  valorJaGravado?: string;
  inicial?: string;
  onSalvar?: (valor: string) => void;
  onDados?: (d: CnpjData) => void;
}) {
  const [valor, setValor] = useState(inicial);
  const ref = useRef<CampoCnpjHandle>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await ref.current!.conferir();
        if (resultadoPermiteSalvar(r, seNaoExistir)) onSalvar(valor);
      }}
    >
      <CampoCnpj
        ref={ref}
        id="documento"
        value={valor}
        onChange={setValor}
        seNaoExistir={seNaoExistir}
        aceitaCpf={aceitaCpf}
        valorJaGravado={valorJaGravado}
        onDadosEncontrados={onDados}
      />
      <button type="submit">Salvar</button>
    </form>
  );
}

const campo = () => screen.getByRole('textbox');
const digitar = (texto: string) => {
  fireEvent.change(campo(), { target: { value: texto } });
  return campo();
};
const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

describe('CampoCnpj', () => {
  beforeEach(() => consultarCnpjFalso.mockReset());

  it('🔴 fábrica: CNPJ que a Receita diz não existir não salva, e oferece cadastrar sem CNPJ', async () => {
    consultarCnpjFalso.mockResolvedValue({ caso: 'nao_existe' });
    const onSalvar = vi.fn();
    render(<Formulario seNaoExistir="bloquear" onSalvar={onSalvar} />);
    digitar('98765432000198');
    salvar();
    expect(
      await screen.findByText('A Receita Federal não tem este CNPJ. Confira os números, ou cadastre a fábrica sem CNPJ.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar sem CNPJ' }));
    expect(campo()).toHaveValue('');
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(''));
  });

  it('fábrica: serviço fora do ar não trava — salva e avisa', async () => {
    consultarCnpjFalso.mockResolvedValue({ caso: 'servico_falhou' });
    const onSalvar = vi.fn();
    render(<Formulario seNaoExistir="bloquear" onSalvar={onSalvar} />);
    digitar('11222333000181');
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith('11.222.333/0001-81'));
    expect(
      screen.getByText('Não conseguimos consultar a Receita agora. O cadastro segue com o CNPJ, sem a conferência.'),
    ).toBeInTheDocument();
  });

  it('cliente: CNPJ que a Receita não tem avisa e salva', async () => {
    consultarCnpjFalso.mockResolvedValue({ caso: 'nao_existe' });
    const onSalvar = vi.fn();
    render(<Formulario onSalvar={onSalvar} />);
    digitar('98765432000198');
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(screen.getByText(/A Receita ainda não tem este CNPJ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cadastrar sem CNPJ' })).toBeNull();
  });

  it('sair do campo e logo depois salvar consulta a Receita UMA vez só', async () => {
    consultarCnpjFalso.mockResolvedValue({
      caso: 'encontrado',
      dados: { razao_social: 'Empresa Exemplo Ltda' } as CnpjData,
    });
    const onSalvar = vi.fn();
    const onDados = vi.fn();
    render(<Formulario onSalvar={onSalvar} onDados={onDados} />);
    fireEvent.blur(digitar('11222333000181'));
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(consultarCnpjFalso).toHaveBeenCalledTimes(1);
    expect(onDados).toHaveBeenCalledTimes(1);
    expect(onDados).toHaveBeenCalledWith(expect.objectContaining({ razao_social: 'Empresa Exemplo Ltda' }));
  });

  it('aceita CPF: a máscara acompanha os dígitos, e CPF válido não consulta ninguém', async () => {
    const onSalvar = vi.fn();
    render(<Formulario aceitaCpf onSalvar={onSalvar} />);
    expect(screen.getByText('CPF ou CNPJ')).toBeInTheDocument();
    expect(digitar('52998224725')).toHaveValue('529.982.247-25');
    fireEvent.blur(campo());
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith('529.982.247-25'));
    expect(consultarCnpjFalso).not.toHaveBeenCalled();
  });

  it('aceita CPF: 12 dígitos não é nem um nem outro, e não salva', async () => {
    const onSalvar = vi.fn();
    render(<Formulario aceitaCpf onSalvar={onSalvar} />);
    fireEvent.blur(digitar('529982247251'));
    expect(await screen.findByText('CPF tem 11 dígitos e CNPJ tem 14.')).toBeInTheDocument();
    salvar();
    await new Promise((r) => setTimeout(r, 0));
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('documento gravado que ninguém mexeu não é conferido nem trava', async () => {
    const onSalvar = vi.fn();
    render(<Formulario aceitaCpf valorJaGravado="1122233300018" inicial="11.222.333/0001-8" onSalvar={onSalvar} />);
    fireEvent.blur(campo());
    salvar();
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(consultarCnpjFalso).not.toHaveBeenCalled();
    expect(screen.queryByText('CPF tem 11 dígitos e CNPJ tem 14.')).toBeNull();
  });

  it('resposta que chega depois de o campo sair da tela é descartada', async () => {
    let responder!: (r: ResultadoDaConsulta) => void;
    consultarCnpjFalso.mockReturnValue(new Promise((ok) => (responder = ok)));
    const onDados = vi.fn();
    const { unmount } = render(<Formulario onDados={onDados} />);
    fireEvent.blur(digitar('11222333000181'));
    unmount();
    responder({ caso: 'encontrado', dados: { razao_social: 'Empresa Exemplo Ltda' } as CnpjData });
    await new Promise((r) => setTimeout(r, 0));
    expect(onDados).not.toHaveBeenCalled();
  });
});
