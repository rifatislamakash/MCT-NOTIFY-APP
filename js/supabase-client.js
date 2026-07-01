        // Supabase Initialization
        const supabaseUrl = 'https://ngropmfrneaaejwocnbf.supabase.co';
        const supabaseKey = 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-';
        export let _supabase;

        try {
            _supabase = supabase.createClient(supabaseUrl, supabaseKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    storage: window.localStorage
                },
                global: {
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    }
                }
            });
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
