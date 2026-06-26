import { _supabase } from '../supabase-client.js?v=rescue2';
import { fetchCachedOrDeduplicated } from '../utils.js?v=rescue2';

export const FacultyStore = (function () {
    let facultyCache = null;
    let fetchPromise = null;

    async function fetchFaculty(signal) {
        if (facultyCache) return facultyCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_faculty', async () => {
                    let query = _supabase
                        .from('faculty')
                        .select('*')
                        .order('faculty_name');
                    if (signal) {
                        query = query.abortSignal(signal);
                    }
                    const { data: faculty, error } = await query;
                    if (error) {
                        console.error("[FacultyStore] Query error:", error);
                        throw error;
                    }
                    console.log("[FacultyStore] Query success");
                    console.log(`[FacultyStore] Loaded ${faculty ? faculty.length : 0} faculty members`);
                    return faculty || [];
                });
                facultyCache = data;
                resolve(data);
            } catch (err) {
                console.error("[FacultyStore] Failed to load faculty:", err);
                reject(err);
            } finally {
                fetchPromise = null;
            }
        });
        return fetchPromise;
    }

    return {
        initialize: async (signal) => await fetchFaculty(signal),
        refresh: async (signal) => {
            facultyCache = null;
            return await fetchFaculty(signal);
        },
        getFaculty: async (signal) => await fetchFaculty(signal),
        getFacultyById: async (id, signal) => {
            const faculty = await fetchFaculty(signal);
            return faculty.find(f => f.id === id) || null;
        }
    };
})();
console.log("[ARCHITECTURE] FacultyStore loaded");
