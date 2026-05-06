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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch all connected users
    const { data: tokens, error: tokensError } = await supabaseClient
      .from('gmail_tokens')
      .select('*')

    if (tokensError) throw tokensError
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No users to sync' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = []

    for (const tokenData of tokens) {
      try {
        let accessToken = tokenData.access_token

        // 2. Token refresh logic
        if (Date.now() >= (tokenData.expires_at - 60000)) {
          console.log(`Refreshing token for user ${tokenData.user_id}...`)
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
            console.error(`Error refreshing token for ${tokenData.user_id}:`, newTokens.error_description)
            continue
          }
          
          accessToken = newTokens.access_token
          
          await supabaseClient
            .from('gmail_tokens')
            .update({
              access_token: accessToken,
              expires_at: Date.now() + (newTokens.expires_in * 1000),
            })
            .eq('user_id', tokenData.user_id)
        }

        // 3. List messages from INBOX
        const listResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=20', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        const listData = await listResponse.json()
        
        if (!listData.messages) {
          results.push({ user_id: tokenData.user_id, status: 'no_messages' })
          continue
        }

        let syncedCount = 0
        for (const msgSummary of listData.messages) {
          // 4. Get message details
          const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          const message = await msgResponse.json()

          // 5. Extract headers
          const headers = message.payload.headers
          const from = headers.find((h: any) => h.name === 'From')?.value || ''
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(Sem Assunto)'
          const dateStr = headers.find((h: any) => h.name === 'Date')?.value
          const created_at = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

          // 6. Extract body
          let body = ''
          const findPart = (parts: any[], mimeType: string): any => {
            for (const part of parts) {
              if (part.mimeType === mimeType) return part
              if (part.parts) {
                const found = findPart(part.parts, mimeType)
                if (found) return found
              }
            }
            return null
          }

          let part = findPart(message.payload.parts || [message.payload], 'text/html')
          if (!part) {
            part = findPart(message.payload.parts || [message.payload], 'text/plain')
          }

          if (part && part.body && part.body.data) {
            // Decode base64url
            const base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/')
            body = decodeURIComponent(escape(atob(base64)))
          }

          // 7. Check if message is unread in Gmail
          const isUnreadInGmail = message.labelIds?.includes('UNREAD') ?? false;

          // 8. Upsert into emails_recebidos
          const { error: upsertError } = await supabaseClient
            .from('emails_recebidos')
            .upsert({
              user_id: tokenData.user_id,
              remetente: from,
              assunto: subject,
              corpo_html: body,
              lido: !isUnreadInGmail, // Se não tiver a label UNREAD, está lido
              criado_em: created_at,
              resend_id: message.id,
              gmail_message_id: message.id
            }, { 
              onConflict: 'resend_id',
              ignoreDuplicates: false 
            })

          if (!upsertError) syncedCount++
        }

        results.push({ user_id: tokenData.user_id, status: 'success', synced: syncedCount })
      } catch (userError) {
        console.error(`Error syncing for user ${tokenData.user_id}:`, userError)
        results.push({ user_id: tokenData.user_id, status: 'error', error: userError.message })
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})