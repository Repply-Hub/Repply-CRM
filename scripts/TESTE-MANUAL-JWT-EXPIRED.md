# Teste manual: JWT expirado + refreshSession() no AuthProvider

Reproduz o cenário do "Problema 4" sem esperar expiração real nem mexer em
configuração do projeto Supabase: forja um `access_token` com `exp` no
passado, mantendo o `refresh_token` real intacto.

## Passos

1. Suba o dev server:
   ```bash
   npm run dev
   ```
2. Faça login normal na aplicação pelo browser (conta real de teste).
3. Abra o DevTools (F12) → aba **Console**.
4. Cole o conteúdo de [`forge-expired-session.js`](./forge-expired-session.js)
   inteiro no console e dê Enter.
   - Confirme a saída: `[forge] access_token reescrito com exp expirado.`
   - Se aparecer `Nenhuma sessão Supabase encontrada`, confirme que o login
     foi concluído antes de rodar o script.
5. Recarregue a página (F5).
6. Observe os logs `[AUTH]` que aparecem no console durante a inicialização.

## O que esperar nos logs (critérios de sucesso)

Na ordem aproximada:

```
[AUTH] onAuthStateChange EVENTO: INITIAL_SESSION | session: true | ...
[AUTH] onAuthStateChange — disparando fetchProfile (fire-and-forget)
[AUTH] fetchProfile ENTER ...
[AUTH] fetchProfile — iniciando query para userId: ...
[AUTH] fetchProfile — resposta recebida: { data: false, error: "JWT expired" }   <- ou similar (401/PGRST301)
[AUTH] fetchProfile — JWT expirado, forçando refreshSession() e tentando novamente
[AUTH] fetchProfile — retry após refresh: { data: true, error: undefined }
[AUTH] fetchProfile FINALLY — setProfileLoaded(true), setLoading(false)
[AUTH] fetchProfile EXIT
```

Checklist:

- [ ] `fetchProfile` detectou o erro de JWT expirado (`isJwtExpiredError`)
- [ ] `refreshSession()` foi chamado (log "forçando refreshSession()")
- [ ] Houve uma segunda tentativa de query (`retry após refresh`) com sucesso
- [ ] **Nenhum** `handleSignOut` / redirecionamento para `/login` ocorreu
- [ ] O app renderizou a tela normal (dashboard/negócios), não ficou preso em "Carregando..."
- [ ] `localStorage` após o reload tem um `access_token` novo (não mais o forjado) — confirma que a sessão foi de fato renovada

Para conferir o último item, no console após o teste:
```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')))).access_token
```
Deve ser diferente do token forjado (novo `exp` no futuro).

## Se `refreshSession()` falhar

Isso só aconteceria se o `refresh_token` real também estivesse expirado/revogado
(não é o caso normal deste teste, já que ele é preservado intacto). Nesse
caso esperado seria: `profile = null`, `profileAttempted = true`,
ProtectedRoute dispara o auto-signout de "sessão órfã/inválida" — esse é o
comportamento correto para uma sessão genuinamente inválida, diferente do
bug original (que disparava signout em timeout genérico, não em falha real).

## Limpeza

Para voltar ao estado normal, basta fazer logout e login de novo (ou limpar
o localStorage manualmente).
