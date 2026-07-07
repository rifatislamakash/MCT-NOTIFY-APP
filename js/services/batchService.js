import { _supabase } from '../supabase-client.js';

export const batchService = {
    /**
     * Get all courses belonging to a batch
     */
    async getBatchCourses(batchIds) {
        if (!batchIds || batchIds.length === 0) return [];
        console.log('[BATCH COURSES] Fetching courses for batches:', batchIds);
        const { data, error } = await _supabase
            .from('courses')
            .select('*')
            .in('batch_id', batchIds);
            
        if (error) {
            console.error('[BATCH COURSES] Error:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Get all students enrolled in at least one course belonging to a batch
     */
    async getBatchStudents(batchIds) {
        if (!batchIds || batchIds.length === 0) return [];
        console.log('[BATCH STUDENTS] Fetching students for batches:', batchIds);
        
        const uniqueStudents = [];
        const seenIds = new Set();

        // 1. Fetch students whose primary batch is in batchIds
        const { data: primaryData, error: primaryErr } = await _supabase
            .from('profiles')
            .select('*')
            .in('batch_id', batchIds);
            
        if (!primaryErr && primaryData) {
            primaryData.forEach(p => {
                if (!seenIds.has(p.id)) {
                    seenIds.add(p.id);
                    uniqueStudents.push(p);
                }
            });
        }

        // 2. Fetch students enrolled in courses belonging to these batches
        const { data: courseData, error: courseErr } = await _supabase
            .from('user_courses')
            .select(`
                user_id,
                profiles (*),
                courses!inner (batch_id, course_name, short_name)
            `)
            .in('courses.batch_id', batchIds);
            
        if (courseErr) {
            console.error('[BATCH STUDENTS] Course error:', courseErr);
        }
        
        if (!courseErr && courseData) {
            courseData.forEach(record => {
                if (record.profiles && !seenIds.has(record.user_id)) {
                    seenIds.add(record.user_id);
                    uniqueStudents.push(record.profiles);
                }
            });
        }
        
        return uniqueStudents;
    },

    /**
     * Get all materials whose course belongs to a batch
     */
    async getBatchMaterials(batchIds) {
        if (!batchIds || batchIds.length === 0) return [];
        console.log('[BATCH MATERIALS] Fetching materials for batches:', batchIds);
        const { data, error } = await _supabase
            .from('materials')
            .select(`
                *,
                courses!inner (batch_id, course_name, short_name)
            `)
            .in('courses.batch_id', batchIds)
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('[BATCH MATERIALS] Error:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Get all weekly routines whose course belongs to a batch
     */
    async getBatchRoutines(batchIds) {
        if (!batchIds || batchIds.length === 0) return [];
        console.log('[BATCH ROUTINES] Fetching routines for batches:', batchIds);
        const { data, error } = await _supabase
            .from('weekly_routines')
            .select(`
                *,
                courses!inner (batch_id, course_name, short_name),
                faculty (id, faculty_name, teacher_initial),
                batches (id, batch_name)
            `)
            .in('courses.batch_id', batchIds);
            
        if (error) {
            console.error('[BATCH ROUTINES] Error:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Get all groups whose course belongs to a batch
     */
    async getBatchGroups(batchIds) {
        if (!batchIds || batchIds.length === 0) return [];
        console.log('[BATCH GROUPS] Fetching groups for batches:', batchIds);
        const { data, error } = await _supabase
            .from('groups')
            .select(`
                *,
                courses!inner (batch_id, course_name, short_name)
            `)
            .in('courses.batch_id', batchIds);
            
        if (error) {
            console.error('[BATCH GROUPS] Error:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Get all notices linked through notice_courses or content_targets to batches
     */
    async getBatchNotices(batchIds) {
        if (!batchIds || batchIds.length === 0) return [];
        console.log('[BATCH NOTICES] Fetching notices for batches:', batchIds);
        
        const seenIds = new Set();
        const uniqueNotices = [];
        
        // 1, 2, 3. Fetch legacy notice_courses, content_targets for batches, and courses concurrently
        const [legacyResult, ctBatchResult, courseResult] = await Promise.all([
            _supabase
                .from('notice_courses')
                .select('notice_id, notices(*, notice_courses(course_id), profiles(id, full_name, profile_url, role)), courses!inner(batch_id)')
                .in('courses.batch_id', batchIds),
            _supabase
                .from('content_targets')
                .select('content_id')
                .eq('content_type', 'notice')
                .in('target_type', ['batch_students', 'batch_crs'])
                .in('target_id', batchIds),
            _supabase.from('courses').select('id').in('batch_id', batchIds)
        ]);

        const legacyData = legacyResult.data;
        const ctBatchData = ctBatchResult.data;
        const courseData = courseResult.data;
            
        (legacyData || []).forEach(record => {
            if (record.notices && !seenIds.has(record.notices.id)) {
                seenIds.add(record.notices.id);
                uniqueNotices.push(record.notices);
            }
        });
        
        const courseIds = courseData ? courseData.map(c => c.id) : [];
        
        let ctCourseData = [];
        if (courseIds.length > 0) {
            const { data } = await _supabase
                .from('content_targets')
                .select('content_id')
                .eq('content_type', 'notice')
                .eq('target_type', 'course_students')
                .in('target_id', courseIds);
            ctCourseData = data || [];
        }
        
        // Collect unique notice IDs from content_targets that we haven't already fetched
        const ctNoticeIds = [...new Set(
            [...(ctBatchData || []), ...ctCourseData].map(r => r.content_id)
        )].filter(id => !seenIds.has(id));
        
        // Fetch those notices
        if (ctNoticeIds.length > 0) {
            const { data: ctNotices } = await _supabase
                .from('notices')
                .select('*, notice_courses(course_id), profiles(id, full_name, profile_url, role)')
                .in('id', ctNoticeIds);
            (ctNotices || []).forEach(n => {
                if (!seenIds.has(n.id)) {
                    seenIds.add(n.id);
                    uniqueNotices.push(n);
                }
            });
        }
        
        return uniqueNotices;
    },

    /**
     * Get all schedules linked through schedule_courses or content_targets to batches
     */
    async getBatchSchedules(batchIds) {
        if (!batchIds || batchIds.length === 0) return [];
        console.log('[BATCH SCHEDULES] Fetching schedules for batches:', batchIds);
        
        const seenIds = new Set();
        const uniqueSchedules = [];
        
        // 1, 2, 3. Fetch legacy schedule_courses, content_targets for batches, and courses concurrently
        const [legacyResult, ctBatchResult, courseResult] = await Promise.all([
            _supabase
                .from('schedule_courses')
                .select('schedule_id, schedules(*, profiles(id, full_name, profile_url, role)), courses!inner(batch_id)')
                .in('courses.batch_id', batchIds),
            _supabase
                .from('content_targets')
                .select('content_id')
                .eq('content_type', 'schedule')
                .in('target_type', ['batch_students', 'batch_crs'])
                .in('target_id', batchIds),
            _supabase.from('courses').select('id').in('batch_id', batchIds)
        ]);

        const legacyData = legacyResult.data;
        const ctBatchData = ctBatchResult.data;
        const courseData = courseResult.data;
            
        (legacyData || []).forEach(record => {
            if (record.schedules && !seenIds.has(record.schedules.id)) {
                seenIds.add(record.schedules.id);
                uniqueSchedules.push(record.schedules);
            }
        });
        
        const courseIds = courseData ? courseData.map(c => c.id) : [];
        
        let ctCourseData = [];
        if (courseIds.length > 0) {
            const { data } = await _supabase
                .from('content_targets')
                .select('content_id')
                .eq('content_type', 'schedule')
                .eq('target_type', 'course_students')
                .in('target_id', courseIds);
            ctCourseData = data || [];
        }
        
        // Collect unique schedule IDs from content_targets not already fetched
        const ctScheduleIds = [...new Set(
            [...(ctBatchData || []), ...ctCourseData].map(r => r.content_id)
        )].filter(id => !seenIds.has(id));
        
        // Fetch those schedules
        if (ctScheduleIds.length > 0) {
            const { data: ctSchedules } = await _supabase
                .from('schedules')
                .select('*, profiles(id, full_name, profile_url, role)')
                .in('id', ctScheduleIds);
            (ctSchedules || []).forEach(s => {
                if (!seenIds.has(s.id)) {
                    seenIds.add(s.id);
                    uniqueSchedules.push(s);
                }
            });
        }
        
        return uniqueSchedules;
    }
};
