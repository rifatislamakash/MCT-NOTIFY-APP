import { _supabase } from '../supabase-client.js';
import { fetchCachedOrDeduplicated } from '../utils.js';
import { batchService } from './batchService.js';
import { CourseStore } from '../stores/CourseStore.js';

export const crPermissionService = {
    currentAssignedBatches: [],
    _hasFetchedPermissions: false,

    /**
     * Check if the current user is an Admin
     */
    isAdmin() {
        return window.currentUserRole === 'admin' || (window.currentUserEmail && window.isAdminEmail(window.currentUserEmail));
    },

    /**
     * Check if the current user is a CR
     */
    isCR() {
        return window.currentUserRole === 'cr' && !this.isAdmin();
    },

    /**
     * Initialize permissions by loading assigned batches
     */
    async initializePermissions() {
        if (!window.authState || !window.authState.user) return;
        if (!this.isCR()) return; // Admins and students don't need assigned batches
        
        if (this._hasFetchedPermissions) {
            console.log("[CR CACHE] Using cached CR permissions.");
            return;
        }

        await this.refreshPermissions();
    },

    /**
     * Fetch fresh batch assignments from the database
     */
    async refreshPermissions() {
        if (!window.authState || !window.authState.user) return;
        
        console.log('[CR PERMISSION] Refreshing batch assignments...');
        
        try {
            const data = await fetchCachedOrDeduplicated('cr_permissions_' + window.authState.user.id, async () => {
                const sdkPromise = _supabase
                    .from('batch_crs')
                    .select('batch_id')
                    .eq('user_id', window.authState.user.id)
                    .eq('active', true);
                    
                let resData, error;
                
                try {
                    if (window._supabaseSdkFailing) throw new Error('sdk_timeout');
                    let timerId;
                    const timeoutPromise = new Promise((_, reject) => {
                        timerId = setTimeout(() => reject(new Error('sdk_timeout')), 8000);
                    });
                    const result = await Promise.race([sdkPromise, timeoutPromise]);
                    resData = result.data;
                    error = result.error;
                    clearTimeout(timerId);
                } catch (e) {
                    if (e.message === 'sdk_timeout') {
                        if (typeof sdkController !== 'undefined') sdkController.abort();
                        window._supabaseSdkFailing = true;
                        console.log("[CR PERMISSION] [SDK TIMEOUT] 8000ms limit reached");
                        console.log("[CR PERMISSION] [REST FALLBACK]");
                        try {
                            const url = `${_supabase.supabaseUrl}/rest/v1/batch_crs?user_id=eq.${window.authState.user.id}&active=is.true&select=batch_id`;
                            const res = await fetch(url, {
                                headers: {
                                    'apikey': _supabase.supabaseKey,
                                    'Authorization': `Bearer ${window.authState?.session?.access_token || _supabase.supabaseKey}`,
                                    'cache-control': 'no-cache'
                                },
                                cache: 'no-store'
                            });
                            if (!res.ok) {
                                console.log("[CR PERMISSION] [REST FAILURE]");
                                throw new Error(`HTTP error! status: ${res.status}`);
                            }
                            console.log("[CR PERMISSION] [REST SUCCESS]");
                            resData = await res.json();
                        } catch (fetchErr) {
                            console.error("[CR PERMISSION] REST fallback failed:", fetchErr);
                            error = fetchErr;
                        }
                    } else {
                        error = e;
                    }
                }
                    
                if (error) {
                    console.error('[CR PERMISSION] Error fetching assigned batches:', error);
                    throw error;
                }
                
                return resData;
            });
            
            this.currentAssignedBatches = data ? data.map(b => b.batch_id) : [];
            window.currentUserCRBatches = this.currentAssignedBatches;
            this._hasFetchedPermissions = true;
            console.log(`[CR BATCH ACCESS] Assigned Batches: [${this.currentAssignedBatches.join("', '")}]`);
        } catch (err) {
            console.error('[CR PERMISSION] Fatal error refreshing permissions:', err);
            this.currentAssignedBatches = [];
            window.currentUserCRBatches = [];
        }
    },

    /**
     * Check if the user can access a specific batch
     */
    canAccessBatch(batchId) {
        if (this.isAdmin()) return true;
        if (this.isCR()) return this.currentAssignedBatches.some(b => b == batchId);
        return false;
    },

    /**
     * Get visible courses based on role
     */
    async getVisibleCourses() {
        const allCourses = await CourseStore.getCourses();
        if (this.isAdmin()) return allCourses;
        if (this.isCR()) {
            await this.initializePermissions();
            console.log('[CR COURSES] Filtering courses for assigned batches');
            return allCourses.filter(c => this.currentAssignedBatches.some(b => b == c.batch_id));
        }
        return [];
    },

    /**
     * Get visible students based on role
     */
    async getVisibleStudents() {
        if (this.isAdmin()) {
            // Admin sees all students. 
            // In the admin dashboard, they might just use the native user fetch, 
            // but we can wrap a full fetch here if needed. 
            // For now, if called by admin, we could fetch all profiles.
            const { data } = await _supabase.from('profiles').select('*');
            return data || [];
        }
        if (this.isCR()) {
            console.log('[CR STUDENTS] Fetching students for assigned batches');
            return await batchService.getBatchStudents(this.currentAssignedBatches);
        }
        return [];
    },

    /**
     * Get visible materials based on role
     */
    async getVisibleMaterials() {
        if (this.isAdmin()) {
            const { data } = await _supabase.from('materials').select('*, courses(course_name, short_name)').order('created_at', { ascending: false });
            return data || [];
        }
        if (this.isCR()) {
            console.log('[CR MATERIALS] Fetching materials for assigned batches');
            return await batchService.getBatchMaterials(this.currentAssignedBatches);
        }
        return [];
    },

    /**
     * Get visible routines based on role
     */
    async getVisibleRoutines() {
        if (this.isAdmin()) {
            const { data } = await _supabase.from('weekly_routines').select('*, courses(*)');
            return data || [];
        }
        if (this.isCR()) {
            console.log('[CR ROUTINES] Fetching routines for assigned batches');
            return await batchService.getBatchRoutines(this.currentAssignedBatches);
        }
        return [];
    },

    /**
     * Get visible notices based on role
     */
    async getVisibleNotices() {
        if (this.isAdmin()) {
            const { data } = await _supabase.from('notices').select('*, profiles (id, full_name, profile_url, role), notice_courses (course_id)').order('created_at', { ascending: false });
            return data || [];
        }
        if (this.isCR()) {
            console.log('[CR NOTICES] Fetching notices for assigned batches');
            const batchNotices = await batchService.getBatchNotices(this.currentAssignedBatches);
            
            // Also fetch global notices (urgent no longer bypasses)
            const { data: globalNotices } = await _supabase
                .from('notices')
                .select('*, profiles (id, full_name, profile_url, role), notice_courses (course_id)')
                .in('audience_type', ['all', 'all_students']);
                
            const combined = [...batchNotices];
            if (globalNotices) {
                globalNotices.forEach(gn => {
                    // For 'all_students' we want to make sure it's a truly global notice (no specific targets)
                    // or if it has targets, it will be caught by batchService if relevant.
                    // But Supabase doesn't easily let us filter by "has no targets" in the same query.
                    // So we fetch them and add them.
                    if (!combined.find(n => n.id === gn.id)) {
                        combined.push(gn);
                    }
                });
            }
            
            return combined.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
                return new Date(b.created_at) - new Date(a.created_at);
            });
        }
        return [];
    },

    /**
     * Get visible schedules based on role
     */
    async getVisibleSchedules() {
        if (this.isAdmin()) {
            const { data } = await _supabase.from('schedules').select('*, profiles (id, full_name, profile_url, role)').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
            return data || [];
        }
        if (this.isCR()) {
            console.log('[CR SCHEDULES] Fetching schedules for assigned batches');
            const batchSchedules = await batchService.getBatchSchedules(this.currentAssignedBatches);
            
            // Also fetch global schedules
            const { data: globalSchedules } = await _supabase
                .from('schedules')
                .select('*, profiles (id, full_name, profile_url, role)')
                .in('audience_type', ['all', 'all_students']);
                
            const combined = [...batchSchedules];
            if (globalSchedules) {
                globalSchedules.forEach(gs => {
                    if (!combined.find(s => s.id === gs.id)) {
                        combined.push(gs);
                    }
                });
            }
            
            return combined.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
                return new Date(b.created_at) - new Date(a.created_at);
            });
        }
        return [];
    },

    /**
     * Get visible groups based on role
     */
    async getVisibleGroups() {
        if (this.isAdmin()) {
            const { data } = await _supabase.from('groups').select('*, courses(batch_id, course_name, short_name, course_code)').order('created_at', { ascending: false });
            return data || [];
        }
        if (this.isCR()) {
            console.log('[CR GROUPS] Fetching groups for assigned batches');
            return await batchService.getBatchGroups(this.currentAssignedBatches);
        }
        return [];
    }
};
