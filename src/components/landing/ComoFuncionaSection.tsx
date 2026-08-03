import { KeyRound, TrendingUp, Upload } from 'lucide-react';
import { HeaderSecao, LPSection } from './LPSection';

const PASSOS = [
  {
    num: 'PASSO 01',
    icone: Upload,
    titulo: 'Suba sua carteira',
    texto:
      'Crie a conta da empresa e importe o que você já tem — planilha de Excel ou CSV com clientes, contatos e negócios em aberto. O sistema reconhece as colunas sozinho e mostra uma prévia antes de gravar nada.',
  },
  {
    num: 'PASSO 02',
    icone: KeyRound,
    destaque: true,
    titulo: 'Chame o time pelo código',
    texto:
      'Sua empresa recebe um código de acesso. O vendedor se cadastra com ele e já entra na empresa certa, com as permissões que você definir por módulo. Ele não paga nada: a assinatura é da empresa, sem cobrança por usuário.',
  },
  {
    num: 'PASSO 03',
    icone: TrendingUp,
    titulo: 'Venda com tudo no lugar',
    texto:
      'Conecte o WhatsApp e o Gmail, monte as etapas do funil do seu jeito e acompanhe pelo dashboard o que está para fechar no mês. Cada negócio guarda conversa, proposta, obra e histórico de quem mexeu.',
  },
];

export function ComoFuncionaSection() {
  return (
    <LPSection tom="creme">
      <HeaderSecao
        eyebrow="Como funciona"
        titulo={
          <>
            Do zero ao time inteiro vendendo em <span className="text-primary">três passos</span>.
          </>
        }
        apoio="Sem implantação longa, sem consultoria e sem trocar o jeito que sua equipe já trabalha. Dá para começar hoje e ajustar depois."
      />

      <ol className="grid gap-6 lg:grid-cols-3">
        {PASSOS.map(({ num, icone: Icone, titulo, texto, destaque }) => (
          <li key={num} className="rounded-2xl border border-border bg-card p-7 shadow-card">
            <p className="mb-4 font-display text-xs font-semibold tracking-[0.06em] text-primary">{num}</p>
            <span
              className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${
                destaque ? 'bg-primary text-lp-ink' : 'bg-foreground text-background'
              }`}
            >
              <Icone className="h-5 w-5" strokeWidth={1.7} />
            </span>
            <h3 className="font-display text-xl font-semibold tracking-tight text-card-foreground">
              {titulo}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
          </li>
        ))}
      </ol>
    </LPSection>
  );
}
