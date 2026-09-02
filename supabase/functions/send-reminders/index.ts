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
    let targetReminderId = null;
    let targetReminderTime = null;
    
    try {
      const body = await req.json();
      const payload = body.record ? body.record : body;
      if (payload && payload.id) {
        isManualTrigger = true;
        targetReminderId = payload.id;
        targetReminderTime = payload.reminder_time;
      }
    } catch (e) {
      // Running as normal automated cron schedule
    }

    const now = new Date().toISOString();

    // If webhook triggered for a future reminder, ignore it until cron job picks it up.
    if (isManualTrigger && targetReminderTime && targetReminderTime > now) {
      return new Response(JSON.stringify({ message: "Reminder is scheduled for the future. Webhook ignored." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    let query = supabaseClient.from('notification_reminders').select('*');
    
    if (isManualTrigger) {
      query = query.eq('id', targetReminderId).eq('sent', false).limit(1);
    } else {
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

    const cleanText = (text: string) => {
      if (!text) return '';
      return String(text)
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/\[color=(#[0-9a-fA-F]{6})\](.*?)\[\/color\]/g, '$2');
    };

    for (const reminder of reminders) {
      const rawTitle = isManualTrigger ? `UPDATE: ${reminder.reminder_title}` : reminder.reminder_title;
      const notificationTitle = cleanText(rawTitle);
      const notificationBody = cleanText(reminder.reminder_message);

      // Fetch audience targeting parameters from content_targets securely
      let { data: targets } = await supabaseClient
        .from('content_targets')
        .select('target_type, target_id')
        .eq('content_id', reminder.parent_id);

      // SERVER AUTHORITATIVE RESOLUTION FOR COMMENT REPLIES
      if (reminder.parent_type === 'comment_reply') {
         const { data: commentData } = await supabaseClient
             .from('comments')
             .select('user_id, content_type, content_id, parent_comment_id')
             .eq('id', reminder.parent_id)
             .single();
         
         if (!commentData) {
            console.error(`[FAIL CLOSED SECURITY] Comment not found for comment_reply event ${reminder.id}. Aborting.`);
            sentReminderIds.push(reminder.id);
            continue;
         }

         let creatorId = null;
         let parentCommenterId = null;
         
         if (commentData.parent_comment_id) {
             const { data: parentData } = await supabaseClient
                 .from('comments')
                 .select('user_id')
                 .eq('id', commentData.parent_comment_id)
                 .single();
             if (parentData) parentCommenterId = parentData.user_id;
         }
         
         const table = commentData.content_type === 'schedule' ? 'schedules' : (commentData.content_type === 'notice' ? 'notices' : null);
         if (!table) {
            console.error(`[FAIL CLOSED SECURITY] Invalid content type ${commentData.content_type}. Aborting.`);
            sentReminderIds.push(reminder.id);
            continue;
         }
         
         const { data: contentData } = await supabaseClient
             .from(table)
             .select('created_by, audience_type, batch_id, course_id')
             .eq('id', commentData.content_id)
             .single();
             
         if (contentData) {
             creatorId = contentData.created_by;
         } else {
             console.error(`[FAIL CLOSED SECURITY] Content not found for comment. Aborting.`);
             sentReminderIds.push(reminder.id);
             continue;
         }
         
         const candidateRecipients = [parentCommenterId, creatorId];
         let uniqueRecipients = [...new Set(candidateRecipients)]
             .filter(id => id !== null && id !== commentData.user_id); // Exclude Actor
             
         // Validate Audience Security Server-Side
         if (contentData.audience_type === 'batch' && contentData.batch_id) {
             const { data: profiles } = await supabaseClient.from('profiles').select('id, batch_id').in('id', uniqueRecipients);
             const validIds = profiles?.filter((p: any) => p.batch_id === contentData.batch_id).map((p: any) => p.id) || [];
             uniqueRecipients = uniqueRecipients.filter(id => validIds.includes(id) || id === creatorId);
         } else if (contentData.audience_type === 'specific' && contentData.course_id) {
             const { data: enrolls } = await supabaseClient.from('user_courses').select('user_id').eq('course_id', contentData.course_id).in('user_id', uniqueRecipients);
             const validIds = enrolls?.map((e: any) => e.user_id) || [];
             uniqueRecipients = uniqueRecipients.filter(id => validIds.includes(id) || id === creatorId);
         }
         
         targets = uniqueRecipients.map(id => ({ target_type: 'specific_student', target_id: id }));
      }

      if (!targets || targets.length === 0) {
        if (reminder.parent_type === 'comment_reply') {
          console.error(`[FAIL CLOSED SECURITY] Missing targets for comment_reply event ${reminder.id}. Aborting broadcast.`);
          sentReminderIds.push(reminder.id);
          continue;
        }
        targets = [{ target_type: "all_students", target_id: "global" }];
      }

      if (reminder.parent_type === 'welcome') {
        targets = [{ target_type: 'specific_student', target_id: reminder.parent_id }];
      }

      console.log(`\n[TARGETS RESOLUTION] Found ${targets.length} targets`);

      // Dynamically fetch and filter tokens based on audience criteria
      const tokenToTarget = new Map<string, { type: string, id: string }>();
      let profileIdsLog: string[] = [];

      for (const target of targets) {
        const targetType = target.target_type;
        const targetId = target.target_id;
        let currentProfileIds: string[] = [];

        if (targetType === 'batch_students' && targetId && targetId !== 'global') {
          const { data: profiles } = await supabaseClient.from('profiles').select('id').eq('batch_id', targetId);
          if (profiles) currentProfileIds = profiles.map((p: any) => p.id);
        } else if (targetType === 'course_students' && targetId && targetId !== 'global') {
          const { data: enrollments } = await supabaseClient.from('user_courses').select('user_id').eq('course_id', targetId);
          if (enrollments) currentProfileIds = enrollments.map((e: any) => e.user_id);
        } else if (targetType === 'specific_student' && targetId && targetId !== 'global') {
          currentProfileIds = [targetId];
        } else {
          const { data: devices } = await supabaseClient.from('device_tokens').select('user_id');
          if (devices) currentProfileIds = devices.map((d: any) => d.user_id).filter(Boolean);
        }

        if (currentProfileIds.length > 0) {
          profileIdsLog.push(...currentProfileIds);
          const { data: devices } = await supabaseClient.from('device_tokens').select('token').in('user_id', currentProfileIds);
          if (devices) {
            for (const d of devices) {
              if (d.token && !tokenToTarget.has(d.token)) {
                tokenToTarget.set(d.token, { type: targetType, id: targetId });
              }
            }
          }
        }
      }

      profileIdsLog = [...new Set(profileIdsLog.filter(Boolean))];
      let tokenIdsLog = Array.from(tokenToTarget.keys());
      let uniqueTokens = [...tokenIdsLog];

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

      // --- 1-HOUR ANTI-SPAM COOLDOWN ---
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentLogs, error: logsErr } = await supabaseClient
          .from('notification_logs')
          .select('fcm_token')
          .eq('target_id', reminder.parent_id)
          .gte('created_at', oneHourAgo);

      if (!logsErr && recentLogs) {
          const recentTokens = new Set(recentLogs.map((l: any) => l.fcm_token));
          const originalCount = uniqueTokens.length;
          uniqueTokens = uniqueTokens.filter(token => !recentTokens.has(token));
          console.log(`[ANTI-SPAM] Blocked ${originalCount - uniqueTokens.length} tokens that received this notification in the last hour.`);
      }

      if (uniqueTokens.length === 0) {
          console.log(`[ANTI-SPAM] All tokens were blocked by cooldown. Skipping FCM loop.`);
          sentReminderIds.push(reminder.id);
          continue;
      }

      const logsToInsert: any[] = [];

      for (const token of uniqueTokens) {
        const tokenTarget = tokenToTarget.get(token);
        const fcmPayload = {
          message: {
            token: token,
            notification: {
              title: notificationTitle || "MCT Notify Update",
              body: notificationBody || "Open the application to see details."
            },
            data: {
              target_type: String(tokenTarget?.type || "notice"),
              target_id: String(tokenTarget?.id || ""),
              click_action: "https://mctnotify.vercel.app"
            },
            android: {
              priority: "HIGH"
            },
            webpush: {
              headers: {
                Urgency: "high"
              },
              notification: {
                icon: "https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Logo.png",
                badge: "https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/badge.png"
              },
              fcm_options: {
                link: "https://mctnotify.vercel.app"
              }
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
          
          if (fcmResponse.ok) {
              successCount++;
              logsToInsert.push({
                  target_id: reminder.parent_id,
                  fcm_token: token,
                  created_at: new Date().toISOString()
              });
          }
        } catch (err: any) {
          console.error("[FATAL FIREBASE FETCH ERROR]:", err.message);
        }
      }

      // Bulk insert anti-spam logs
      if (logsToInsert.length > 0) {
          console.log(`[ANTI-SPAM] Logging ${logsToInsert.length} successful notifications...`);
          const { error: insertErr } = await supabaseClient.from('notification_logs').insert(logsToInsert);
          if (insertErr) console.error("[ANTI-SPAM] Failed to insert logs:", insertErr);
      }

      sentReminderIds.push(reminder.id);
    }

    if (sentReminderIds.length > 0) {
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
