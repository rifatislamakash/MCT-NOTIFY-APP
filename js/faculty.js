import { _supabase } from './supabase-client.js';
import { showGlobalToast, showLoader, forceHideLoader, cancelActiveRequest, fetchWithRetry } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        // ----------------- FACULTY & DATABASE INTEGRATION FUNCTIONS -----------------

        // Populate Faculty List specific logics - Controls UI Visibility via RBAC
        function handleFacultyListLogic() {
            const adminActions = document.getElementById('faculty-admin-actions');
            if (adminActions) {
                if (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail)) {
                    adminActions.classList.remove('hidden');
                } else {
                    adminActions.classList.add('hidden');
                }
            }
        }

        // --- Faculty Image Upload Global State ---
        let currentFacultyImageFile = null;
        let detailsFacultyImageFile = null;

        // Handle faculty image file selection (shared for add & details forms)
        function handleFacultyImageSelect(event, mode) {
            const file = event.target.files[0];
            if (!file) return;

            // Validate MIME type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                window.showGlobalToast('Error', 'Invalid file type. Please select JPG, PNG, or WEBP.');
                event.target.value = '';
                return;
            }

            // Validate file size (2MB max)
            const maxSize = 2 * 1024 * 1024;
            if (file.size > maxSize) {
                window.showGlobalToast('Error', 'Image too large. Maximum size is 2MB.');
                event.target.value = '';
                return;
            }

            // Set the appropriate global tracker
            if (mode === 'add') {
                currentFacultyImageFile = file;
            } else {
                detailsFacultyImageFile = file;
            }

            // Show preview
            const reader = new FileReader();
            reader.onload = function (e) {
                const prefix = mode === 'add' ? 'add-faculty' : 'details-faculty';
                const placeholder = document.getElementById(`${prefix}-image-placeholder`);
                const preview = document.getElementById(`${prefix}-image-preview`);
                const previewImg = document.getElementById(`${prefix}-image-preview-img`);
                const previewName = document.getElementById(`${prefix}-image-preview-name`);
                if (placeholder) placeholder.classList.add('hidden');
                if (preview) preview.classList.remove('hidden');
                if (previewImg) previewImg.src = e.target.result;
                if (previewName) previewName.textContent = file.name;
            };
            reader.readAsDataURL(file);
        }

        // Clear image preview and reset file tracker
        function clearFacultyImagePreview(mode) {
            const prefix = mode === 'add' ? 'add-faculty' : 'details-faculty';
            if (mode === 'add') {
                currentFacultyImageFile = null;
            } else {
                detailsFacultyImageFile = null;
            }
            const fileInput = document.getElementById(`${prefix}-image-input`);
            if (fileInput) fileInput.value = '';
            const preview = document.getElementById(`${prefix}-image-preview`);
            const previewImg = document.getElementById(`${prefix}-image-preview-img`);
            const previewName = document.getElementById(`${prefix}-image-preview-name`);
            const placeholder = document.getElementById(`${prefix}-image-placeholder`);
            if (preview) preview.classList.add('hidden');
            if (previewImg) previewImg.src = '';
            if (previewName) previewName.textContent = '';
            if (placeholder) placeholder.classList.remove('hidden');
        }

        // Upload faculty image to support-faculty bucket and return public URL
        export async function uploadFacultyImage(file) {
            if (!file) return null;
            try {
                const fileExt = file.name.split('.').pop().toLowerCase();
                const fileName = `faculty_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

                console.log('[FACULTY IMAGE] Uploading to support-faculty bucket:', fileName);

                const { data: uploadData, error: uploadError } = await _supabase.storage
                    .from('support-faculty')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) {
                    console.error('[FACULTY IMAGE] Upload error:', uploadError);
                    throw new Error(`Image upload failed: ${uploadError.message}`);
                }

                console.log('[FACULTY IMAGE] Upload success:', uploadData);

                const { data: urlData } = _supabase.storage.from('support-faculty').getPublicUrl(fileName);
                const publicUrl = urlData.publicUrl;
                console.log('[FACULTY IMAGE] Public URL:', publicUrl);
                return publicUrl;
            } catch (err) {
                console.error('[FACULTY IMAGE] uploadFacultyImage error:', err);
                throw err;
            }
        }

        // Delete a faculty image from support-faculty bucket by URL
        export async function deleteFacultyImageFromStorage(imageUrl) {
            if (!imageUrl) return;
            try {
                // Extract the file path from the public URL
                const urlParts = imageUrl.split('/support-faculty/');
                if (urlParts.length < 2) return;
                const filePath = urlParts[1].split('?')[0]; // remove query params
                console.log('[FACULTY IMAGE] Deleting from storage:', filePath);
                const { error } = await _supabase.storage.from('support-faculty').remove([filePath]);
                if (error) {
                    console.warn('[FACULTY IMAGE] Storage cleanup warning:', error.message);
                } else {
                    console.log('[FACULTY IMAGE] Deleted successfully from storage');
                }
            } catch (err) {
                console.warn('[FACULTY IMAGE] Storage cleanup failed (non-blocking):', err.message);
            }
        }

        // 1. Fetch Faculty List dynamically from database (Stabilized with fetchWithRetry + AbortController)
        export async function loadFacultyList() {
            if (window.isModuleLoading('faculty')) {
                console.log("[FACULTY FETCH] Faculty fetch already in progress. Reusing existing or ignoring.");
                return;
            }
            window.setModuleLoading('faculty', true);
            cancelActiveRequest('faculty');
            const localController = new AbortController();
            window.activeLoadControllers['faculty'] = localController;

            try {
                const data = await FacultyStore.getFaculty();

                // Guard against stale render after abort
                if (localController.signal.aborted) return;

                window.currentFacultiesList = data;
                
                console.log("[FACULTY FETCH] Safely loaded", data.length, "faculty members");
                renderFacultyList(data);
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('[FACULTY LIST] Request aborted (navigated away)');
                    if (typeof window.forceHideLoader === 'function') window.forceHideLoader();
                    if (window.isScreenActive('screen-faculty-list') && typeof window.navigate === 'function') {
                        /* window.navigate('screen-welcome'); (removed AbortError redirect) */
                    }
                    return;
                }
                console.error('[FACULTY LIST ERROR]', err);
                window.currentFacultiesList = [];
                renderFacultyList([]);
            } finally {
                window.setModuleLoading('faculty', false);
                if (window.activeLoadControllers['faculty'] === localController) {
                    window.activeLoadControllers['faculty'] = null;
                }
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        }

        function filterFacultyList() {
            const query = document.getElementById('faculty-search-input')?.value.toLowerCase() || '';
            const filtered = (window.currentFacultiesList || []).filter(fac => {
                return (fac.faculty_name || '').toLowerCase().includes(query) ||
                       (fac.teacher_initial || '').toLowerCase().includes(query) ||
                       (fac.designation || '').toLowerCase().includes(query);
            });
            renderFacultyList(filtered);
        }

        // Render faculties cleanly
        function renderFacultyList(faculties) {
            const listContainer = document.getElementById('faculty-list-container');
            if (!listContainer) return;

            if (!faculties || faculties.length === 0) {
                listContainer.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-100 p-6">
                            <i data-lucide="users" class="w-10 h-10 mb-2.5 text-slate-300"></i>
                            <p class="text-sm font-bold text-slate-500">No faculty added yet</p>
                            <p class="text-[10px] text-slate-400 mt-1">Check back later or add as an administrator.</p>
                        </div>
                    `;
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
                return;
            }

            console.log(`[FACULTY RENDER] Beginning rendering of ${faculties.length} faculty rows.`);

            try {
                // Ensure array is sorted by faculty_order, placing nulls at the end
                const sortedFaculties = [...faculties].sort((a, b) => {
                    const valA = a?.faculty_order === null || a?.faculty_order === undefined ? Infinity : a.faculty_order;
                    const valB = b?.faculty_order === null || b?.faculty_order === undefined ? Infinity : b.faculty_order;
                    return valA - valB;
                });
                
                listContainer.innerHTML = sortedFaculties.map(fac => {
                    try {
                        const name = window.sanitizeHTML(fac?.faculty_name || 'Unknown Faculty');
                        const designation = window.sanitizeHTML(fac?.designation || 'Lecturer');
                        const room = window.sanitizeHTML(fac?.room || 'N/A');
                        const teacherInitial = window.sanitizeHTML(fac?.teacher_initial || '');
                        
                        // Safe initials generation
                        const initials = String(fac?.faculty_name || 'Unknown Faculty')
                            .split(' ')
                            .filter(n => n)
                            .map(n => n[0])
                            .join('')
                            .substring(0, 2)
                            .toUpperCase() || 'FC';

                        // Support img load failure fallback to initials
                        const avatarHtml = fac?.image_url
                            ? `<img src="${window.sanitizeHTML(fac.image_url)}" alt="${name}" onerror="this.onerror=null; this.outerHTML='<div class=&quot;w-12 h-12 rounded-full bg-indigo-100 text-[#4226E9] flex items-center justify-center shadow-sm font-bold text-lg shrink-0 select-none&quot;>${initials}</div>';" class="w-12 h-12 rounded-full object-cover shadow-sm shrink-0 border border-indigo-100">`
                            : `<div class="w-12 h-12 rounded-full bg-indigo-100 text-[#4226E9] flex items-center justify-center shadow-sm font-bold text-lg shrink-0 select-none">${initials}</div>`;

                        return `
                                <div onclick="openFacultyDetails('${fac?.id || ''}')" class="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4 cursor-pointer hover:border-[#4226E9]/30 hover:shadow-sm transition-all active:scale-[0.98]">
                                    ${avatarHtml}
                                    <div class="flex-1 min-w-0">
                                        <h4 class="font-bold text-sm text-slate-900 truncate">${name} ${teacherInitial ? `<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded ml-1">${teacherInitial}</span>` : ''}</h4>
                                        <p class="text-[10px] text-slate-500 font-semibold mb-1">${designation}</p>
                                        <div class="flex items-center gap-1.5 text-[10px] text-slate-400">
                                            <i data-lucide="map-pin" class="w-3 h-3 text-indigo-500"></i>
                                            <span>Room ${room}</span>
                                        </div>
                                    </div>
                                    <button class="w-8 h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center pointer-events-none">
                                        <i data-lucide="chevron-right" class="w-4 h-4"></i>
                                    </button>
                                </div>
                            `;
                    } catch (rowErr) {
                        console.error("[FACULTY CARD ERROR] Skipped broken row rendering:", rowErr);
                        return '';
                    }
                }).join('');

                console.log(`[FACULTY RENDER] Rendered card elements into DOM successfully.`);

                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            } catch (err) {
                console.error("[FACULTY RENDER] Critical outer list render crash:", err);
                listContainer.innerHTML = `<div class="text-center text-red-500 font-medium py-8 bg-red-50 rounded-2xl border border-red-100 shadow-sm">Error displaying faculty list safely.</div>`;
            }
        }

        // 2. Click Faculty Card to Open Details
        function openFacultyDetails(facultyId) {
            console.log('[FACULTY DETAIL] Opening ID:', facultyId);
            const faculties = window.currentFacultiesList || [];
            window.selectedFaculty = faculties.find(f => f.id === facultyId) || null;
            window.currentViewedFacultyId = facultyId;

            console.log('[FACULTY DETAIL] Current Viewed ID:', window.currentViewedFacultyId);
            console.log('[FACULTY DETAIL] Selected Faculty (pre-load):', window.selectedFaculty);

            window.navigate('screen-faculty-details');
        }

        // 3. Load Detailed Faculty Screen (Stabilized)
        export async function loadFacultyDetails(facultyId) {
            console.log('[FACULTY DETAIL] loadFacultyDetails called with:', facultyId);
            try {
                window.showLoader(true, "Loading details...");

                // Reset image upload state for details form
                detailsFacultyImageFile = null;
                clearFacultyImagePreview('details');

                const facultyData = await FacultyStore.getFacultyById(facultyId);
                console.log('[FACULTY DETAIL DATA]', facultyData);

                if (!facultyData) throw new Error("Faculty not found in store");
                // Sync the global tracker
                window.selectedFaculty = facultyData;

                try {
                    // Handle RBAC UI Guardrails
                    const isAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
                    const isStudent = !isAdmin;

                    // Populate detailed inputs using exact schema mapping with strict null checking safety gates
                    const inputName = document.getElementById('details-faculty-name');
                    if (inputName) {
                        inputName.value = facultyData?.faculty_name ?? 'N/A';
                        inputName.disabled = isStudent;
                    }
                    const inputInitial = document.getElementById('details-faculty-initial');
                    if (inputInitial) {
                        inputInitial.value = facultyData?.teacher_initial ?? 'N/A';
                        inputInitial.disabled = isStudent;
                    }
                    const inputDesignation = document.getElementById('details-faculty-designation');
                    if (inputDesignation) {
                        inputDesignation.value = facultyData?.designation ?? 'N/A';
                        inputDesignation.disabled = isStudent;
                    }
                    const inputRoom = document.getElementById('details-faculty-room');
                    if (inputRoom) {
                        inputRoom.value = facultyData?.room ?? 'N/A';
                        inputRoom.disabled = isStudent;
                    }
                    const inputOrder = document.getElementById('details-faculty-order');
                    if (inputOrder) {
                        inputOrder.value = facultyData?.faculty_order ?? 0;
                    }
                    const inputCourse = document.getElementById('details-faculty-course');
                    if (inputCourse) {
                        inputCourse.disabled = isStudent;
                        // Use course_id from faculty, but note: HTML might not have course options loaded yet!
                        inputCourse.value = facultyData?.course_id || '';
                    }
                    const descInput = document.getElementById('details-faculty-description');
                    if (descInput) {
                        descInput.value = facultyData?.description ?? 'N/A';
                        descInput.disabled = isStudent;
                        // Auto-resize description
                        descInput.style.height = '';
                        descInput.style.height = descInput.scrollHeight + 'px';
                    }

                    // --- PART 5: Populate header avatar ---
                    const headerAvatarImg = document.getElementById('details-faculty-image-current');
                    const headerAvatarFallback = document.getElementById('details-faculty-image-fallback');
                    const nameDisplay = document.getElementById('details-faculty-name-display');
                    const desigDisplay = document.getElementById('details-faculty-designation-display');
                    const editBtn = document.getElementById('details-faculty-image-edit-btn');

                    if (nameDisplay) nameDisplay.textContent = facultyData?.faculty_name ?? 'N/A';
                    if (desigDisplay) desigDisplay.textContent = facultyData?.designation ?? 'N/A';

                    if (facultyData?.image_url) {
                        if (headerAvatarImg) {
                            headerAvatarImg.src = window.sanitizeUrl ? window.sanitizeUrl(facultyData.image_url) : facultyData.image_url;
                            headerAvatarImg.classList.remove('hidden');
                            headerAvatarImg.onerror = function () {
                                this.classList.add('hidden');
                                if (headerAvatarFallback) headerAvatarFallback.style.display = '';
                            };
                        }
                        if (headerAvatarFallback) headerAvatarFallback.style.display = 'none';
                    } else {
                        if (headerAvatarImg) headerAvatarImg.classList.add('hidden');
                        if (headerAvatarFallback) headerAvatarFallback.style.display = '';
                    }

                    // Show/hide image upload zone based on role
                    const imageDropzone = document.getElementById('details-faculty-image-dropzone');
                    const adminActions = document.getElementById('faculty-details-admin-actions');
                    const headerSubtitle = document.getElementById('details-header-subtitle');
                    if (isStudent) {
                        if (adminActions) adminActions.classList.add('hidden');
                        if (headerSubtitle) headerSubtitle.innerText = "View information";
                        if (imageDropzone) imageDropzone.classList.add('hidden');
                        if (editBtn) editBtn.classList.add('hidden');
                    } else {
                        if (adminActions) adminActions.classList.remove('hidden');
                        if (headerSubtitle) headerSubtitle.innerText = "Update or delete record";
                        if (imageDropzone) imageDropzone.classList.remove('hidden');
                        if (editBtn) editBtn.classList.remove('hidden');
                    }

                    if (typeof lucide !== 'undefined') lucide.createIcons();

                } catch (renderErr) {
                    console.error('[FACULTY DETAIL RENDER ERROR]', renderErr);
                }

            } catch (err) {
                console.error('[FACULTY DETAILS ERROR]', err);
                window.showGlobalToast("Error", "Could not load faculty details.");
                window.navigate('screen-faculty-list');
            } finally {
                window.showLoader(false);
            }
        }
        // 4. Submit Update Faculty Request (Admin Protected)
        let isUpdatingFaculty = false;
        export async function updateFaculty(event) {
            event.preventDefault();
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }

            if (window.currentUserRole !== 'admin' && !window.isAdminEmail(window.currentUserEmail)) {
                return;
            }
            if (isUpdatingFaculty) return;
            isUpdatingFaculty = true;

            try {
                window.showLoader(true, "Updating faculty...");

                const updatedFacultyName = document.getElementById('details-faculty-name').value.trim();
                const updatedInitial = document.getElementById('details-faculty-initial').value.trim().toUpperCase();
                const updatedDesignation = document.getElementById('details-faculty-designation').value.trim();
                const updatedRoom = document.getElementById('details-faculty-room').value.trim();
                const updatedDescription = document.getElementById('details-faculty-description').value.trim();
                const updatedOrderInput = document.getElementById('details-faculty-order');
                const updatedOrder = updatedOrderInput ? parseInt(updatedOrderInput.value, 10) : 0;

                // Handle image upload if a new image was selected
                let imageUrl = window.selectedFaculty ? window.selectedFaculty.image_url : null;
                if (detailsFacultyImageFile) {
                    window.showLoader(true, "Uploading image...");
                    const newUrl = await uploadFacultyImage(detailsFacultyImageFile);
                    if (newUrl) {
                        // Clean up old image from storage if it existed
                        if (imageUrl) {
                            await deleteFacultyImageFromStorage(imageUrl);
                        }
                        imageUrl = newUrl;
                    }
                    window.showLoader(true, "Saving changes...");
                }

                // Explicit match to backend column schema -> faculty_name
                const { error } = await _supabase
                    .from('faculty')
                    .update({
                        faculty_name: updatedFacultyName,
                        teacher_initial: updatedInitial,
                        designation: updatedDesignation,
                        room: updatedRoom,
                        description: updatedDescription,
                        faculty_order: isNaN(updatedOrder) ? 0 : updatedOrder,
                        image_url: imageUrl || null
                    })
                    .eq('id', window.currentViewedFacultyId);

                if (error) throw error;

                // Clear the file tracker after successful save
                detailsFacultyImageFile = null;

                window.showGlobalToast("Success", "Faculty profile updated successfully.");

                // Repull local update snapshot seamlessly
                await FacultyStore.refresh();
                await loadFacultyDetails(window.currentViewedFacultyId);

            } catch (err) {
                console.error('[UPDATE ERROR]', err);
                if (err.code === '22P02' && err.message && err.message.includes('uuid')) {
                    window.showGlobalToast("Database Schema Error", "Please change 'teacher_initial' back to 'text' in Supabase! A UUID column cannot store letters like 'KJH'.");
                } else {
                    window.showGlobalToast("Error", err.message || "Failed to update faculty.");
                }
            } finally {
                isUpdatingFaculty = false;
                window.showLoader(false);
            }
        }

        // 5. Submit Delete Request Safely sequentially unassigning from courses first (Admin Protected)
        let isDeletingFaculty = false;
        export async function removeFaculty() {
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            try {
                if (window.currentUserRole !== 'admin' && !window.isAdminEmail(window.currentUserEmail)) {
                    window.showGlobalToast("Access Denied", "You do not have permission to delete faculty.");
                    return;
                }

                if (!window.selectedFaculty || !window.selectedFaculty.id) {
                    window.showGlobalToast("Error", "No faculty selected for deletion.");
                    return;
                }
                if (isDeletingFaculty) return;
                isDeletingFaculty = true;

                window.showLoader(true, "Removing faculty assignment from courses and deleting...");

                // Step 0: Clean up image from storage if it exists
                if (window.selectedFaculty.image_url) {
                    await deleteFacultyImageFromStorage(window.selectedFaculty.image_url);
                }

                // Step 1: Clear this faculty member from any assigned courses first to preserve relational integrity
                const { error: courseUpdateError } = await _supabase
                    .from('courses')
                    .update({ faculty_id: null })
                    .eq('faculty_id', window.selectedFaculty.id);

                if (courseUpdateError) {
                    window.showLoader(false);
                    window.showGlobalToast("Error", `Failed to unassign faculty from courses: ${courseUpdateError.message}`);
                    return;
                }

                // Step 2: Now that the connection is severed, safely delete the faculty member
                const { error: facultyDeleteError } = await _supabase
                    .from('faculty')
                    .delete()
                    .eq('id', window.selectedFaculty.id);

                if (facultyDeleteError) {
                    window.showLoader(false);
                    window.showGlobalToast("Error", `Failed to delete faculty member: ${facultyDeleteError.message}`);
                    return;
                }

                // Step 3: Update local state to remove from UI screen
                window.selectedFaculty = null;
                window.currentViewedFacultyId = null;

                window.showGlobalToast("Success", "Faculty member successfully deleted and removed from assigned courses.");
                window.navigate('screen-faculty-list');
                await FacultyStore.refresh();
                await loadFacultyList();

            } catch (err) {
                window.showLoader(false);
                window.showGlobalToast("Error", "An unexpected error occurred during deletion.");
            } finally {
                isDeletingFaculty = false;
                window.showLoader(false);
            }
        }

        // Fetch pure courses dynamically securely mapping to DB table
        export async function fetchCourseList() {
            return await CourseStore.getCourses();
        }

        // Load Add Faculty dropdown exclusively
        export async function loadCourseDropdown() {
            try {
                const courses = await fetchCourseList();
                populateCourseDropdown('add-faculty-course', courses);
            } catch (err) {
                populateCourseDropdown('add-faculty-course', []);
            }
        }

        // Load Details Screen Dropdown explicitly
        export async function loadCourseDropdownForDetails() {
            try {
                const courses = await fetchCourseList();
                populateCourseDropdown('details-faculty-course', courses);
            } catch (err) {
                populateCourseDropdown('details-faculty-course', []);
            }
        }

        // Populate reusable select dropdown logic parsing course_name as label and storing ID internally
        function populateCourseDropdown(elementId, courses) {
            const dropdown = document.getElementById(elementId);
            if (!dropdown) return;

            if (!courses || courses.length === 0) {
                dropdown.innerHTML = '<option value="" disabled selected hidden>No courses available</option>';
                return;
            }

            dropdown.innerHTML = `
                    <option value="" disabled selected hidden>Select assigned course</option>
                    ` + courses.map(course => `
                        <option value="${course.id}">${course.course_name} (${course.course_code || 'N/A'})</option>
                    `).join('');
        }

        // Submit Add Faculty Form cleanly (Admin Protected)
        let isAddingFaculty = false;
        export async function handleAddFaculty(event) {
            event.preventDefault();
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }

            if (window.currentUserRole !== 'admin' && !window.isAdminEmail(window.currentUserEmail)) {
                window.showGlobalToast("Access Denied", "Only administrators can add faculty.");
                return;
            }
            if (isAddingFaculty) return;
            isAddingFaculty = true;

            const nameInput = document.getElementById('add-faculty-name');
            const initialInput = document.getElementById('add-faculty-initial');
            const designationInput = document.getElementById('add-faculty-designation');
            const roomInput = document.getElementById('add-faculty-room');
            const descriptionInput = document.getElementById('add-faculty-description');
            const orderInput = document.getElementById('add-faculty-order');

            const facultyName = nameInput ? nameInput.value.trim() : '';
            const teacherInitial = initialInput ? initialInput.value.trim().toUpperCase() : '';
            const designation = designationInput ? designationInput.value.trim() : '';
            const room = roomInput ? roomInput.value.trim() : '';
            const description = descriptionInput ? descriptionInput.value.trim() : '';
            const facultyOrder = orderInput ? parseInt(orderInput.value, 10) : 0;

            if (!facultyName || !teacherInitial || !designation || !room) {
                window.showGlobalToast("Error", "Please fill in all required fields.");
                isAddingFaculty = false;
                return;
            }

            window.showLoader(true, "Adding faculty member...");

            try {
                // Handle image upload if a file was selected
                let imageUrl = null;
                if (currentFacultyImageFile) {
                    window.showLoader(true, "Uploading image...");
                    imageUrl = await uploadFacultyImage(currentFacultyImageFile);
                    window.showLoader(true, "Saving faculty...");
                }

                const payload = {
                    faculty_name: facultyName,
                    teacher_initial: teacherInitial,
                    designation: designation,
                    room: room,
                    description: description,
                    faculty_order: isNaN(facultyOrder) ? 0 : facultyOrder,
                    image_url: imageUrl || null
                };

                const { data, error } = await _supabase
                    .from('faculty')
                    .insert([payload]);

                if (error) throw error;

                window.showGlobalToast("Success", "Faculty added successfully.");

                // Clear state inputs immediately
                if (nameInput) nameInput.value = '';
                if (initialInput) initialInput.value = '';
                if (designationInput) designationInput.value = '';
                if (roomInput) roomInput.value = '';
                if (descriptionInput) descriptionInput.value = '';
                currentFacultyImageFile = null;
                clearFacultyImagePreview('add');

                window.navigate('screen-faculty-list');
                await FacultyStore.refresh();
                await loadFacultyList();

            } catch (err) {
                console.error('[ADD FACULTY ERROR]', err);
                if (err.code === '22P02' && err.message && err.message.includes('uuid')) {
                    window.showGlobalToast("Database Schema Error", "Please change 'teacher_initial' back to 'text' in Supabase! A UUID column cannot store letters like 'KJH'.");
                } else {
                    window.showGlobalToast("Error", err.message || "Failed to add faculty member.");
                }
            } finally {
                isAddingFaculty = false;
                window.showLoader(false);
            }
        }
















export const FacultyService = {
    handleFacultyListLogic: typeof handleFacultyListLogic !== 'undefined' ? handleFacultyListLogic : window.handleFacultyListLogic,
    handleFacultyImageSelect: typeof handleFacultyImageSelect !== 'undefined' ? handleFacultyImageSelect : window.handleFacultyImageSelect,
    clearFacultyImagePreview: typeof clearFacultyImagePreview !== 'undefined' ? clearFacultyImagePreview : window.clearFacultyImagePreview,
    uploadFacultyImage: typeof uploadFacultyImage !== 'undefined' ? uploadFacultyImage : window.uploadFacultyImage,
    deleteFacultyImageFromStorage: typeof deleteFacultyImageFromStorage !== 'undefined' ? deleteFacultyImageFromStorage : window.deleteFacultyImageFromStorage,
    loadFacultyList: typeof loadFacultyList !== 'undefined' ? loadFacultyList : window.loadFacultyList,
    filterFacultyList: typeof filterFacultyList !== 'undefined' ? filterFacultyList : window.filterFacultyList,
    renderFacultyList: typeof renderFacultyList !== 'undefined' ? renderFacultyList : window.renderFacultyList,
    openFacultyDetails: typeof openFacultyDetails !== 'undefined' ? openFacultyDetails : window.openFacultyDetails,
    loadFacultyDetails: typeof loadFacultyDetails !== 'undefined' ? loadFacultyDetails : window.loadFacultyDetails,
    updateFaculty: typeof updateFaculty !== 'undefined' ? updateFaculty : window.updateFaculty,
    removeFaculty: typeof removeFaculty !== 'undefined' ? removeFaculty : window.removeFaculty,
    handleAddFaculty: typeof handleAddFaculty !== 'undefined' ? handleAddFaculty : window.handleAddFaculty
};
console.log("[ARCHITECTURE]\nfaculty loaded");
