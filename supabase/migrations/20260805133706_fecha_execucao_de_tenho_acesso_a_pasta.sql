-- `tenho_acesso_a_pasta` nasceu com o privilégio de execução PADRÃO do Postgres,
-- que é "PUBLIC pode executar" — e no Supabase isso significa chamável por RPC
-- do PostgREST com a chave anônima, por qualquer um na internet.
--
-- Não há vazamento: ela é SECURITY DEFINER, mas para o papel `anon`
-- `get_my_usuario_id()` é nulo e `is_gestor()` é falso, então o EXISTS nunca
-- casa. Medido antes de mexer: devolve `false` tanto para um marcador real
-- quanto para um inventado.
--
-- Mesmo assim fecha, por dois motivos. Primeiro, superfície que não serve a
-- ninguém é superfície a menos que precisa continuar inofensiva a cada mudança
-- futura em `is_gestor()`/`get_my_usuario_id()`. Segundo, consistência: as duas
-- funções irmãs (`tenho_acesso_a_caixa` e `tenho_acesso_a_mensagem`) já estão
-- restritas a `authenticated`, e uma exceção silenciosa no meio de três é o
-- tipo de coisa que a próxima pessoa presume estar correta.
REVOKE ALL ON FUNCTION public.tenho_acesso_a_pasta(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenho_acesso_a_pasta(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.tenho_acesso_a_pasta(UUID, TEXT) IS
  'Quem enxerga UM marcador: gestor sempre; os demais se liberados na caixa inteira ou naquele marcador.';
