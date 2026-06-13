import { createClient } from '@supabase/supabase-js';

const _supabase = createClient('https://ngropmfrneaaejwocnbf.supabase.co', 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-');

async function checkCols() {
  const { data, error } = await _supabase.from('batches').select('*').limit(1);
  console.log(data);
  const { data: ct, error: cterr } = await _supabase.from('content_targets').select('*').limit(1);
  console.log(ct);
}

checkCols();
