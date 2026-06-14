import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
  'https://ngropmfrneaaejwocnbf.supabase.co', 
  'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-'
);

async function run() {
  const { data: profiles, error } = await supabaseClient.from('profiles').select('*').limit(5);
  console.log("PROFILES ERROR:", error);
  console.log("PROFILES:", profiles);
}

run();
