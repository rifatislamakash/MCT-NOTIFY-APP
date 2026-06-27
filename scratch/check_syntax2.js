
        // LIFECYCLE DIAGNOSTICS & COUNTERS
        window.__DEBUG_PRODUCTION = false;
        window.__firebaseInitCount = 0;
        window.__serviceWorkerRegisterCount = 0;
        window.__authListenerCount = 0;
        window.__pageInitCount = 0;

        window.__LIFECYCLE_DEBUG__ = function(event, message = '') {
            if (window.__DEBUG_PRODUCTION || localStorage.getItem('DEBUG_LIFECYCLE') === 'true') {
                console.log(`%c${event}`, 'color: #10b981; font-weight: bold;', message);
            }
        };

        window.__FORENSIC_TRACER = function(event, data = {}) {
            if (window.__DEBUG_PRODUCTION) {
                console.log(`%c[FORENSIC] ${event}`, 'color: #eab308; font-weight: bold;', data);
            }
        };

        // INTELLIGENT SERVICE WORKER MANAGEMENT
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    const scriptURL = registration.active ? registration.active.scriptURL : 
                                      (registration.installing ? registration.installing.scriptURL : 
                                      (registration.waiting ? registration.waiting.scriptURL : ''));
                    
                    if (!scriptURL.includes('firebase-messaging-sw.js')) {
                        registration.unregister();
                        window.__LIFECYCLE_DEBUG__('[SW UNREGISTER]', `Unregistered rogue worker: ${scriptURL}`);
                    }
                }
            });
        }
    


        window.addEventListener('error', function(e) {
            // If a fatal error occurs and the body is empty or hidden
            setTimeout(() => {
                const root = document.getElementById('root') || document.body;
                if (!root) return; // Prevent infinite loop if body is null during head parsing
                if (root.innerHTML.trim() === '' || root.innerHTML.includes('white-screen')) {
                    document.body.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background-color:#f8fafc; font-family:sans-serif; padding: 20px; text-align:center;">
                            <h2 style="color:#1e293b; margin-bottom:10px;">Update Available</h2>
                            <p style="color:#64748b; margin-bottom:20px;">We've fixed some bugs! Tap the button below to update your app.</p>
                            <button onclick="localStorage.clear(); sessionStorage.clear(); window.location.reload(true);" 
                                    style="background-color:#4F46E5; color:white; border:none; padding:15px 30px; border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                                Install Update
                            </button>
                        </div>
                    `;
                }
            }, 1000);
        });
    


    // CACHE WIPER REMOVED (Caused infinite reload loop)
    


        window.openPermissionGuideModal = function() {
            const modal = document.getElementById('modal-permission-guide');
            const content = document.getElementById('modal-permission-guide-content');
            if (!modal) return;
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('translate-y-full');
            }, 10);
        };
        window.closePermissionGuideModal = function() {
            const modal = document.getElementById('modal-permission-guide');
            const content = document.getElementById('modal-permission-guide-content');
            content.classList.add('translate-y-full');
            setTimeout(() => {
                modal.classList.add('opacity-0');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }, 10);
        };
    


        // ==========================================
        // EDIT SECTION LOGIC
        // ==========================================
        let sectionEditCourseId = null;
        window.openEditSectionModal = function(courseId, currentSection) {
            const course = window.currentCoursesList.find(c => c.id === courseId);
            if (!course || !course.sections_name) return;
            
            sectionEditCourseId = courseId;
            let sectionsArray = [];
            try {
                if (typeof course.sections_name === 'string') {
                    // Try parsing as JSON first
                    const parsed = JSON.parse(course.sections_name);
                    if (Array.isArray(parsed)) {
                        sectionsArray = parsed;
                    } else {
                        sectionsArray = course.sections_name.split(',').map(s => s.trim()).filter(s => s);
                    }
                } else if (Array.isArray(course.sections_name)) {
                    sectionsArray = course.sections_name;
                }
            } catch(e) {
                // Fallback if not valid JSON
                sectionsArray = String(course.sections_name).split(',').map(s => s.trim()).filter(s => s);
            }

            const selectEl = document.getElementById('edit-section-select');
            selectEl.innerHTML = `<option value="" disabled selected>Select Section</option>` + 
                sectionsArray.map(sec => `<option value="${window.sanitizeHTML(sec)}">Section ${window.sanitizeHTML(sec)}</option>`).join('');
            
            if (currentSection && sectionsArray.includes(currentSection)) {
                selectEl.value = currentSection;
            } else {
                selectEl.value = '';
            }

            document.getElementById('modal-edit-section').classList.remove('hidden');
        };

        window.closeEditSectionModal = function() {
            document.getElementById('modal-edit-section').classList.add('hidden');
            sectionEditCourseId = null;
        };

        window.saveEditSection = async function() {
            if (!sectionEditCourseId || !authState.user?.id) return;
            const selectEl = document.getElementById('edit-section-select');
            const newSection = selectEl.value;

            if (!newSection) {
                showGlobalToast("Notice", "Please select a section.");
                return;
            }

            showLoader(true, "Updating section...");
            try {
                const { error } = await _supabase.from('user_courses')
                    .update({ section_name: newSection })
                    .eq('user_id', authState.user.id)
                    .eq('course_id', sectionEditCourseId);
                
                if (error) throw error;
                
                // Update local list
                const enrolledRecord = window.currentUserCoursesList.find(uc => uc.course_id === sectionEditCourseId);
                if (enrolledRecord) {
                    enrolledRecord.section_name = newSection;
                }

                showGlobalToast("Success", "Section updated successfully.");
                closeEditSectionModal();
                
                // Refresh routines cache since enrolled section changed
                if (window.RoutineStore) {
                    await window.RoutineStore.refresh();
                }
                const container = document.getElementById('enrolled-courses-list');
                if (container && typeof window.loadMyCourses === 'function') {
                    window.loadMyCourses();
                }
            } catch (err) {
                console.error("[UPDATE SECTION] Error:", err);
                showGlobalToast("Error", err.message || "Failed to update section.");
            } finally {
                showLoader(false);
            }
        };
    