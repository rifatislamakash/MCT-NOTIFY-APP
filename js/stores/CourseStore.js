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
                    const sdkController = new AbortController();
                    const sdkPromise = _supabase
                        .from('courses')
                        .select('id, course_name, short_name, course_code, total_credit, batch_id, sections_name, faculty_id, batches ( batch_name )')
                        .order('course_name')
                        .abortSignal(sdkController.signal);
                        
                    try {
                        if (window._supabaseSdkFailing) throw new Error('sdk_timeout');
                        let timerId;
                        const timeoutPromise = new Promise((_, reject) => {
                            timerId = setTimeout(() => reject(new Error('sdk_timeout')), 400);
                        });
                        let courses, error;
                        try {
                            const result = await Promise.race([sdkPromise, timeoutPromise]);
                            courses = result.data;
                            error = result.error;
                        } finally {
                            clearTimeout(timerId);
                        }
                        if (error) throw error;
                        return courses || [];
                    } catch (e) {
                        if (e.message === 'sdk_timeout') {
                            sdkController.abort();
                            window._supabaseSdkFailing = true;
                            console.log("[CourseStore] Supabase SDK hung, falling back to REST");
                            const url = `${_supabase.supabaseUrl}/rest/v1/courses?select=id,course_name,short_name,course_code,total_credit,batch_id,sections_name,faculty_id,batches(batch_name)&order=course_name.asc`;
                            const res = await fetch(url, {
                                headers: {
                                    'apikey': _supabase.supabaseKey,
                                    'Authorization': `Bearer ${window.authState?.session?.access_token || _supabase.supabaseKey}`,
                                    'cache-control': 'no-cache'
                                },
                                cache: 'no-store'
                            });
                            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                            return await res.json();
                        }
                        throw e;
                    }
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
