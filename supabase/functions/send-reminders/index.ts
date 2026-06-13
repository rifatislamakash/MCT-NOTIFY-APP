import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { JWT } from "npm:google-auth-library@9"

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
    );

    let isManualTrigger = false;
    let targetParentId = null;
    
    try {
      const body = await req.json();
      if (body && body.parent_id) {
        isManualTrigger = true;
        targetParentId = body.parent_id;
      }
    } catch (e) {
      // Running as normal automated cron schedule
    }

    let query = supabaseClient.from('notification_reminders').select('*');
    
    if (isManualTrigger) {
      query = query.eq('parent_id', targetParentId).limit(1);
    } else {
      const now = new Date().toISOString();
      query = query.eq('sent', false).lte('reminder_time', now);
    }

    const { data: reminders, error: reminderError } = await query;
    if (reminderError) throw reminderError;

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ message: "No pending reminders to send." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const { data: devices, error: dbError } = await supabaseClient.from('device_tokens').select('token');
    if (dbError) throw dbError;
    if (!devices || devices.length === 0) throw new Error("No devices found to notify.");

    const uniqueTokens = [...new Set(devices.map((d: any) => d.token).filter(Boolean))];

    const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountStr) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT secret.");
    const serviceAccount = JSON.parse(serviceAccountStr);

    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const tokens = await jwtClient.authorize();
    const projectId = serviceAccount.project_id;

    let successCount = 0;
    const sentReminderIds = [];

    for (const reminder of reminders) {
      const notificationTitle = isManualTrigger ? `UPDATE: ${reminder.reminder_title}` : reminder.reminder_title;
      const notificationBody = reminder.reminder_message;

      // Fetch audience targeting parameters from content_targets securely
      const { data: targets } = await supabaseClient
        .from('content_targets')
        .select('target_type, target_id')
        .eq('content_id', reminder.parent_id);

      // Fix array access to target_type and target_id
      const targetType = targets && targets.length > 0 ? targets[0].target_type : "all_students";
      const targetId = targets && targets.length > 0 ? targets[0].target_id : "global";

      for (const token of uniqueTokens) {
        // PURE DATA-ONLY ARCHITECTURE (Completely stripped visible notification blocks to bypass OS display)
        const fcmPayload = {
          message: {
            token: token,
            data: {
              title: notificationTitle,
              body: notificationBody,
              target_type: targetType,
              target_id: targetId,
              icon: "https://mctnotify.vercel.app/assets/Logo.png",
              badge: "https://mctnotify.vercel.app/assets/Logo.png",
              image: "https://mctnotify.vercel.app/assets/Logo.png",
              click_action: "https://mctnotify.vercel.app"
            },
            android: { priority: "high" },
            webpush: {
              headers: { Urgency: "high" },
              fcm_options: { link: "https://mctnotify.vercel.app" }
            }
          }
        };

        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokens.access_token}`
          },
          body: JSON.stringify(fcmPayload)
        });

        if (response.ok) successCount++;
      }
      sentReminderIds.push(reminder.id);
    }

    if (!isManualTrigger && sentReminderIds.length > 0) {
      const { error: updateError } = await supabaseClient
        .from('notification_reminders')
        .update({ sent: true })
        .in('id', sentReminderIds);

      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ message: `Successfully processed ${sentReminderIds.length} reminders.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
