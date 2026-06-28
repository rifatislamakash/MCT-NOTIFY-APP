import { _supabase } from '../supabase-client.js';
import { fetchCachedOrDeduplicated } from '../utils.js';

export const RoutineStore = (function () {
    let routineCache = null;
    let fetchPromise = null;

    async function fetchRoutines() {
        if (routineCache) return routineCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_routines', async () => {
                    const sdkController = new AbortController();
                    const sdkPromise = _supabase
                        .from('weekly_routines')
                        .select(`
                            id, batch_id, day_name, start_time, class_order, room_number, course_id, faculty_id, section_name,
                            courses ( id, course_name, short_name ),
                            faculty ( id, faculty_name, teacher_initial )
                        `)
                        .order('class_order', { ascending: true })
                        .abortSignal(sdkController.signal);
                    
                    let timerId;
                    const timeoutPromise = new Promise((_, reject) => {
                        timerId = setTimeout(() => reject(new Error('sdk_timeout')), 8000);
                    });
                    try {
                        const { data: routines, error } = await Promise.race([sdkPromise, timeoutPromise]);
                        if (error) throw error;
                        return routines || [];
                    } catch(e) {
                        if (e.message === 'sdk_timeout') sdkController.abort();
                        throw e;
                    } finally {
                        clearTimeout(timerId);
                    }
                });
                routineCache = data;
                // Legacy compatibility
                window.routineData = data;
                resolve(data);
            } catch (err) {
                console.error("[RoutineStore] Failed to load routines:", err);
                reject(err);
            } finally {
                fetchPromise = null;
            }
        });
        return fetchPromise;
    }

    return {
        initialize: async () => await fetchRoutines(),
        refresh: async () => {
            routineCache = null;
            return await fetchRoutines();
        },
        getRoutines: async () => await fetchRoutines()
    };
})();
console.log("[ARCHITECTURE] RoutineStore loaded");
