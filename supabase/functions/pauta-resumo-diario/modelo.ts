/**
 * O HTML do resumo diário — a ÚNICA cópia.
 *
 * Ficava em `supabase/templates/resumo-diario.html` e veio para dentro da função em
 * 25/08/2026, quando a função passou a existir. Manter os dois seria contrariar o que o
 * próprio README daquela pasta diz: separados, um dia divergem no estilo. Os três de
 * autenticação continuam lá, porque quem os consome é o painel do Supabase, não este código.
 *
 * As restrições de e-mail que moldaram este HTML estão explicadas naquele README: fonte de
 * sistema (a da marca vem de servidor externo e os clientes removem) e estilo inline em
 * tabela (bloco `<style>` é descartado, e flex quebra no Outlook).
 */

export const MODELO_RESUMO = String.raw`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;background:#f5f5f4;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e7e5e4;">

        <tr>
          <td style="padding:32px 32px 0;">
            <span style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#0a0a0a;">Repply<span style="color:#FF5A1F;">.</span></span>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0;">
            <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#78716c;">
              Bom dia, {{PAUTA_NOME}}.
            </p>
            <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:25px;font-weight:600;line-height:1.25;letter-spacing:-0.02em;color:#0a0a0a;">
              {{PAUTA_MANCHETE}}<span style="color:#FF5A1F;">.</span>
            </h1>
            <p style="margin:6px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#78716c;">
              {{PAUTA_VALOR}}
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0;">
            {{PAUTA_ITENS}}
          </td>
        </tr>

        <tr>
          <td style="padding:8px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#FF5A1F;border-radius:9px;">
                  <a href="{{PAUTA_LINK}}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                    Abrir minha pauta
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 32px;">
            <div style="height:1px;background:#e7e5e4;margin-bottom:16px;"></div>
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#a8a29e;">
              Este resumo sai nos dias escolhidos pelo gestor da sua empresa, em Configurações →
              Automação. É a mesma pauta que aparece na tela "Hoje".
            </p>
          </td>
        </tr>

      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td align="center" style="padding:18px 16px 0;">
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#a8a29e;">
              Repply CRM · mensagem automática, não responda
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>`;

/** Um item da pauta. A função repete isto e junta em `{{PAUTA_ITENS}}`. */
export const MODELO_ITEM = String.raw`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;border:1px solid #e7e5e4;border-radius:10px;">
    <tr>
      <td style="padding:16px 18px;">
        <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#dc2626;">
          ITEM_SELO
          <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:400;text-transform:none;letter-spacing:0;color:#78716c;">&nbsp;&nbsp;ITEM_VALOR</span>
        </p>
        <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.35;color:#0a0a0a;">
          ITEM_TITULO
        </p>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#57534e;">
          ITEM_DETALHE
        </p>
      </td>
    </tr>
  </table>`;
