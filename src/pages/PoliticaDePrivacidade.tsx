/**
 * Política de Privacidade — página PÚBLICA (fora do login), em `/politica-de-privacidade`.
 *
 * Existe porque o Google exige uma URL de política de privacidade para verificar o app de OAuth do
 * calendário, e a revisão do Google LÊ esta página — em especial a seção "Dados do Google", que
 * precisa descrever como o app acessa/usa/guarda/compartilha os dados do usuário do Google e afirmar
 * conformidade com o Uso Limitado. Mantida simples e pública (o rastreador do Google precisa alcançar).
 *
 * 🔴 Documento legal do produto: o Lucas revisa e ajusta (razão social/CNPJ e e-mail de contato de
 * privacidade) antes de publicar de vez.
 */
export default function PoliticaDePrivacidade() {
  const atualizacao = '24 de setembro de 2026';

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
      <h1 className="text-2xl font-extrabold tracking-tight">Política de Privacidade — Repply CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">Última atualização: {atualizacao}</p>

      <section className="mt-8 space-y-3 text-sm leading-relaxed">
        <p>
          Esta Política descreve como o <strong>Repply CRM</strong> ("Repply", "nós") trata dados
          pessoais dos usuários e das empresas que usam o sistema, em conformidade com a Lei Geral de
          Proteção de Dados (LGPD, Lei nº 13.709/2018).
        </p>
      </section>

      <h2 className="mt-8 text-lg font-bold">1. Quem trata os dados</h2>
      <p className="mt-2 text-sm leading-relaxed">
        O Repply CRM é um sistema de gestão comercial (CRM) para representantes comerciais. Cada
        empresa assinante é responsável (controladora) pelos dados que insere no sistema sobre seus
        clientes, contatos e negócios; o Repply atua como operador desses dados, processando-os para
        prestar o serviço.
      </p>

      <h2 className="mt-8 text-lg font-bold">2. Quais dados tratamos</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
        <li><strong>Dados de conta:</strong> nome, e-mail e credenciais de acesso dos usuários da equipe.</li>
        <li><strong>Dados comerciais inseridos pela empresa:</strong> clientes, contatos, negócios, obras, tarefas e agenda.</li>
        <li>
          <strong>Integrações que o usuário conecta por opção:</strong> e-mail e WhatsApp (para
          centralizar a comunicação) e o calendário externo (Google) — descrito na seção 3.
        </li>
        <li><strong>Dados de uso:</strong> registros técnicos necessários para operar e proteger o sistema.</li>
      </ul>

      <h2 className="mt-8 text-lg font-bold">3. Dados do Google (sincronização de calendário)</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed">
        <p>
          Quando o usuário opta por conectar o Google Calendar, o Repply solicita o escopo
          <code className="mx-1 rounded bg-muted px-1">calendar.app.created</code>, que permite ao
          aplicativo criar e gerenciar <strong>apenas um calendário próprio</strong> (chamado "Repply
          CRM") dentro da conta Google do usuário. <strong>O Repply não acessa, não lê e não altera os
          demais calendários nem os eventos pessoais</strong> do usuário no Google.
        </p>
        <p>
          <strong>Como usamos:</strong> exclusivamente para sincronizar, nos dois sentidos, os eventos
          da agenda do usuário dentro do Repply com esse calendário "Repply CRM" — para que ele veja
          seus compromissos do Repply no celular e vice-versa.
        </p>
        <p>
          <strong>Como guardamos:</strong> as credenciais de acesso ao Google (tokens) ficam
          armazenadas de forma <strong>criptografada</strong> em nossos servidores e não são expostas
          ao navegador nem a outros usuários. <strong>Não compartilhamos</strong> os dados do Google
          com terceiros e não os usamos para publicidade nem para treinar modelos de inteligência
          artificial.
        </p>
        <p>
          <strong>Como o usuário controla:</strong> a qualquer momento o usuário pode desconectar o
          Google dentro do Repply; ao desconectar, o acesso é revogado e o vínculo é removido.
        </p>
        <p>
          O uso e a transferência de informações recebidas das APIs do Google pelo Repply obedecem à
          {' '}
          <a
            className="text-primary underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , inclusive aos requisitos de <strong>Uso Limitado</strong> (Limited Use).
        </p>
      </div>

      <h2 className="mt-8 text-lg font-bold">4. Com quem compartilhamos</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Não vendemos dados pessoais. Compartilhamos dados apenas com prestadores que viabilizam o
        serviço (por exemplo, a infraestrutura de nuvem e banco de dados, e os provedores das
        integrações de e-mail, WhatsApp e calendário que o próprio usuário conecta), e somente na
        medida necessária para operar o Repply, ou quando exigido por lei.
      </p>

      <h2 className="mt-8 text-lg font-bold">5. Como protegemos</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Adotamos medidas técnicas e organizacionais de segurança, incluindo controle de acesso por
        empresa, regras de segurança no banco de dados e criptografia de credenciais sensíveis.
      </p>

      <h2 className="mt-8 text-lg font-bold">6. Seus direitos (LGPD)</h2>
      <p className="mt-2 text-sm leading-relaxed">
        O titular pode solicitar acesso, correção, portabilidade e exclusão de seus dados, além de
        informações sobre o tratamento. Pedidos de exclusão de dados de conta e das integrações
        conectadas podem ser feitos pelos canais de contato abaixo.
      </p>

      <h2 className="mt-8 text-lg font-bold">7. Retenção e exclusão</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Mantemos os dados enquanto a conta estiver ativa e pelo prazo necessário para cumprir
        obrigações legais. Ao encerrar a conta, ou a pedido, os dados são excluídos ou anonimizados,
        salvo o que a lei exigir preservar.
      </p>

      <h2 className="mt-8 text-lg font-bold">8. Contato</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Dúvidas sobre privacidade ou pedidos relacionados aos seus dados: WhatsApp{' '}
        <strong>(84) 99670-4294</strong>.
      </p>

      <h2 className="mt-8 text-lg font-bold">9. Alterações</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Podemos atualizar esta Política. A data de "última atualização" no topo indica a versão
        vigente; mudanças relevantes serão comunicadas pelos canais do serviço.
      </p>

      <p className="mt-10 text-xs text-muted-foreground">Repply CRM · crm.repplyhub.com.br</p>
    </main>
  );
}
