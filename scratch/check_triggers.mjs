import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ngropmfrneaaejwocnbf.supabase.co';
const supabaseKey = 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-'; // or anon key
const _supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await _supabase.rpc('check_triggers'); // if RPC exists
  if (error) {
    // Let's just query pg_trigger through a raw sql query if we have a function or RPC, otherwise let's see
    console.error("Error running rpc:", error);
    // Let's try select from pg_trigger or query some records to see if there's any trigger-like behavior
    console.log("Supabase client initialized.");
  } else {
    console.log("Triggers info:", data);
  }
}
run();
