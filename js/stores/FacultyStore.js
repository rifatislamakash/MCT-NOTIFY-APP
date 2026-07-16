import { _supabase } from '../supabase-client.js';
import { fetchCachedOrDeduplicated, fetchWithRetry } from '../utils.js';

export const FacultyStore = (function () {
    let facultyCache = null;
    let fetchPromise = null;

    async function fetchFaculty(signal) {
        if (facultyCache) return facultyCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_faculty', async () => {
                    return await fetchWithRetry(async (retrySignal) => {
                        const activeSignal = signal || retrySignal;
                        let query = _supabase
                            .from('faculty')
                            .select('*')
                            .order('faculty_name');
                        if (activeSignal) {
                            query = query.abortSignal(activeSignal);
                        }
                        const { data: faculty, error } = await query;
                        if (error) throw error;
                        return faculty || [];
                    }, 4, 1000, 15000);
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
