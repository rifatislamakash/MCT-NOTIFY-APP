import { createClient } from '@supabase/supabase-js';

const _supabase = createClient('https://ngropmfrneaaejwocnbf.supabase.co', 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-');

async function getCols(table) {
    const res = await fetch(`https://ngropmfrneaaejwocnbf.supabase.co/rest/v1/${table}?limit=0`, {
        headers: {
            'apikey': 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-',
            'Authorization': 'Bearer sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-'
        }
    });
    const data = await res.json();
    console.log(`Table ${table} HTTP res:`, data);
}

getCols('profiles');
getCols('content_targets');
getCols('device_tokens');
