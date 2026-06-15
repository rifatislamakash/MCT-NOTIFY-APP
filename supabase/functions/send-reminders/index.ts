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
  console.log('[EDGE FUNCTION INVOKED] Request received at:', new Date().toISOString());

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let isManualTrigger = false;
    let targetParentId = null;
    
    try {
      const body = await req.json();
      const payload = body.record ? body.record : body;
      if (payload && payload.parent_id) {
        isManualTrigger = true;
        targetParentId = payload.parent_id;
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

    const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountStr) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT secret.");
    const serviceAccount = JSON.parse(serviceAccountStr);

    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const authTokens = await jwtClient.authorize();
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

      // Dynamically fetch and filter tokens based on audience criteria
      let uniqueTokens: string[] = [];
      let profileIdsLog: string[] = [];
      let tokenIdsLog: string[] = [];

      console.log(`\n[TARGET TYPE]\n${targetType}`);
      console.log(`\n[TARGET ID]\n${targetId}`);

      if (targetType === 'batch_students' && targetId && targetId !== 'global') {
        // Query specific batch student IDs
        const { data: profiles, error: profileErr } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('batch_id', targetId);

        console.log('[PROFILE ERROR]', profileErr);
        console.log('[PROFILE RESULT COUNT]', profiles ? profiles.length : 0);
        console.log('[TARGET UUID]', targetId);

        const { data: testProfiles } = await supabaseClient
          .from('profiles')
          .select('id, batch_id')
          .limit(5);
        console.log('[PROFILE SAMPLE]', testProfiles);

        if (!profileErr && profiles && profiles.length > 0) {
          const profileIds = profiles.map((p: any) => p.id);
          profileIdsLog = profileIds;
          const { data: devices, error: deviceErr } = await supabaseClient
            .from('device_tokens')
            .select('token')
            .in('user_id', profileIds);

          if (!deviceErr && devices) {
            tokenIdsLog = devices.map((d: any) => d.token).filter(Boolean);
            uniqueTokens = [...new Set(tokenIdsLog)];
          }
        }
      } else if (targetType === 'course_students' && targetId && targetId !== 'global') {
          // Query students enrolled in the course
          const { data: enrollments, error: enrollErr } = await supabaseClient
            .from('user_courses')
            .select('user_id')
            .eq('course_id', targetId);
          
          if (!enrollErr && enrollments && enrollments.length > 0) {
            const enrollIds = enrollments.map((e: any) => e.user_id);
            profileIdsLog = enrollIds;
            const { data: devices, error: deviceErr } = await supabaseClient
              .from('device_tokens')
              .select('token')
              .in('user_id', enrollIds);

            if (!deviceErr && devices) {
              tokenIdsLog = devices.map((d: any) => d.token).filter(Boolean);
              uniqueTokens = [...new Set(tokenIdsLog)];
            }
          }
      } else if (targetType === 'specific_student' && targetId && targetId !== 'global') {
          // Query specific student
          profileIdsLog = [targetId];
          const { data: devices, error: deviceErr } = await supabaseClient
            .from('device_tokens')
            .select('token')
            .eq('user_id', targetId);

          if (!deviceErr && devices) {
            tokenIdsLog = devices.map((d: any) => d.token).filter(Boolean);
            uniqueTokens = [...new Set(tokenIdsLog)];
          }
      } else {
        // Global broadcast (all_students or fallback)
        const { data: devices, error: deviceErr } = await supabaseClient
          .from('device_tokens')
          .select('user_id, token');
        
        if (!deviceErr && devices) {
          profileIdsLog = [...new Set(devices.map((d: any) => d.user_id).filter(Boolean))];
          tokenIdsLog = devices.map((d: any) => d.token).filter(Boolean);
          uniqueTokens = [...new Set(tokenIdsLog)];
        }
      }

      console.log(`\n[ELIGIBLE USERS] (Profile IDs mapped from audience)`);
      console.log(JSON.stringify(profileIdsLog, null, 2));
      
      console.log(`\n[DEVICE TOKEN IDS] (Raw tokens pulled from device_tokens before deduplication)`);
      console.log(JSON.stringify(tokenIdsLog, null, 2));

      console.log(`\n[TOKENS FOUND]`);
      console.log(uniqueTokens.length);

      if (uniqueTokens.length === 0) {
          console.warn(`No tokens found for reminder ${reminder.id} (Target: ${targetType} - ${targetId})`);
          sentReminderIds.push(reminder.id);
          continue;
      }

      for (const token of uniqueTokens) {
        const fcmPayload = {
          message: {
            token: token,
            notification: {
              title: notificationTitle || "MCT Notify Update",
              body: notificationBody || "Open the application to see details."
            },
            android: {
              priority: "high"
            },
            webpush: {
              notification: {
                icon: "https://mctnotify.vercel.app/assets/Logo.png",
                badge: "https://mctnotify.vercel.app/assets/badge.png"
              },
              fcm_options: { 
                link: "https://mctnotify.vercel.app" 
              }
            },
            data: {
              title: String(notificationTitle || "MCT Notify Update"),
              body: String(notificationBody || "Open the application to see details."),
              target_type: String(targetType || "notice"),
              target_id: String(targetId || ""),
              click_action: "https://mctnotify.vercel.app"
            }
          }
        };

        try {
          console.log("[CRITICAL OUTGOING PAYLOAD LOG]:", JSON.stringify(fcmPayload, null, 2));
          const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authTokens.access_token}`
            },
            body: JSON.stringify(fcmPayload)
          });
          const fcmResult = await fcmResponse.text();
          console.log("[FIREBASE RETURN STATUS]:", fcmResponse.status, fcmResult);
          
          if (fcmResponse.ok) successCount++;
        } catch (err: any) {
          console.error("[FATAL FIREBASE FETCH ERROR]:", err.message);
        }
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
    console.error('[FATAL EDGE FUNCTION ERROR]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
