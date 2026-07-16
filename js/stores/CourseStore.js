import { _supabase } from '../supabase-client.js';
import { fetchCachedOrDeduplicated, fetchWithRetry } from '../utils.js';

export const CourseStore = (function () {
    let coursesCache = null;
    let fetchPromise = null;

    async function fetchCourses() {
        if (coursesCache) return coursesCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_courses', async () => {
                    return await fetchWithRetry(async (signal) => {
                        const { data: courses, error } = await _supabase
                            .from('courses')
                            .select('id, course_name, short_name, course_code, total_credit, batch_id, sections_name, faculty_id, batches ( batch_name )')
                            .order('course_name')
                            .abortSignal(signal);
                        if (error) throw error;
                        return courses || [];
                    }, 4, 1000, 15000);
                });
                
                coursesCache = data;
                window.currentCoursesList = data;
                resolve(data);
            } catch (err) {
                console.error("[CourseStore] Failed to load courses:", err);
                reject(err);
            } finally {
                fetchPromise = null;
            }
        });
        return fetchPromise;
    }

    return {
        initialize: async () => await fetchCourses(),
        refresh: async () => {
            coursesCache = null;
            return await fetchCourses();
        },
        getCourses: async () => await fetchCourses(),
        getCourseById: async (id) => {
            const courses = await fetchCourses();
            return courses.find(c => c.id === id) || null;
        }
    };
})();
console.log("[ARCHITECTURE] CourseStore loaded");
