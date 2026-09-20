import { describe, it, expect } from 'vitest';
import { montarCopiaDeNegocio, type NegocioParaCopiar } from './copia-de-negocio';

const ORIGINAL: NegocioParaCopiar = {
  nome: null,
  cliente_id: 'cliente-1',
  obra_id: 'obra-1',
  fabricante_id: 'fab-1',
  usuario_id: 'user-1',
  funil_id: 'funil-1',
  marcador_id: 'marcador-1',
  origem_lead: 'Indicação',
  endereco_entrega: 'Rua Exemplo, 100',
  valor_total: 180000,
  pdf_url: 'https://exemplo.supabase.co/storage/v1/object/public/pedido-anexos/empresa-1/abc/orcamento.pdf',
  // O que a base tem de verdade nos campos extras é rastro da importação do Bitrix.
  campos_extras: {
    'Negócio': 'Obra Exemplo',
    'Contato': 'Pessoa Exemplo',
    'Vendedor Original': 'Alguém',
    responsavel_corrigido: 'sim',
    _lote: '3',
    prioridade: 'alta', // este SIM: campo que a empresa criou
  },
};

describe('montarCopiaDeNegocio — o que a cópia leva', () => {
  it('leva cliente, obra, fábrica, responsável principal, marcador, origem, endereço, valor e anexo', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, primeiraEtapa: 'novo_lead' });
    expect(copia.clienteId).toBe('cliente-1');
    expect(copia.obraId).toBe('obra-1');
    expect(copia.fabricanteId).toBe('fab-1');
    expect(copia.vendedorId).toBe('user-1');
    expect(copia.funilId).toBe('funil-1');
    expect(copia.marcadorId).toBe('marcador-1');
    expect(copia.origemLead).toBe('Indicação');
    expect(copia.enderecoEntrega).toBe('Rua Exemplo, 100');
    expect(copia.valor).toBe(180000);
    expect(copia.pdfUrl).toBe(ORIGINAL.pdf_url);
  });

  it('leva os outros responsáveis como participantes, sem repetir o principal', () => {
    const copia = montarCopiaDeNegocio({
      negocio: ORIGINAL,
      responsaveis: [
        { usuarioId: 'user-1', principal: true },
        { usuarioId: 'user-2', principal: false },
        { usuarioId: 'user-3', principal: false },
      ],
    });
    expect(copia.participantes).toEqual(['user-2', 'user-3']);
  });

  it('campo vazio do original não vira campo preenchido na cópia', () => {
    const copia = montarCopiaDeNegocio({
      negocio: { ...ORIGINAL, obra_id: null, marcador_id: null, origem_lead: null, endereco_entrega: null, valor_total: null, pdf_url: null },
    });
    expect(copia.obraId).toBe('');
    expect(copia.marcadorId).toBe('');
    expect(copia.origemLead).toBe('');
    expect(copia.enderecoEntrega).toBe('');
    expect(copia.valor).toBeNull();
    expect(copia.pdfUrl).toBeNull();
  });
});

describe('montarCopiaDeNegocio — o que a cópia NÃO leva', () => {
  it('🔴 nasce na primeira etapa do funil, mesmo copiando um negócio ganho', () => {
    // Sem isto, o gatilho do banco carimba a data de fechamento de hoje e a MESMA venda
    // aparece duas vezes no faturamento do mês.
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, primeiraEtapa: 'primeiro-contato' });
    expect(copia.status).toBe('primeiro-contato');
  });

  it('sem saber a primeira etapa, cai na etapa inicial padrão — nunca na do original', () => {
    expect(montarCopiaDeNegocio({ negocio: ORIGINAL }).status).toBe('novo_lead');
    expect(montarCopiaDeNegocio({ negocio: ORIGINAL, primeiraEtapa: null }).status).toBe('novo_lead');
  });

  it('não leva observações nem datas: a cópia não tem esses campos', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL });
    expect(Object.keys(copia)).not.toContain('observacoes');
    expect(Object.keys(copia)).not.toContain('dataPedido');
    expect(Object.keys(copia)).not.toContain('prazoResposta');
  });

  it('🔴 leva só o campo extra que a empresa criou — rastro de importação fica para trás', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, camposDaEmpresa: ['prioridade'] });
    expect(copia.camposExtras).toEqual({ prioridade: 'alta' });
  });

  it('sem campo criado pela empresa, os campos extras da cópia ficam vazios', () => {
    expect(montarCopiaDeNegocio({ negocio: ORIGINAL }).camposExtras).toEqual({});
  });

  it('campo criado pela empresa que o original não tem não vira chave vazia', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, camposDaEmpresa: ['prioridade', 'canal'] });
    expect(copia.camposExtras).toEqual({ prioridade: 'alta' });
  });
});

