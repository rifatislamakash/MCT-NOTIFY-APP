import { _supabase } from '../supabase-client.js?v=rescue2';
import { fetchCachedOrDeduplicated } from '../utils.js?v=rescue2';

export const RoutineStore = (function () {
    let routineCache = null;
    let fetchPromise = null;

    async function fetchRoutines() {
        if (routineCache) return routineCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_routines', async () => {
                    const { data: routines, error } = await _supabase
                        .from('weekly_routines')
                        .select(`
                            id, batch_id, day_name, start_time, class_order, room_number, course_id, faculty_id, section_name,
                            courses ( id, course_name, short_name ),
                            faculty ( id, faculty_name, teacher_initial )
                        `)
                        .order('class_order', { ascending: true });
                    if (error) throw error;
                    return routines || [];
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
