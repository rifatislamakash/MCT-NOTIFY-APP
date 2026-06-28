import { _supabase } from '../supabase-client.js';
import { fetchCachedOrDeduplicated } from '../utils.js';

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
                    if (window._supabaseSdkFailing) throw new Error('sdk_timeout');
                    let timerId;
                    const timeoutPromise = new Promise((_, reject) => {
                        timerId = setTimeout(() => reject(new Error('sdk_timeout')), 8000);
                    });
                    let faculty, error;
                    try {
                        const result = await Promise.race([query, timeoutPromise]);
                        faculty = result.data;
                        error = result.error;
                        if (error) throw error;
                    } catch(e) {
                        if (e.message === 'sdk_timeout' && signal && signal.abort) {
                            // Can't abort parent signal directly, but we throw
                        }
                        console.error("[FacultyStore] Query error:", e);
                        throw e;
                    } finally {
                        clearTimeout(timerId);
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
