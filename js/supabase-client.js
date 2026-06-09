        // Supabase Initialization
        const supabaseUrl = 'https://ngropmfrneaaejwocnbf.supabase.co';
        const supabaseKey = 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-';
        export let _supabase;

        try {
            _supabase = supabase.createClient(supabaseUrl, supabaseKey);
            window._supabase = _supabase;
            const statusLabel = document.getElementById('db-status-label');
            if (statusLabel) {
                statusLabel.innerText = "Supabase Active";
            }
        } catch (error) {
            console.error("Supabase fail: ", error);
            const statusLabel = document.getElementById('db-status-label');
            if (statusLabel) {
                statusLabel.innerText = "Supabase Offline / Sandbox Block";
            }
        }

console.log("[ARCHITECTURE]\nsupabase client loaded");
