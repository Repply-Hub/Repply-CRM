-- Cor de identificação da instância, escolhida pelo usuário em Configurações
-- (dialog de editar instância, atrás do ícone de lápis). Usada pra colorir o
-- badge de instância na caixa de entrada do WhatsApp, pra dar pra diferenciar
-- as instâncias de relance sem precisar ler o texto do badge. Guarda OU uma
-- chave de um conjunto fixo (ver CORES_INSTANCIA em
-- src/lib/wa-instancia-cores.ts, com contraste calculado à mão pros dois
-- temas) OU um hex livre tipo `#rrggbb` (formato que `<input type="color">`
-- sempre devolve, pra quem quer uma cor fora da paleta) — `infoCorInstancia`
-- no mesmo arquivo decide qual dos dois é e o hex livre usa um estilo de
-- badge mais conservador (ponto colorido + texto neutro) por não ter par
-- claro/escuro calculado. NULL até a pessoa escolher (badge cai pra cinza
-- neutro).
ALTER TABLE configuracoes_wapi
  ADD COLUMN IF NOT EXISTS cor TEXT;
