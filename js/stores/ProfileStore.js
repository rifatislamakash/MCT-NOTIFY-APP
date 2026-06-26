import { _supabase } from '../supabase-client.js?v=rescue2';
import { fetchCachedOrDeduplicated } from '../utils.js?v=rescue2';

export const ProfileStore = (function () {
    let profileCache = null;
    let fetchPromise = null;

    async function fetchProfile() {
        // If not logged in, return null
        if (!window.currentUserEmail) return null;

        if (profileCache) return profileCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_profile_' + window.currentUserEmail, async () => {
                    const { data: profile, error } = await _supabase
                        .from('profiles')
                        .select('id, name, student_id, phone, profile_picture, role')
                        .eq('email', window.currentUserEmail)
                        .maybeSingle();
                    if (error) throw error;
                    return profile || null;
                });
                profileCache = data;
                resolve(data);
            } catch (err) {
                console.error("[ProfileStore] Failed to load profile:", err);
                reject(err);
            } finally {
                fetchPromise = null;
            }
        });
        return fetchPromise;
    }

    return {
        initialize: async () => await fetchProfile(),
        refresh: async () => {
            profileCache = null;
            return await fetchProfile();
        },
        getProfile: async () => await fetchProfile()
    };
})();
console.log("[ARCHITECTURE] ProfileStore loaded");
