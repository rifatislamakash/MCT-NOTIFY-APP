import { createClient } from '@supabase/supabase-js';

const _supabase = createClient('https://ngropmfrneaaejwocnbf.supabase.co', 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-');

async function checkSchema(table) {
  const { data, error } = await _supabase.from(table).select('*').limit(1);
  if (error) {
    console.error(`Error fetching from ${table}:`, error);
  } else if (data && data.length > 0) {
    console.log(`\nTable ${table} columns:`);
    console.log(Object.keys(data[0]).join(', '));
  } else {
    console.log(`\nTable ${table} is empty but exists.`);
  }
}

async function run() {
      await checkSchema('content_targets');
      await checkSchema('notification_reminders');
      await checkSchema('device_tokens');
      await checkSchema('profiles');
      await checkSchema('courses');
      await checkSchema('batches');
}

run();
