import { _supabase } from '../supabase-client.js';
import { fetchCachedOrDeduplicated } from '../utils.js';

export const FacultyStore = (function () {
    let facultyCache = null;
    let fetchPromise = null;

    async function fetchFaculty() {
        if (facultyCache) return facultyCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_faculty', async () => {
                    const { data: faculty, error } = await _supabase
                        .from('faculty')
                        .select('*')
                        .order('faculty_name');
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
        initialize: async () => await fetchFaculty(),
        refresh: async () => {
            facultyCache = null;
            return await fetchFaculty();
        },
        getFaculty: async () => await fetchFaculty(),
        getFacultyById: async (id) => {
            const faculty = await fetchFaculty();
            return faculty.find(f => f.id === id) || null;
        }
    };
})();
console.log("[ARCHITECTURE] FacultyStore loaded");
