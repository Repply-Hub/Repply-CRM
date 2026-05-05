export type KanbanStage = 'novo_lead' | 'elaboracao' | 'enviado' | 'negociacao' | 'fechamento';

export interface Order {
  id: string;
  clientName: string;
  obra: string;
  fabricante: string;
  valor: number;
  stage: KanbanStage;
  daysInStage: number;
  alertDays: number;
  vendedor: string;
  createdAt: string;
  campos_extras?: Record<string, any>;
}

export interface Client {
  id: string;
  tipo: 'construtora' | 'loja' | 'pessoa_fisica';
  razaoSocial: string;
  cnpj?: string;
  cpf?: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  obras?: Obra[];
}

export interface Obra {
  id: string;
  nome: string;
  endereco: string;
  responsavel: string;
  status: 'ativa' | 'concluida' | 'parada';
}

export interface ContactHistory {
  id: string;
  orderId: string;
  type: 'email' | 'telefone' | 'whatsapp' | 'visita';
  description: string;
  date: string;
  user: string;
}

export interface Fabricante {
  id: string;
  nome: string;
  tabela: string;
  ultimaAtualizacao: string;
}

export interface Vendedor {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}
