/**
 * As mensagens quando o envio de catálogo é recusado pelas travas contra banimento.
 *
 * Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md §8.3
 *
 * 🔴 A CAUSA É DO WHATSAPP E É DITA COMO TAL — mas nenhuma mensagem afirma um número como
 * sendo dele. Os 10, 40 e 150 são NOSSOS, de proteção. Escrever "o limite do WhatsApp é 40 por
 * hora" seria falso, e o primeiro representante que pesquisasse descobriria — passando a
 * desconfiar de todos os outros avisos do sistema.
 *
 * 🔴 TODA RECUSA TEMPORÁRIA DIZ QUANDO LIBERA. Aviso sem horário é o que faz a pessoa
 * continuar clicando, que é justamente o comportamento que a trava existe para evitar.
 */

export const MOTIVOS_DE_RECUSA = [
  'repeticao',
  'teto_pessoa_hora',
  'teto_pessoa_dia',
  'teto_numero_hora',
  'teto_numero_dia',
  'sem_instancia',
] as const;

export type MotivoDeRecusa = (typeof MOTIVOS_DE_RECUSA)[number];

export interface Recusa {
  titulo: string;
  texto: string;
  /**
   * `neutro` para a repetição, `alerta` para os tetos.
   *
   * 🔴 A repetição NÃO é erro vermelho. Vermelho faz a pessoa achar que quebrou — e quem acha
   * que quebrou tenta de novo. Ali o envio deu certo; a mensagem é confirmação, não bloqueio.
   */
  tom: 'neutro' | 'alerta';
  /** Só a repetição oferece o atalho: é o caso em que a dúvida real é "será que foi?". */
  verNaConversa: boolean;
}

/**
 * A hora no formato "15h12", fixada em Brasília.
 *
 * O fuso é fixado, e não deixado por conta do navegador, pelo mesmo motivo que a pauta do dia
 * e o resumo diário fazem isso: toda a operação é no Brasil, e um horário que muda conforme a
 * máquina de quem olha é um horário em que ninguém confia.
 */
function hora(em: Date | string | null | undefined): string | null {
  if (!em) return null;
  const d = em instanceof Date ? em : new Date(em);
  if (Number.isNaN(d.getTime())) return null;
  return d
    .toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
    .replace(':', 'h');
}

export function mensagemDeRecusa(
  motivo: MotivoDeRecusa,
  liberaEm: Date | string | null | undefined,
  nomeDoContato: string,
): Recusa {
  const h = hora(liberaEm);
  const nome = nomeDoContato?.trim() || 'o contato';

  switch (motivo) {
    case 'repeticao':
      // 🔴 Redação aprovada pelo Lucas em 26/08/2026, e a ordem das frases é o ponto:
      // começa por "já enviado" porque quem clica de novo quase sempre só não sabe se foi.
      // Resolvido isso, o reenvio nem é mais necessário.
      return {
        titulo: 'Já enviado',
        texto:
          `${nome} recebeu este catálogo há poucos minutos. Para evitar problemas de spam ` +
          `para o seu número de WhatsApp, dá para mandar de novo` +
          (h ? ` às ${h}.` : ' em alguns minutos.'),
        tom: 'neutro',
        verNaConversa: true,
      };

    case 'teto_pessoa_hora':
      return {
        titulo: 'Aguarde alguns minutos',
        texto:
          'O WhatsApp derruba números que disparam muitos arquivos em sequência. Você já ' +
          'enviou vários catálogos nesta hora' +
          (h ? `, e libera às ${h}.` : '.'),
        tom: 'alerta',
        verNaConversa: false,
      };

    case 'teto_pessoa_dia':
      return {
        titulo: 'Limite de hoje atingido',
        texto:
          'O WhatsApp derruba números que disparam muitos arquivos em sequência. Você já ' +
          'enviou o máximo de catálogos por hoje — o envio volta amanhã.',
        tom: 'alerta',
        verNaConversa: false,
      };

    case 'teto_numero_hora':
      // 🔴 Diz que é da EMPRESA, não da pessoa. Quem mandou dois catálogos e leva um "você
      // atingiu seu limite" conclui que é defeito — e insiste.
      return {
        titulo: 'O número da empresa precisa de uma pausa',
        texto:
          'O WhatsApp derruba números que disparam muitos arquivos em sequência. O número da ' +
          'empresa é usado por várias pessoas e já enviou bastante nesta hora' +
          (h ? `, então o envio pausa até ${h}.` : ', então o envio pausa por um tempo.'),
        tom: 'alerta',
        verNaConversa: false,
      };

    case 'teto_numero_dia':
      return {
        titulo: 'O número da empresa atingiu o limite de hoje',
        texto:
          'O WhatsApp derruba números que disparam muitos arquivos em sequência. O número da ' +
          'empresa já enviou muitos catálogos hoje, e o envio volta amanhã.',
        tom: 'alerta',
        verNaConversa: false,
      };

    case 'sem_instancia':
      return {
        titulo: 'Seu WhatsApp não está vinculado',
        texto:
          'Para enviar catálogos você precisa de um WhatsApp vinculado ao seu usuário. Peça ' +
          'ao gestor para liberar em Configurações.',
        tom: 'alerta',
        verNaConversa: false,
      };

    default:
      // Motivo que a função de banco passe a devolver e esta tela ainda não conheça. Melhor
      // uma frase honesta que uma tela muda.
      return {
        titulo: 'Não foi possível enviar agora',
        texto:
          'O envio foi recusado por uma proteção do sistema. Tente de novo em alguns minutos ' +
          'e, se continuar, avise o gestor.',
        tom: 'alerta',
        verNaConversa: false,
      };
  }
}
