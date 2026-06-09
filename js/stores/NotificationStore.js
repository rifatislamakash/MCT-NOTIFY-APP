import { _supabase } from '../supabase-client.js';
import { fetchCachedOrDeduplicated } from '../utils.js';

export const NotificationStore = (function () {
    let noticesCache = null;
    let fetchPromise = null;

    async function fetchNotices() {
        if (noticesCache) return noticesCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_notices', async () => {
                    const { data: notices, error } = await _supabase
                        .from('notices')
                        .select(`
                            id, notice_title, notice_content, notice_date, audience_type,
                            is_urgent, author_id, is_active,
                            courses ( id, course_name ),
                            faculty ( id, faculty_name, teacher_initial )
                        `)
                        .eq('is_active', true)
                        .order('created_at', { ascending: false });
                    if (error) throw error;
                    return notices || [];
                });
                noticesCache = data;
                // Legacy compatibility
                window.currentNoticesList = data;
                resolve(data);
            } catch (err) {
                console.error("[NotificationStore] Failed to load notices:", err);
                reject(err);
            } finally {
                fetchPromise = null;
            }
        });
        return fetchPromise;
    }

    return {
        initialize: async () => await fetchNotices(),
        refresh: async () => {
            noticesCache = null;
            return await fetchNotices();
        },
        getNotices: async () => await fetchNotices(),
        markRead: (id) => {
            let readMap = {};
            try {
                readMap = JSON.parse(localStorage.getItem('mct_read_notices') || '{}');
            } catch(e) {}
            readMap[id] = true;
            localStorage.setItem('mct_read_notices', JSON.stringify(readMap));
        }
    };
})();
console.log("[ARCHITECTURE] NotificationStore loaded");
