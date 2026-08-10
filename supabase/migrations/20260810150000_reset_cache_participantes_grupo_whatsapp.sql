-- A lista de participantes de grupo já cacheada em whatsapp_conversas.participantes foi
-- gravada com o DisplayName do /group/list (nome só para "usuários anônimos" — na prática
-- vinha vazio para a maioria) em vez do nome salvo na agenda do celular conectado à
-- instância. Zera o cache para forçar nova busca (agora cruzando com GET /contacts) na
-- próxima vez que o painel de participantes for aberto.

UPDATE whatsapp_conversas
SET participantes = '[]'::jsonb
WHERE is_group = true
  AND participantes <> '[]'::jsonb;
