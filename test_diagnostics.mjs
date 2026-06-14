import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
  'https://ngropmfrneaaejwocnbf.supabase.co', 
  'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-'
);

async function runTest() {
  const targetId = '7d52b08c-f0e2-4eef-bc3f-2812b5a11637';

  console.log(`\n[TARGET TYPE]\nbatch_students`);
  console.log(`\n[TARGET ID]\n${targetId}`);

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
    const profileIds = profiles.map((p) => p.id);
    console.log(`\n[ELIGIBLE USERS]`);
    console.log(profileIds);
  } else {
    console.log(`\n[ELIGIBLE USERS]`);
    console.log([]);
  }
}

runTest();
