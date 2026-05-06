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
    const { userId, to, subject, body } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get tokens and user info from DB
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('gmail_tokens')
      .select('*, usuarios(nome, email)')
      .eq('user_id', userId)
      .single()

    if (tokenError || !tokenData) {
      throw new Error('Gmail integration not found for user')
    }

    const userData = tokenData.usuarios as any;
    if (!userData) {
      throw new Error('User profile not found')
    }

    let accessToken = tokenData.access_token

    // Check if expired (with 1 minute buffer)
    if (Date.now() >= (tokenData.expires_at - 60000)) {
      console.log('Token expired, refreshing...')
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      })

      const newTokens = await response.json()
      if (newTokens.error) throw new Error(newTokens.error_description || newTokens.error)
      
      accessToken = newTokens.access_token
      
      // Update DB with new access token
      await supabaseClient
        .from('gmail_tokens')
        .update({
          access_token: accessToken,
          expires_at: Date.now() + (newTokens.expires_in * 1000),
        })
        .eq('user_id', userId)
    }

    // Remove external images/logos from HTML and prepare plain text version
    const cleanHtml = body.replace(/<img[^>]*src=["']https:\/\/ukwwhwytyovrzefkdeyj\.supabase\.co\/storage\/v1\/object\/public\/[^"']*["'][^>]*>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, (match: string) => {
        return `<header style="padding: 20px 0; border-bottom: 1px solid #eee; margin-bottom: 20px;">
          <h2 style="color: #333; margin: 0;">MD Representações</h2>
        </header>`
      });

    const plainText = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Prepare RFC 2822 message as multipart/alternative
    const boundary = `----=_Part_${Math.random().toString(36).substr(2, 9)}`;
    const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
    const fromHeader = `${userData.nome} <${userData.email}>`;
    
    const messageParts = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      'X-Mailer: MD Representações CRM',
      'Precedence: normal',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      plainText,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      cleanHtml,
      '',
      `--${boundary}--`
    ];
    
    const message = messageParts.join('\r\n');

    // Encode as URL-safe base64
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    })

    const result = await sendResponse.json()
    if (result.error) throw new Error(result.error.message)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Send error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
