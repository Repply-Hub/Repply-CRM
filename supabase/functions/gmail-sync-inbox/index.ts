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

    // 1. Fetch all users with Gmail tokens
    const { data: users, error: usersError } = await supabaseClient
      .from('gmail_tokens')
      .select('*')

    if (usersError) throw usersError

    console.log(`Starting sync for ${users?.length || 0} users`)

    const results = []

    for (const userToken of (users || [])) {
      try {
        let accessToken = userToken.access_token

        // 2. Refresh token if expired
        if (Date.now() >= (userToken.expires_at - 60000)) {
          console.log(`Refreshing token for user ${userToken.user_id}`)
          const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
              client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
              refresh_token: userToken.refresh_token,
              grant_type: 'refresh_token',
            }),
          })

          const newTokens = await response.json()
          if (newTokens.error) {
            console.error(`Error refreshing token for ${userToken.user_id}:`, newTokens.error)
            continue
          }
          
          accessToken = newTokens.access_token
          
          await supabaseClient
            .from('gmail_tokens')
            .update({
              access_token: accessToken,
              expires_at: Date.now() + (newTokens.expires_in * 1000),
            })
            .eq('user_id', userToken.user_id)
        }

        // 3. Fetch messages list
        const listResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=20', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        const listData = await listResponse.json()

        if (!listData.messages) {
          console.log(`No messages found for user ${userToken.user_id}`)
          continue
        }

        console.log(`Found ${listData.messages.length} messages for user ${userToken.user_id}`)

        for (const msgSummary of listData.messages) {
          try {
            // 4. Fetch message details
            const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            })
            const message = await msgResponse.json()

            const headers = message.payload.headers
            const from = headers.find((h: any) => h.name === 'From')?.value || ''
            const to = headers.find((h: any) => h.name === 'To')?.value || ''
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(Sem assunto)'
            const dateStr = headers.find((h: any) => h.name === 'Date')?.value
            const dataRecebimento = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

            // 5. Extract HTML body
            let bodyHtml = ''
            
            const getHtmlPart = (part: any): string => {
              if (part.mimeType === 'text/html' && part.body.data) {
                const base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/')
                // Using TextDecoder for more robust UTF-8 decoding
                const binaryString = atob(base64)
                const bytes = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                return new TextDecoder().decode(bytes)
              }
              if (part.parts) {
                for (const subPart of part.parts) {
                  const result = getHtmlPart(subPart)
                  if (result) return result
                }
              }
              return ''
            }

            if (message.payload.parts) {
              bodyHtml = getHtmlPart(message.payload)
            } else if (message.payload.body.data) {
              const base64 = message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/')
              const binaryString = atob(base64)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              bodyHtml = new TextDecoder().decode(bytes)
            }

            // 6. Upsert into emails_recebidos
            const { error: upsertError } = await supabaseClient
              .from('emails_recebidos')
              .upsert({
                gmail_message_id: message.id,
                user_id: userToken.user_id,
                remetente: from,
                destinatarios: to ? [to] : [],
                assunto: subject,
                corpo_html: bodyHtml,
                data_recebimento: dataRecebimento,
                lido: false,
              }, { onConflict: 'gmail_message_id' })

            if (upsertError) {
              console.error(`Error upserting message ${message.id}:`, upsertError)
            }
          } catch (msgError) {
            console.error(`Error processing message ${msgSummary.id}:`, msgError)
          }
        }
        results.push({ user_id: userToken.user_id, status: 'success' })
      } catch (userError) {
        console.error(`Error processing user ${userToken.user_id}:`, userError)
        results.push({ user_id: userToken.user_id, status: 'error', error: userError.message })
      }
    }

    return new Response(JSON.stringify({ status: 'completed', results }), {
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
