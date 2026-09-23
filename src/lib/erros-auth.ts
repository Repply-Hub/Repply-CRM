/**
 * Traduz as mensagens do Supabase Auth, que chegam sempre em inglês.
 * Compartilhado entre as telas de login e cadastro.
 */
const MENSAGENS: Record<string, string> = {
  'User already registered': 'Este email já está cadastrado.',
  'Invalid login credentials': 'Email ou senha incorretos.',
  'Email not confirmed': 'Email não confirmado. Verifique sua caixa de entrada.',
  'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
  // As três recusas de SENHA. Sem elas, a tela de redefinição culpa o link e a pessoa fica
  // pedindo link novo para sempre — ver src/lib/erros-auth.test.ts.
  'Password is known to be weak and easy to guess':
    'Esta senha apareceu em vazamentos conhecidos. Escolha outra.',
  'New password should be different from the old password':
    'A nova senha precisa ser diferente da atual.',
  'Password should contain at least one character of each':
    'A senha precisa misturar letras, números e símbolos.',
  'Signup requires a valid password': 'Informe uma senha válida.',
  'Unable to validate email address: invalid format': 'Formato de email inválido.',
  'Email rate limit exceeded': 'Muitas tentativas. Aguarde alguns minutos.',
  'For security purposes, you can only request this after':
    'Por segurança, aguarde antes de tentar novamente.',
  'Failed to fetch': 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',
};

export function traduzirErroAuth(msg: string): string {
  for (const [en, pt] of Object.entries(MENSAGENS)) {
    if (msg.toLowerCase().includes(en.toLowerCase())) return pt;
  }
  // Sem tradução conhecida, a mensagem original é de infraestrutura e não ajuda
  // ninguém — "Invalid API key" já chegou a aparecer para o usuário final.
  // Registra o texto real no console para o diagnóstico não se perder.
  console.error('[auth] erro não mapeado:', msg);
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}
