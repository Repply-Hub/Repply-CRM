import { Order, Client, Fabricante, Vendedor, ContactHistory } from '@/types';

export const mockOrders: Order[] = [
  { id: '1', clientName: 'Construtora Alpha', obra: 'Ed. Solar', fabricante: 'Portobello', valor: 85000, stage: 'novo_lead', daysInStage: 2, alertDays: 5, vendedor: 'Carlos', createdAt: '2026-03-01' },
  { id: '2', clientName: 'Loja CasaPro', obra: 'Estoque', fabricante: 'Eliane', valor: 32000, stage: 'novo_lead', daysInStage: 6, alertDays: 5, vendedor: 'Ana', createdAt: '2026-02-27' },
  { id: '3', clientName: 'Construtora Beta', obra: 'Cond. Parque', fabricante: 'Deca', valor: 120000, stage: 'elaboracao', daysInStage: 3, alertDays: 7, vendedor: 'Carlos', createdAt: '2026-02-25' },
  { id: '4', clientName: 'Eng. Silva', obra: 'Res. Aurora', fabricante: 'Portobello', valor: 45000, stage: 'elaboracao', daysInStage: 8, alertDays: 7, vendedor: 'Maria', createdAt: '2026-02-20' },
  { id: '5', clientName: 'Loja MatCon', obra: 'Revenda', fabricante: 'Incepa', valor: 67000, stage: 'enviado', daysInStage: 1, alertDays: 5, vendedor: 'Ana', createdAt: '2026-02-28' },
  { id: '6', clientName: 'Construtora Gama', obra: 'Shopping Norte', fabricante: 'Roca', valor: 250000, stage: 'negociacao', daysInStage: 4, alertDays: 10, vendedor: 'Carlos', createdAt: '2026-02-15' },
  { id: '7', clientName: 'Arq. Moderna', obra: 'Casa Alto Padrão', fabricante: 'Portobello', valor: 95000, stage: 'negociacao', daysInStage: 12, alertDays: 10, vendedor: 'Maria', createdAt: '2026-02-05' },
  { id: '8', clientName: 'Construtora Delta', obra: 'Ed. Montanha', fabricante: 'Eliane', valor: 180000, stage: 'fechamento', daysInStage: 1, alertDays: 3, vendedor: 'Carlos', createdAt: '2026-01-20' },
];

export const mockClients: Client[] = [
  { id: '1', tipo: 'construtora', razaoSocial: 'Construtora Alpha Ltda', cnpj: '12.345.678/0001-99', email: 'contato@alpha.com.br', telefone: '(11) 3456-7890', endereco: 'Av. Paulista, 1000', cidade: 'São Paulo', estado: 'SP', obras: [
    { id: 'o1', nome: 'Ed. Solar', endereco: 'Rua das Flores, 100', responsavel: 'João Silva', status: 'ativa' },
    { id: 'o2', nome: 'Cond. Estrela', endereco: 'Av. Brasil, 500', responsavel: 'Maria Santos', status: 'ativa' },
  ]},
  { id: '2', tipo: 'loja', razaoSocial: 'CasaPro Materiais', cnpj: '98.765.432/0001-11', email: 'vendas@casapro.com.br', telefone: '(21) 2345-6789', endereco: 'Rua do Comércio, 200', cidade: 'Rio de Janeiro', estado: 'RJ' },
  { id: '3', tipo: 'pessoa_fisica', razaoSocial: 'Eng. Roberto Silva', cpf: '123.456.789-00', email: 'roberto@email.com', telefone: '(31) 9876-5432', endereco: 'Rua das Palmeiras, 50', cidade: 'Belo Horizonte', estado: 'MG' },
];

export const mockFabricantes: Fabricante[] = [
  { id: '1', nome: 'Portobello', tabela: 'Tabela 2026-Q1', ultimaAtualizacao: '2026-01-15' },
  { id: '2', nome: 'Eliane', tabela: 'Tabela Mar/2026', ultimaAtualizacao: '2026-03-01' },
  { id: '3', nome: 'Deca', tabela: 'Tabela 2026', ultimaAtualizacao: '2026-02-10' },
  { id: '4', nome: 'Roca', tabela: 'Tabela 2026-A', ultimaAtualizacao: '2026-01-20' },
  { id: '5', nome: 'Incepa', tabela: 'Tabela 2026-1', ultimaAtualizacao: '2026-02-28' },
];

export const mockVendedores: Vendedor[] = [
  { id: '1', nome: 'Carlos Mendes', email: 'carlos@md.com.br', ativo: true },
  { id: '2', nome: 'Ana Oliveira', email: 'ana@md.com.br', ativo: true },
  { id: '3', nome: 'Maria Costa', email: 'maria@md.com.br', ativo: true },
  { id: '4', nome: 'Pedro Lima', email: 'pedro@md.com.br', ativo: false },
];

export const mockContacts: ContactHistory[] = [
  { id: '1', orderId: '6', type: 'whatsapp', description: 'Cliente solicitou desconto de 5%', date: '2026-03-04', user: 'Carlos' },
  { id: '2', orderId: '6', type: 'email', description: 'Enviada proposta revisada', date: '2026-03-03', user: 'Carlos' },
  { id: '3', orderId: '6', type: 'telefone', description: 'Primeiro contato sobre o projeto', date: '2026-03-01', user: 'Carlos' },
];

export const KANBAN_STAGES = [
  { key: 'novo_lead' as const, label: 'Novo Lead', color: 'kanban-new' },
  { key: 'elaboracao' as const, label: 'Elaboração de Orçamento', color: 'kanban-budget' },
  { key: 'enviado' as const, label: 'Orçamento Enviado', color: 'kanban-sent' },
  { key: 'negociacao' as const, label: 'Negociação', color: 'kanban-negotiation' },
  { key: 'fechamento' as const, label: 'Fechamento', color: 'kanban-closed' },
];
