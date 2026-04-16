---
name: Banco de Dados
description: Tabelas (clientes, pedidos, empresas, eventos, usuarios) e nomenclatura
type: feature
---

Schema no Supabase com tabelas principais para gestão de clientes, pedidos, obras, fabricantes e licenciamento governamental.

**Nomenclatura importante (atualizada):**
- A tabela de usuários do sistema chama-se **`usuarios`** (anteriormente `vendedores`). Contém todos os tipos: admin, empresa, gestor, vendedor.
- Coluna FK em todas as tabelas relacionadas: **`usuario_id`** (anteriormente `vendedor_id`).
- Tabela de permissões: **`permissoes_usuario`** (anteriormente `permissoes_vendedor`).
- View principal de indicadores: **`vw_indicadores_usuario`** (com alias legado `vw_indicadores_vendedor` mantido para compatibilidade).
- Funções: `get_my_usuario_id()`, `usuario_in_my_empresa()`. Aliases legados `get_my_vendedor_id()`, `vendedor_in_my_empresa()` continuam funcionando.

Trigger `handle_new_user` insere automaticamente em `usuarios` ao criar conta no auth.
