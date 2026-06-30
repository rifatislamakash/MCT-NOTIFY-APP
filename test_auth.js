const { createClient } = require('@supabase/supabase-js');

// Init with Service Role to bypass RLS and create admin profile
const supabaseAdmin = createClient(
    'https://ngropmfrneaaejwocnbf.supabase.co', 
    'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-' // Wait, I don't have the Service Role Key!
);
