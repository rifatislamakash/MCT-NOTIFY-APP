import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const _supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

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

async function checkRealSchema() {
  const { data, error } = await _supabase.rpc('get_schema_columns'); // If RPC exists
  if (error) {
      // Just select a row to see keys
      await checkSchema('content_targets');
      await checkSchema('notification_reminders');
      await checkSchema('device_tokens');
      await checkSchema('profiles');
      await checkSchema('courses');
      await checkSchema('batches');
  }
}

checkRealSchema();
