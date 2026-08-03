import {
  CalendarDays,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  Globe,
  HardHat,
  History,
  Kanban,
  LayoutDashboard,
  Mail,
  MessageCircle,
  MessageSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { HeaderSecao, LPSection } from './LPSection';

// Os dois primeiros ganham card duplo porque são o que o concorrente genérico
// não tem: o WhatsApp de verdade dentro do CRM e a prospecção por licença de obra.
const DESTAQUES = [
  {
    icone: MessageCircle,
    titulo: 'WhatsApp de verdade, dentro do CRM',
    texto:
      'Todas as conversas do time num painel só, com áudio, imagem, documento, resposta citada e reação. Cada conversa se liga ao cliente e ao negócio, então quem assume no lugar do colega entra sabendo o que já foi combinado.',
  },
  {
    icone: Globe,
    titulo: 'Ache a obra antes do concorrente',
    texto:
      'O Portal consulta licenças ambientais e publicações oficiais e traz obra nova com responsável e endereço. Em vez de esperar o cliente ligar, você chega quando o projeto ainda está saindo do papel.',
  },
];

const RECURSOS = [
  { icone: Kanban, titulo: 'Funil configurável', texto: 'Etapas e funis do jeito da sua operação, com arrastar e soltar.' },
  { icone: Users, titulo: 'Clientes e contatos', texto: 'Carteira com histórico de cada visita, ligação e proposta.' },
  { icone: HardHat, titulo: 'Obras no mapa', texto: 'Cada obra com endereço, responsáveis e os negócios ligados a ela.' },
  { icone: Factory, titulo: 'Fabricantes e tabelas', texto: 'Catálogo com tabela de preço por fabricante, sempre à mão.' },
  { icone: Mail, titulo: 'E-mail integrado', texto: 'Gmail conectado: envie a proposta sem sair do negócio.' },
  { icone: LayoutDashboard, titulo: 'Dashboard', texto: 'Faturamento, conversão e o que ainda dá para fechar no mês.' },
  { icone: ClipboardList, titulo: 'Tarefas com prazo', texto: 'Follow-up com dono e data. O retorno não fica na memória.' },
  { icone: CalendarDays, titulo: 'Agenda', texto: 'Visitas e compromissos do time, com lembrete automático.' },
  { icone: MessageSquare, titulo: 'Chat interno', texto: 'O time resolve por dentro, junto do negócio em questão.' },
  { icone: FileSpreadsheet, titulo: 'Importação', texto: 'Sua planilha vira base organizada em três passos.' },
  { icone: ShieldCheck, titulo: 'Permissão por módulo', texto: 'Você decide o que cada cargo vê, cria, edita e exclui.' },
  { icone: History, titulo: 'Histórico de alterações', texto: 'Quem mudou o quê e quando, negócio por negócio.' },
];

export function RecursosSection() {
  return (
    <LPSection id="recursos" tom="ink">
      <HeaderSecao
        eyebrow="Recursos"
        titulo={
          <>
            Feito para quem vende <span className="text-primary">para obra</span>.
          </>
        }
        apoio="Não é um CRM genérico com os nomes trocados. Aqui já existe obra, fabricante, tabela de preço e pedido — o vocabulário que seu time usa todo dia, sem precisar adaptar nada."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {DESTAQUES.map(({ icone: Icone, titulo, texto }) => (
          <div
            key={titulo}
            className="rounded-2xl border border-primary/25 bg-lp-ink-elevado p-7 transition-colors hover:border-primary/50"
          >
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary">
              <Icone className="h-5 w-5 text-lp-ink" strokeWidth={1.8} />
            </span>
            <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">{titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{texto}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
          <div
            key={titulo}
            className="rounded-xl border border-border bg-lp-ink-elevado p-5 transition-colors hover:border-primary/40"
          >
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Icone className="h-5 w-5 text-primary" strokeWidth={1.75} />
            </span>
            <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
              {titulo}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{texto}</p>
          </div>
        ))}
      </div>
    </LPSection>
  );
}