describe('montarCopiaDeNegocio — quemDuplica (decisão D1 do dono do produto, 15/09/2026)', () => {
  // A regra de segurança de `pedidos` (`pedidos_insert`) só deixa quem NÃO é gestor criar um
  // negócio em nome de SI MESMO (`usuario_id = get_my_usuario_id()`). Duplicar o negócio de um
  // colega deixaria essa pessoa com um `vendedorId` que ela não pode salvar — o campo
  // Responsável vem travado na tela (`disabled={!isGestor}`) e o "Criar" seria recusado pelo
  // banco, com uma frase em inglês.
  //
  // D1, na fala literal do dono do produto (15/09/2026): "Cópia nasce dele, no entanto o
  // responsável do negócio o qual foi copiado não precisa entrar como responsável secundário,
  // pode ser somente o novo responsável mesmo." Lida como "só o novo responsável, mais
  // ninguém": nem o principal do original nem os outros responsáveis dele entram na cópia.

  it('quem duplica NÃO é gestor e NÃO é o principal do original: vira o único responsável', () => {
    const copia = montarCopiaDeNegocio({
      negocio: ORIGINAL,
      responsaveis: [
        { usuarioId: 'user-1', principal: true },
        { usuarioId: 'user-2', principal: false },
      ],
      quemDuplica: { usuarioId: 'user-9', ehGestor: false },
    });
    expect(copia.vendedorId).toBe('user-9');
    expect(copia.participantes).toEqual([]);
  });

  it('quem duplica NÃO é gestor mas É o principal do original: nada muda', () => {
    const copia = montarCopiaDeNegocio({
      negocio: ORIGINAL,
      responsaveis: [
        { usuarioId: 'user-1', principal: true },
        { usuarioId: 'user-2', principal: false },
      ],
      quemDuplica: { usuarioId: 'user-1', ehGestor: false },
    });
    expect(copia.vendedorId).toBe('user-1');
    expect(copia.participantes).toEqual(['user-2']);
  });

  it('quem duplica é gestor: nada muda, mesmo duplicando o negócio de outra pessoa', () => {
    const copia = montarCopiaDeNegocio({
      negocio: ORIGINAL,
      responsaveis: [
        { usuarioId: 'user-1', principal: true },
        { usuarioId: 'user-2', principal: false },
      ],
      quemDuplica: { usuarioId: 'user-9', ehGestor: true },
    });
    expect(copia.vendedorId).toBe('user-1');
    expect(copia.participantes).toEqual(['user-2']);
  });

  it('sem quemDuplica: comportamento de hoje, sem mudança nenhuma', () => {
    const copia = montarCopiaDeNegocio({
      negocio: ORIGINAL,
      responsaveis: [
        { usuarioId: 'user-1', principal: true },
        { usuarioId: 'user-2', principal: false },
      ],
    });
    expect(copia.vendedorId).toBe('user-1');
    expect(copia.participantes).toEqual(['user-2']);
  });
});

describe('montarCopiaDeNegocio — o nome', () => {
  it('original sem nome próprio: a cópia continua no nome automático', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL });
    expect(copia.nomeAutomatico).toBe(true);
    expect(copia.nome).toBe('');
  });

  it('original com nome próprio: a cópia vem com o mesmo nome, editável', () => {
    const copia = montarCopiaDeNegocio({ negocio: { ...ORIGINAL, nome: 'Torre A — fachada' } });
    expect(copia.nomeAutomatico).toBe(false);
    expect(copia.nome).toBe('Torre A — fachada');
  });

  it('o rótulo do original é o que a janela mostra no aviso "Cópia de"', () => {
    const copia = montarCopiaDeNegocio({ negocio: ORIGINAL, rotulo: 'Empresa Exemplo Ltda | Fábrica Exemplo' });
    expect(copia.rotuloDoOriginal).toBe('Empresa Exemplo Ltda | Fábrica Exemplo');
  });
});
