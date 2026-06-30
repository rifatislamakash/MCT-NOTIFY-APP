import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Consume body to prevent Deno from abruptly closing the TCP connection for POST requests
    if (req.method === 'POST') {
      try { await req.json() } catch (_) {}
    }
    // Initialize client with Anon Key and User's Authorization header to safely get user
    const supabaseAuthClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    const { data: { user }, error: userError } = await supabaseAuthClient.auth.getUser()

    if (userError || !user) {
      console.error("[DATABASE MONITOR] Auth Error:", userError?.message);
      throw new Error('Unauthorized: Invalid or missing token')
    }

    // 2. Verify Admin Role
    const { data: callerProfile } = await supabaseAuthClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = callerProfile?.role === 'admin'
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Only Admins can access Database Monitor.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // Initialize Admin Client for the RPC call to bypass any RLS issues
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Fetch Database Statistics via Secure RPC
    const { data: stats, error: rpcError } = await supabaseAdminClient.rpc('get_database_storage_stats')

    if (rpcError) {
      console.error("[DATABASE MONITOR] RPC Error:", rpcError)
      throw new Error('Failed to retrieve database statistics.')
    }

    // 4. Return Sanity Checked Data
    return new Response(JSON.stringify({
      database_used_bytes: stats?.database_size_bytes || 0,
      total_rows: stats?.total_rows || 0,
      tables: (stats?.top_tables || []).map((t: any) => ({
        table: t.table_name,
        bytes: t.bytes,
        rows: t.row_count
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
    
  } catch (error: any) {
    console.error("[DATABASE MONITOR] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
