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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Check if caller is admin
    const { data: callerProfile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = callerProfile?.role === 'admin' || user.email === 'gd.riakash@gmail.com'
    if (!isAdmin) {
      throw new Error('Forbidden: Only Admins can approve CR requests.')
    }

    const { reqId, targetUserId, targetBatchId } = await req.json()

    if (!reqId || !targetUserId || !targetBatchId) {
      throw new Error('Missing required fields')
    }

    // 1. Update cr_requests status to approved
    const { error: reqError } = await supabaseClient
      .from('cr_requests')
      .update({ status: 'approved' })
      .eq('id', reqId)

    if (reqError) throw reqError

    // 2. Update profiles role to cr (using SERVICE ROLE KEY to bypass triggers/RLS)
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .update({ role: 'cr' })
      .eq('id', targetUserId)

    if (profileError) throw profileError

    // 3. Upsert into batch_crs
    const { error: batchError } = await supabaseClient
      .from('batch_crs')
      .upsert(
        { user_id: targetUserId, batch_id: targetBatchId, active: true },
        { onConflict: 'user_id,batch_id' }
      )

    if (batchError) throw batchError

    return new Response(
      JSON.stringify({ message: 'CR request approved successfully.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('[APPROVE CR FUNCTION ERROR]', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
