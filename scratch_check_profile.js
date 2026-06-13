import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ngropmfrneaaejwocnbf.supabase.co';
const supabaseKey = 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', '8d825301-6a9b-459a-b796-a1e488f679de').maybeSingle();
    console.log("Profile details:", profile);
}

main().catch(console.error);
