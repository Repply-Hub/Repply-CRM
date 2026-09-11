/**
 * O que a agenda diz a um participante — no chat, no sininho e no e-mail.
 *
 * Puro de propósito (sem import, sem rede): roda no robô `eventos-lembrete` (Deno) e é
 * testado pelo Vitest (`src/lib/aviso-de-evento.test.ts`), o mesmo arquivo nos dois.
 *
 * 🔴 O FUSO É FIXO EM SÃO PAULO. O servidor roda em UTC; sem o fuso, o compromisso das
 * 21h aparece como 00h do dia seguinte.
 */

export type TipoDeAviso = 'convite' | 'alteracao' | 'cancelamento' | 'retirado' | 'lembrete';

export interface DadosDoEvento {
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  inicio_antes: string | null;
  fim_antes: string | null;
  obra: string | null;
  organizador: string | null;
  participantes: string[];
}

export interface AvisoDeEvento {
  tipo: TipoDeAviso;
  minutos: number | null;
  dados: DadosDoEvento;
}

const FUSO = 'America/Sao_Paulo';

function diaDaSemana(iso: string, estilo: 'long' | 'short'): string {
  const bruto = new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, weekday: estilo });
  // "quarta-feira" → "quarta"; "qua." → "qua"
  return bruto.replace('-feira', '').replace('.', '');
}

function diaEMes(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
}

function mesmoDia(a: string, b: string): boolean {
  return diaEMes(a) === diaEMes(b);
}

/** "quarta, 16/09" */
function dia(iso: string): string {
  return `${diaDaSemana(iso, 'long')}, ${diaEMes(iso)}`;
}

/** "quarta, 16/09, às 14:00" — ou "quarta, 16/09, o dia todo". */
function pontual(iso: string, diaInteiro: boolean): string {
  return diaInteiro ? `${dia(iso)}, o dia todo` : `${dia(iso)}, às ${hora(iso)}`;
}

/** "quarta, 16/09, das 14:00 às 15:00" — cai para `pontual` se termina noutro dia. */
function faixa(d: DadosDoEvento): string {
  if (d.dia_inteiro) return `${dia(d.inicio)}, o dia todo`;
  if (!mesmoDia(d.inicio, d.fim)) return pontual(d.inicio, false);
  return `${dia(d.inicio)}, das ${hora(d.inicio)} às ${hora(d.fim)}`;
}

export function antecedencia(minutos: number): string {
  if (minutos % 1440 === 0) {
    const n = minutos / 1440;
    return n === 1 ? '1 dia' : `${n} dias`;
  }
  if (minutos % 60 === 0) {
    const n = minutos / 60;
    return n === 1 ? '1 hora' : `${n} horas`;
  }
  return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
}

