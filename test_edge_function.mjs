import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
  'https://ngropmfrneaaejwocnbf.supabase.co', 
  'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-'
);

async function runTest() {
  console.log("Fetching a real notice from notification_reminders...");
  const { data: reminders, error: reminderError } = await supabaseClient
    .from('notification_reminders')
    .select('*')
    .limit(1);

  if (reminderError) {
    console.error("Error fetching reminders:", reminderError);
    return;
  }
  if (!reminders || reminders.length === 0) {
    console.log("No pending reminders found in the table.");
    return;
  }

  const reminder = reminders[0];
  console.log("Using reminder ID:", reminder.id);

  // Fetch audience targeting parameters from content_targets securely
  const { data: targets } = await supabaseClient
    .from('content_targets')
    .select('target_type, target_id')
    .eq('content_id', reminder.parent_id);

  const targetType = targets && targets.length > 0 ? targets[0].target_type : "all_students";
  const targetId = targets && targets.length > 0 ? targets[0].target_id : "global";

  // Dynamically fetch and filter tokens based on audience criteria
  let uniqueTokens = [];
  let profileIdsLog = [];
  let tokenIdsLog = [];

  console.log(`\n[TARGET TYPE]\n${targetType}`);
  console.log(`\n[TARGET ID]\n${targetId}`);

  if (targetType === 'batch_students' && targetId && targetId !== 'global') {
    const { data: profiles, error: profileErr } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('batch_id', targetId);

    if (!profileErr && profiles && profiles.length > 0) {
      const profileIds = profiles.map((p) => p.id);
      profileIdsLog = profileIds;
      const { data: devices, error: deviceErr } = await supabaseClient
        .from('device_tokens')
        .select('token')
        .in('user_id', profileIds);

      if (!deviceErr && devices) {
        tokenIdsLog = devices.map((d) => d.token).filter(Boolean);
        uniqueTokens = [...new Set(tokenIdsLog)];
      }
    }
  } else if (targetType === 'course_students' && targetId && targetId !== 'global') {
      const { data: enrollments, error: enrollErr } = await supabaseClient
        .from('course_enrollments')
        .select('user_id')
        .eq('course_id', targetId);
      
      if (!enrollErr && enrollments && enrollments.length > 0) {
        const enrollIds = enrollments.map((e) => e.user_id);
        profileIdsLog = enrollIds;
        const { data: devices, error: deviceErr } = await supabaseClient
          .from('device_tokens')
          .select('token')
          .in('user_id', enrollIds);

        if (!deviceErr && devices) {
          tokenIdsLog = devices.map((d) => d.token).filter(Boolean);
          uniqueTokens = [...new Set(tokenIdsLog)];
        }
      }
  } else if (targetType === 'specific_student' && targetId && targetId !== 'global') {
      profileIdsLog = [targetId];
      const { data: devices, error: deviceErr } = await supabaseClient
        .from('device_tokens')
        .select('token')
        .eq('user_id', targetId);

      if (!deviceErr && devices) {
        tokenIdsLog = devices.map((d) => d.token).filter(Boolean);
        uniqueTokens = [...new Set(tokenIdsLog)];
      }
  } else {
    // Global broadcast (all_students or fallback)
    const { data: devices, error: deviceErr } = await supabaseClient
      .from('device_tokens')
      .select('user_id, token');
    
    if (!deviceErr && devices) {
      profileIdsLog = [...new Set(devices.map((d) => d.user_id).filter(Boolean))];
      tokenIdsLog = devices.map((d) => d.token).filter(Boolean);
      uniqueTokens = [...new Set(tokenIdsLog)];
    }
  }

  console.log(`\n[ELIGIBLE USERS] (Profile IDs mapped from audience)`);
  console.log(JSON.stringify(profileIdsLog, null, 2));
  
  console.log(`\n[DEVICE TOKEN IDS] (Raw tokens pulled from device_tokens before deduplication)`);
  console.log(JSON.stringify(tokenIdsLog, null, 2));

  console.log(`\n[TOKENS FOUND]`);
  console.log(uniqueTokens.length);
}

runTest();
