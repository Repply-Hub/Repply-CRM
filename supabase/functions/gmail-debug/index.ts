import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Verificar registro em gmail_tokens
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single()

    const diag: any = {
      tem_token: !!tokenData,
      token_expirado: false,
      email_conectado: null,
      gmail_profile_status: null,
      mensagens_encontradas: 0,
      emails_recebidos_na_tabela: 0,
      erro: null
    }

    if (tokenError && tokenError.code !== 'PGRST116') {
      diag.erro = `Erro ao buscar token: ${tokenError.message}`
    }

    if (tokenData) {
      diag.token_expirado = Date.now() >= (tokenData.expires_at - 60000)
      
      let accessToken = tokenData.access_token

      // Tentar refresh se expirado
      if (diag.token_expirado) {
        try {
          const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
              client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
              refresh_token: tokenData.refresh_token,
              grant_type: 'refresh_token',
            }),
          })

          const newTokens = await refreshResponse.json()
          if (newTokens.error) {
            diag.erro = `Erro no refresh do token: ${newTokens.error_description}`
          } else {
            accessToken = newTokens.access_token
            diag.token_expirado = false
            
            await supabaseAdmin
              .from('gmail_tokens')
              .update({
                access_token: accessToken,
                expires_at: Date.now() + (newTokens.expires_in * 1000),
              })
              .eq('user_id', user.id)
          }
        } catch (e) {
          diag.erro = `Exceção no refresh: ${e.message}`
        }
      }

      // 2. Chamada de teste Gmail Profile
      try {
        const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        diag.gmail_profile_status = profileRes.status
        if (profileRes.ok) {
          const profile = await profileRes.json()
          diag.email_conectado = profile.emailAddress
        }
      } catch (e) {
        diag.erro = (diag.erro ? diag.erro + ' | ' : '') + `Erro Profile: ${e.message}`
      }

      // 3. Listar últimas 3 mensagens
      try {
        const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=3', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        if (listRes.ok) {
          const listData = await listRes.json()
          diag.mensagens_encontradas = listData.messages?.length || 0
        }
      } catch (e) {
        diag.erro = (diag.erro ? diag.erro + ' | ' : '') + `Erro List: ${e.message}`
      }
    }

    // 4. Contagem na tabela
    const { count, error: countError } = await supabaseAdmin
      .from('emails_recebidos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    
    if (!countError) {
      diag.emails_recebidos_na_tabela = count || 0
    }

    return new Response(JSON.stringify(diag), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