export function textoDoChat(a: AvisoDeEvento): string {
  const d = a.dados;
  switch (a.tipo) {
    case 'convite':
      return `📅 Convite automático: ${d.titulo} — ${faixa(d)}.${d.obra ? ` Obra: ${d.obra}.` : ''}`;
    case 'alteracao':
      return `📅 Evento alterado: ${d.titulo} — era ${pontual(d.inicio_antes ?? d.inicio, d.dia_inteiro)}; agora é ${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'cancelamento':
      return `📅 Evento cancelado: ${d.titulo} — ${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'retirado':
      return `📅 Evento cancelado para você: ${d.titulo} — ${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'lembrete':
      return `🔔 Lembrete automático: ${d.titulo} começa em ${antecedencia(a.minutos ?? 0)} (${pontual(d.inicio, d.dia_inteiro)}).`;
  }
}

export function tituloDoSininho(a: AvisoDeEvento): string {
  const t = a.dados.titulo;
  switch (a.tipo) {
    case 'convite': return `📅 Convite: ${t}`;
    case 'alteracao': return `📅 Evento alterado: ${t}`;
    case 'cancelamento': return `📅 Evento cancelado: ${t}`;
    case 'retirado': return `📅 Evento cancelado para você: ${t}`;
    case 'lembrete': return `🔔 Lembrete: ${t}`;
  }
}

export function mensagemDoSininho(a: AvisoDeEvento): string {
  const d = a.dados;
  switch (a.tipo) {
    case 'convite':
      return `${faixa(d)}.${d.organizador ? ` Organizado por ${d.organizador}.` : ''}`;
    case 'alteracao':
      return `Era ${pontual(d.inicio_antes ?? d.inicio, d.dia_inteiro)}; agora é ${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'cancelamento':
    case 'retirado':
      return `${pontual(d.inicio, d.dia_inteiro)}.`;
    case 'lembrete':
      return `Começa ${pontual(d.inicio, d.dia_inteiro)} (em ${antecedencia(a.minutos ?? 0)}).`;
  }
}

export function assuntoDoEmail(a: AvisoDeEvento): string {
  const d = a.dados;
  const curto = `${diaDaSemana(d.inicio, 'short')} ${diaEMes(d.inicio)}${d.dia_inteiro ? '' : `, ${hora(d.inicio)}`}`;
  switch (a.tipo) {
    case 'convite': return `Convite: ${d.titulo} — ${curto}`;
    case 'alteracao': return `Evento alterado: ${d.titulo} — agora ${curto}`;
    case 'cancelamento': return `Evento cancelado: ${d.titulo} — ${curto}`;
    case 'retirado': return `Evento cancelado para você: ${d.titulo} — ${curto}`;
    case 'lembrete': return `Lembrete: ${d.titulo} — em ${antecedencia(a.minutos ?? 0)}`;
  }
}

/** "https://crm…/calendario?data=2026-09-16", com o dia contado em São Paulo. */
export function linkDaAgenda(appUrl: string, inicioIso: string): string {
  const diaSP = new Date(inicioIso).toLocaleDateString('en-CA', { timeZone: FUSO }); // AAAA-MM-DD
  return `${appUrl.replace(/\/$/, '')}/calendario?data=${diaSP}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MANCHETE: Record<TipoDeAviso, string> = {
  convite: 'Você foi incluído num evento',
  alteracao: 'Um evento mudou de horário',
  cancelamento: 'Um evento foi cancelado',
  retirado: 'Você não está mais neste evento',
  lembrete: 'Seu evento está chegando',
};

function linha(rotulo: string, valorHtml: string): string {
  return `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top">${esc(rotulo)}</td><td style="padding:4px 0;color:#111827;font-size:14px">${valorHtml}</td></tr>`;
}

export function htmlDoEmail(a: AvisoDeEvento, link: string): string {
  const d = a.dados;
  const quandoAgora = esc(a.tipo === 'convite' ? faixa(d) : pontual(d.inicio, d.dia_inteiro));
  const quando = a.tipo === 'alteracao' && d.inicio_antes
    ? `<span style="text-decoration:line-through;color:#9ca3af">${esc(pontual(d.inicio_antes, d.dia_inteiro))}</span><br>${quandoAgora}`
    : quandoAgora;
  const detalhe = a.tipo === 'lembrete' ? `Começa em ${esc(antecedencia(a.minutos ?? 0))}.` : '';

  const linhas = [
    linha('Quando', quando),
    d.obra ? linha('Obra', esc(d.obra)) : '',
    d.descricao ? linha('Descrição', esc(d.descricao).replace(/\n/g, '<br>')) : '',
    d.organizador ? linha('Organizado por', esc(d.organizador)) : '',
    d.participantes.length ? linha('Participantes', esc(d.participantes.join(', '))) : '',
  ].join('');

  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#f97316;padding:16px 24px;color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:.3px">Agenda · Repply CRM</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 4px;color:#6b7280;font-size:13px">${esc(MANCHETE[a.tipo])}</p>
<h1 style="margin:0 0 12px;color:#111827;font-size:20px;line-height:1.3">${esc(d.titulo)}</h1>
${detalhe ? `<p style="margin:0 0 12px;color:#111827;font-size:14px">${detalhe}</p>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
${a.tipo === 'cancelamento' || a.tipo === 'retirado' ? '' : `<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 18px;border-radius:8px">Abrir na agenda</a></p>`}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">Aviso automático da agenda. Quem criou o evento escolheu avisar os participantes.</td></tr>
</table></td></tr></table></body></html>`;
}
