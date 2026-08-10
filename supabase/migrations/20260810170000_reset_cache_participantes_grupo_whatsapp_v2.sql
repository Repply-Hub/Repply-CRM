-- Segunda rodada do reset de src 20260810150000: o cache de participantes foi repopulado com
-- nomes nulos numa corrida entre aquela migração e o deploy da function corrigida (o painel foi
-- reaberto no intervalo entre um e outro, batendo na versão antiga da function contra o cache
-- já zerado). Repete o reset, agora com a function já estável há um tempo, para eliminar a
-- janela de corrida.

UPDATE whatsapp_conversas
SET participantes = '[]'::jsonb
WHERE is_group = true
  AND participantes <> '[]'::jsonb;
