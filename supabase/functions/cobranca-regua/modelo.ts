/**
 * O texto e o layout do e-mail de cobrança, um por degrau da régua.
 *
 * 🔴 QUATRO TEXTOS, NÃO UM. O que a pessoa precisa ouvir no dia 1 ("o cartão falhou, o banco
 * vai tentar de novo") não é o que ela precisa ouvir no dia 83 ("faltam 7 dias para os dados
 * serem apagados"). Um texto genérico serviria mal aos dois: cedo demais assusta quem só teve
 * um cartão vencido, e tarde demais não avisa quem está prestes a perder tudo.
 *
 * 🔴 E NENHUM DELES ACUSA. A régua só alcança quem TEVE assinatura de verdade e ela caiu —
 * cortesia, legacy e quem nunca assinou ficam fora por construção (`empresas_na_regua`). Mas
 * mesmo aqui o tom é de aviso, não de cobrança de dívida: quase toda inadimplência em SaaS é
 * cartão vencido, não cliente fugindo.
 *
 * O HTML é de tabela, com estilo em linha, porque cliente de e-mail não entende folha de
 * estilo nem grade moderna. Mesmo molde de `pauta-resumo-diario/modelo.ts`, que já foi
 * testado no Gmail e no Outlook.
 */

export type Degrau = "tolerancia" | "somente_leitura" | "suspensa" | "prazo_esgotado";

interface Entrada {
  degrau: Degrau;
  dias: number;
  nomeDaEmpresa: string;
  link: string;
}

interface Conteudo {
  assunto: string;
  manchete: string;
  corpo: string;
  botao: string;
  /** A cor da tarja do topo. Sobe de tom conforme a régua avança. */
  cor: string;
}

/** Escapa o que vem do banco. Nome de empresa é texto livre e vai para dentro de HTML. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function conteudoDoDegrau({ degrau, dias }: Entrada): Conteudo {
  switch (degrau) {
    case "tolerancia":
      return {
        assunto: "Não conseguimos processar seu pagamento",
        manchete: "O pagamento não passou",
        // Dizer que o sistema continua funcionando é o que evita o susto — e é verdade:
        // durante a tolerância nada é bloqueado.
        corpo:
          "A cobrança da sua assinatura foi recusada e o banco vai tentar de novo automaticamente nos próximos dias. " +
          "<strong>Nada mudou no sistema</strong>: sua equipe continua trabalhando normalmente. " +
          "Na maioria das vezes é só um cartão vencido — conferir os dados agora resolve.",
        botao: "Conferir forma de pagamento",
        cor: "#a8710f",
      };

    case "somente_leitura":
      return {
        assunto: "Seu acesso ficou somente leitura",
        manchete: "O sistema entrou em modo leitura",
        corpo:
          `Já são ${dias} dias sem conseguirmos processar o pagamento. ` +
          "A partir de agora sua equipe <strong>continua vendo e exportando tudo</strong>, mas não consegue criar nem editar. " +
          "<strong>Nenhum dado foi perdido.</strong> Assim que o pagamento for regularizado, tudo volta na hora.",
        botao: "Regularizar agora",
        cor: "#c0341b",
      };

    case "suspensa":
      return {
        assunto: "Acesso suspenso — seus dados continuam guardados",
        manchete: "O acesso foi suspenso",
        corpo:
          `São ${dias} dias de avisos sem retorno, e o acesso ao sistema foi suspenso. ` +
          "<strong>Seus dados não foram apagados</strong> e continuam guardados. " +
          "Você tem até o 90º dia para regularizar e recuperar tudo exatamente como estava.",
        botao: "Recuperar meu acesso",
        cor: "#c0341b",
      };

    case "prazo_esgotado":
      return {
        assunto: "Último aviso antes do encerramento da conta",
        manchete: "Falta pouco para o prazo acabar",
        corpo:
          "O prazo para regularizar está terminando. Depois dele, a conta e todos os dados dela " +
          "<strong>serão apagados em definitivo</strong> — clientes, obras, negócios e conversas. " +
          "Se ainda quiser manter tudo, este é o momento.",
        botao: "Regularizar antes do prazo",
        cor: "#c0341b",
      };
  }
}

export function montarAviso(entrada: Entrada): { assunto: string; html: string } {
  const { manchete, corpo, botao, cor, assunto } = conteudoDoDegrau(entrada);
  const empresa = escapar(entrada.nomeDaEmpresa);

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;background:#f5f5f4;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:14px;overflow:hidden;">
      <tr><td style="height:4px;background:${cor};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:28px 28px 8px;">
        <p style="margin:0 0 6px;font:600 12px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#837c71;">Repply CRM · ${empresa}</p>
        <h1 style="margin:0;font:700 22px/1.25 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16140f;">${manchete}</h1>
      </td></tr>
      <tr><td style="padding:12px 28px 4px;">
        <p style="margin:0;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#4a453d;">${corpo}</p>
      </td></tr>
      <tr><td style="padding:24px 28px 28px;">
        <a href="${entrada.link}" style="display:inline-block;background:#e8480f;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font:600 15px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;">${botao}</a>
      </td></tr>
      <tr><td style="padding:0 28px 26px;">
        <p style="margin:0;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#837c71;">
          Se você já regularizou, pode ignorar este aviso — o sistema reconhece o pagamento sozinho.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

  return { assunto, html };
}
