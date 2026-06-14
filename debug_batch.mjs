import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
  'https://ngropmfrneaaejwocnbf.supabase.co', 
  'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-'
);

async function run() {
  const targetId = '7d52b08c-f0e2-4eef-bc3f-2812b5a11637';
  
  // 1. Check Batch
  const { data: batch } = await supabaseClient.from('batches').select('*').eq('id', targetId);
  console.log("BATCH:", batch);
  
  // 2. Query profiles
  const { data: profiles, error: profileErr } = await supabaseClient
    .from('profiles')
    .select('id, batch_id')
    .eq('batch_id', targetId);
    
  console.log("PROFILES ERROR:", profileErr);
  console.log("PROFILES FOUND:", profiles ? profiles.length : 0);
  console.log("PROFILES SAMPLE:", profiles);
  
  // 3. What if targetId was something else?
  const { data: allProfiles } = await supabaseClient.from('profiles').select('batch_id');
  const distinctBatches = [...new Set(allProfiles.map(p => p.batch_id))];
  console.log("ALL DISTINCT BATCH IDs IN PROFILES:", distinctBatches);
}

run();
