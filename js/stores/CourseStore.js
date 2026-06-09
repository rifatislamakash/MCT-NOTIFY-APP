import { _supabase } from '../supabase-client.js';
import { fetchCachedOrDeduplicated } from '../utils.js';

export const CourseStore = (function () {
    let coursesCache = null;
    let fetchPromise = null;

    async function fetchCourses() {
        if (coursesCache) return coursesCache;
        if (fetchPromise) return fetchPromise;

        fetchPromise = new Promise(async (resolve, reject) => {
            try {
                const data = await fetchCachedOrDeduplicated('store_courses', async () => {
                    const { data: courses, error } = await _supabase
                        .from('courses')
                        .select('id, course_name, short_name, course_code, total_credit')
                        .order('course_name');
                    if (error) throw error;
                    return courses || [];
                });
                coursesCache = data;
                // Legacy compatibility
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
