import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://ngropmfrneaaejwocnbf.supabase.co', 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-');

async function test() {
    console.log("Invoking database-monitor in production...");
    // We will get a 401 Unauthorized if we don't pass a valid user token,
    // but if it is deployed, we will at least see if it exists.
    const { data, error } = await supabase.functions.invoke('database-monitor', {
        method: 'POST',
        body: { ping: true }
    });
    
    if (error) {
        if (error.context && typeof error.context.text === 'function') {
            const text = await error.context.text();
            console.log("HTTP Error Body:", text);
        } else {
            console.log("Error:", error);
        }
    } else {
        console.log("Success:", data);
    }
}
test();
