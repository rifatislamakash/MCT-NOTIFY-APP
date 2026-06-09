import { _supabase } from './supabase-client.js';
import { showGlobalToast, showLoader, forceHideLoader, cancelActiveRequest, fetchWithRetry, extractIdFromEmail } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        export async function populateProfileDetails() {
            try {
                const profile = window.authState.profile || {
                    full_name: "Alex Johnson",
                    email: "252-40-016@diu.edu.bd",
                    role: "student"
                };

                const emailStr = String(profile?.email || 'alex@diu.edu.bd').trim();
                const studentId = extractIdFromEmail(emailStr);

                const displayNameEl = document.getElementById('profile-display-name');
                if (displayNameEl) displayNameEl.innerText = profile?.full_name || 'Alex Johnson';

                const userEmailEl = document.getElementById('profile-user-email');
                if (userEmailEl) userEmailEl.innerText = emailStr;

                const userPhoneEl = document.getElementById('profile-user-phone');
                if (userPhoneEl) userPhoneEl.innerText = profile?.phone_number || 'Not Set';

                const idElement = document.getElementById('profile-user-id');
                if (idElement) {
                    idElement.innerText = studentId;
                    idElement.className = "text-xs font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis block max-w-full";
                }

                const roleBadge = document.getElementById('profile-user-role');
                const avatarImg = document.getElementById('profile-avatar');
                const fallbackAvatar = document.getElementById('profile-fallback-avatar');

                // Calculate actual DB values for courses/credits
                if (window.authState.user) {
                    cancelActiveRequest('profile');
                    const localController = new AbortController();
                    window.activeLoadControllers = window.activeLoadControllers || {};
                    window.activeLoadControllers['profile'] = localController;

                    try {
                        const ucData = await fetchWithRetry(async (signal) => {
                            const { data, error } = await _supabase
                                .from('user_courses')
                                .select('course_id')
                                .eq('user_id', window.authState.user.id)
                                .abortSignal(signal);
                            if (error) throw error;
                            return data;
                        }, 3, 1000, 8000, localController.signal);

                        if (localController.signal.aborted) return;

                        const courseIds = (ucData || []).map(u => u.course_id);
                        const coursesCountEl = document.getElementById('profile-courses-count');
                        const creditsCountEl = document.getElementById('profile-credits-count');

                        if (coursesCountEl) coursesCountEl.innerText = courseIds.length;

                        if (courseIds.length > 0) {
                            const cData = await fetchWithRetry(async (signal) => {
                                const { data, error } = await _supabase
                                    .from('courses')
                                    .select('total_credit')
                                    .in('id', courseIds)
                                    .abortSignal(signal);
                                if (error) throw error;
                                return data;
                            }, 3, 1000, 8000, localController.signal);

                            if (localController.signal.aborted) return;

                            const totalCredits = (cData || []).reduce((sum, c) => sum + (c.total_credit || 0), 0);
                            if (creditsCountEl) creditsCountEl.innerText = totalCredits;
                        } else {
                            if (creditsCountEl) creditsCountEl.innerText = 0;
                        }
                    } catch (err) {
                        if (err.name === 'AbortError' || (err.message && err.message.includes('AbortError'))) {
                            console.log("[PROFILE] Load aborted, resetting to welcome screen.");
                            if (typeof window.forceHideLoader === 'function') window.forceHideLoader();
                            if (typeof window.isScreenActive === 'function' && window.isScreenActive('screen-profile') && typeof window.navigate === 'function') {
                                /* window.navigate('screen-welcome'); (removed AbortError redirect) */
                            }
                            return;
                        }
                        console.error("[PROFILE LOAD ERROR]", err);
                    } finally {
                        if (window.activeLoadControllers && window.activeLoadControllers['profile'] === localController) {
                            window.activeLoadControllers['profile'] = null;
                        }
                    }
                }

                const role = String(profile?.role || '').toLowerCase();
                if (role === 'admin' || window.isAdminEmail(emailStr) /* REMOVED HARDCODED - USE window.isAdminEmail */) {
                    if (roleBadge) {
                        roleBadge.innerText = "System Admin (MCT)";
                        roleBadge.className = "inline-block text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-[#4226E9] px-2.5 py-0.5 rounded-full";
                    }
                } else {
                    if (roleBadge) {
                        roleBadge.innerText = "DIU MCT Student";
                        roleBadge.className = "inline-block text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full";
                    }
                }

                if (profile?.profile_url) {
                    if (avatarImg) {
                        avatarImg.src = profile.profile_url;
                        avatarImg.classList.remove('hidden');
                    }
                    if (fallbackAvatar) fallbackAvatar.classList.add('hidden');
                } else {
                    if (avatarImg) avatarImg.classList.add('hidden');
                    if (fallbackAvatar) fallbackAvatar.classList.remove('hidden');
                }
            } catch (err) {
                console.error("Profile populate error:", err);
            }
        }



        // ----------------- PROFILE PICTURE SYSTEM -----------------
        let currentCropper = null;
        let currentProfilePictureFile = null;

        window.openProfilePictureModal = function () {
            const modal = document.getElementById('modal-profile-picture');
            const content = document.getElementById('modal-profile-picture-content');

            resetProfilePictureModal();
            updateProfilePictureModalView();

            modal.classList.remove('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                content.classList.remove('translate-y-full', 'sm:translate-y-0', 'sm:scale-90');
            }, 10);
        };

        window.closeProfilePictureModal = function () {
            const modal = document.getElementById('modal-profile-picture');
            const content = document.getElementById('modal-profile-picture-content');
            content.classList.add('translate-y-full', 'sm:translate-y-0', 'sm:scale-90');
            setTimeout(() => {
                modal.classList.add('opacity-0', 'pointer-events-none');
                resetProfilePictureModal();
            }, 350);
        };

        function resetProfilePictureModal() {
            if (currentCropper) {
                currentCropper.destroy();
                currentCropper = null;
            }
            currentProfilePictureFile = null;
            document.getElementById('pp-file-input').value = '';

            document.getElementById('pp-cropper-container').classList.add('hidden');
            document.getElementById('pp-current-view').classList.remove('hidden');

            document.getElementById('pp-btn-select').classList.remove('hidden');
            document.getElementById('pp-btn-crop').classList.add('hidden');
            document.getElementById('pp-btn-cancel-crop').classList.add('hidden');
            document.getElementById('pp-btn-delete').classList.remove('hidden');

            const profileUrl = window.authState.profile?.profile_url;
            if (!profileUrl) {
                document.getElementById('pp-btn-delete').classList.add('hidden');
            }
        }

        function updateProfilePictureModalView() {
            const avatarContainer = document.getElementById('pp-current-avatar');
            const profileUrl = window.authState.profile?.profile_url;

            if (profileUrl) {
                avatarContainer.innerHTML = `<img src="${profileUrl}" class="w-full h-full object-cover">`;
            } else {
                const name = window.authState.profile?.full_name || 'User';
                const initial = name.charAt(0).toUpperCase();
                avatarContainer.innerHTML = initial;
            }
        }

        window.cancelCrop = function () {
            resetProfilePictureModal();
            updateProfilePictureModalView();
        };

        document.getElementById('pp-file-input')?.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!validMimes.includes(file.type)) {
                window.showGlobalToast("Error", "Only JPG, PNG, and WEBP image files are allowed.");
                return;
            }

            const reader = new FileReader();
            reader.onload = function (event) {
                const imgEl = document.getElementById('pp-cropper-image');
                imgEl.src = event.target.result;

                document.getElementById('pp-current-view').classList.add('hidden');
                document.getElementById('pp-cropper-container').classList.remove('hidden');

                document.getElementById('pp-btn-select').classList.add('hidden');
                document.getElementById('pp-btn-delete').classList.add('hidden');
                document.getElementById('pp-btn-crop').classList.remove('hidden');
                document.getElementById('pp-btn-cancel-crop').classList.remove('hidden');

                if (currentCropper) {
                    currentCropper.destroy();
                }

                currentCropper = new Cropper(imgEl, {
                    aspectRatio: 1,
                    viewMode: 1,
                    autoCropArea: 1,
                });
            };
            reader.readAsDataURL(file);
        });

        window.handleCropAndUpload = async function () {
            if (!currentCropper || !window.authState.user) return;

            window.showLoader(true, "Uploading profile picture...");
            try {
                const canvas = currentCropper.getCroppedCanvas({
                    width: 400,
                    height: 400
                });

                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        window.showLoader(false);
                        window.showGlobalToast("Error", "Failed to crop image (canvas returned null).");
                        return;
                    }
                    if (blob.size > 2 * 1024 * 1024) {
                        window.showLoader(false);
                        window.showGlobalToast("Error", "Image is too large. Cropped file must be under 2MB.");
                        return;
                    }

                    try {
                        const fileName = `${window.authState.user.id}_${Date.now()}.jpg`;

                        if (window.authState.profile?.profile_url) {
                            try {
                                const match = window.authState.profile.profile_url.match(/\/(users_pp|avatars)\/(.+)$/);
                                if (match) {
                                    const oldBucket = match[1];
                                    const oldFileName = match[2];
                                    await _supabase.storage.from(oldBucket).remove([oldFileName]);
                                    console.log("[PROFILE IMAGE] Deleted old image:", oldFileName);
                                }
                            } catch (e) {
                                console.warn("[PROFILE IMAGE] Failed to delete old image:", e);
                            }
                        }

                        const { data: uploadData, error: uploadError } = await _supabase.storage
                            .from('users_pp')
                            .upload(fileName, blob, {
                                contentType: 'image/jpeg',
                                upsert: true
                            });

                        if (uploadError) throw uploadError;

                        const { data: urlData } = _supabase.storage.from('users_pp').getPublicUrl(fileName);
                        const publicUrl = urlData.publicUrl;
                        console.log("[PROFILE IMAGE] Uploaded new image:", publicUrl);

                        const { error: dbError } = await _supabase
                            .from('profiles')
                            .update({ profile_url: publicUrl })
                            .eq('id', window.authState.user.id);

                        if (dbError) throw dbError;

                        if (window.authState.profile) {
                            window.authState.profile.profile_url = publicUrl;
                        }

                        updateGlobalAvatars();
                        closeProfilePictureModal();
                        window.showGlobalToast("Success", "Profile picture updated successfully.");

                    } catch (err) {
                        console.error("[PROFILE IMAGE] UPLOAD ERROR:", err);
                        window.showGlobalToast("Error", "Failed to upload profile picture.");
                    } finally {
                        window.showLoader(false);
                    }
                }, 'image/jpeg', 0.85);

            } catch (err) {
                window.showLoader(false);
                console.error("[CROP ERROR]", err);
                window.showGlobalToast("Error", "Failed to crop image.");
            }
        };

        window.handleDeleteProfilePicture = async function () {
            const profileUrl = window.authState.profile?.profile_url;
            if (!profileUrl) return;
            if (!confirm("Are you sure you want to remove your profile picture?")) return;

            window.showLoader(true, "Removing profile picture...");
            try {
                const fileNameMatch = profileUrl.match(/\/(users_pp|avatars)\/(.+)$/);

                if (fileNameMatch) {
                    const bucket = fileNameMatch[1];
                    const fileName = fileNameMatch[2];
                    await _supabase.storage.from(bucket).remove([fileName]);
                }

                await _supabase
                    .from('profiles')
                    .update({ profile_url: null })
                    .eq('id', window.authState.user.id);

                if (window.authState.profile) {
                    window.authState.profile.profile_url = null;
                }

                updateGlobalAvatars();
                closeProfilePictureModal();
                window.showGlobalToast("Success", "Profile picture removed.");

            } catch (err) {
                console.error("[PROFILE PIC DELETE ERROR]", err);
                window.showGlobalToast("Error", "Failed to remove profile picture.");
            } finally {
                window.showLoader(false);
            }
        };

        window.updateGlobalAvatars = function () {
            const containers = document.querySelectorAll('.global-user-avatar-container');
            const profileUrl = window.authState.profile?.profile_url;
            const name = window.authState.profile?.full_name || 'User';
            const initial = name.charAt(0).toUpperCase();

            containers.forEach(container => {
                if (profileUrl) {
                    const safeUrl = window.sanitizeUrl(profileUrl);
                    container.innerHTML = `<img src="${safeUrl}" class="w-full h-full rounded-full object-cover" onerror="this.outerHTML='<span class=\\'font-bold text-[18px] text-[#4226E9]\\'>${initial}</span>'">`;
                } else {
                    container.innerHTML = `<span class="font-bold text-[18px] text-[#4226E9]">${initial}</span>`;
                }
            });

            // Sync main profile screen details
            if (typeof window.populateProfileDetails === 'function') {
                populateProfileDetails();
            }

            // Re-render student lists if they are open
            if (typeof window.isScreenActive === 'function' && window.isScreenActive('screen-admin-students') && typeof window.renderAdminStudents === 'function') {
                window.renderAdminStudents();
            }
        };




        function openPhoneEditModal() {
            const modal = document.getElementById('modal-phone-edit');
            const content = document.getElementById('modal-phone-edit-content');
            const phoneStr = (window.authState.profile && window.authState.profile.phone_number) || '';
            document.getElementById('edit-phone-input').value = phoneStr;
            document.getElementById('edit-phone-error').classList.add('hidden');
            
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('translate-y-full');
            }, 10);
        }



        function closePhoneEditModal() {
            const modal = document.getElementById('modal-phone-edit');
            const content = document.getElementById('modal-phone-edit-content');
            modal.classList.add('opacity-0');
            content.classList.add('translate-y-full');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }



        export async function savePhoneEdit() {
            const phoneInput = document.getElementById('edit-phone-input');
            const phone = phoneInput.value.trim();
            const errorText = document.getElementById('edit-phone-error');
            
            if (!/^01\d{9}$/.test(phone)) {
                errorText.classList.remove('hidden');
                return;
            }
            errorText.classList.add('hidden');
            
            if (!window.authState.user) return;
            
            if (typeof window.showLoader === 'function') window.showLoader(true, "Updating profile...");
            try {
                const { error } = await _supabase.from('profiles').update({ phone_number: phone }).eq('id', window.authState.user.id);
                if (error) throw error;
                
                if (window.authState.profile) window.authState.profile.phone_number = phone;
                document.getElementById('profile-user-phone').innerText = phone;
                
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Success", "Phone number updated successfully!");
                closePhoneEditModal();
            } catch (err) {
                console.error("[PROFILE] Error updating phone:", err);
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Error", "Could not update phone number.");
            } finally {
                if (typeof window.showLoader === 'function') window.showLoader(false);
            }
        }
















export const ProfileService = {
    populateProfileDetails: typeof populateProfileDetails !== 'undefined' ? populateProfileDetails : window.populateProfileDetails,
    openProfilePictureModal: typeof openProfilePictureModal !== 'undefined' ? openProfilePictureModal : window.openProfilePictureModal,
    closeProfilePictureModal: typeof closeProfilePictureModal !== 'undefined' ? closeProfilePictureModal : window.closeProfilePictureModal,
    resetProfilePictureModal: typeof resetProfilePictureModal !== 'undefined' ? resetProfilePictureModal : window.resetProfilePictureModal,
    updateProfilePictureModalView: typeof updateProfilePictureModalView !== 'undefined' ? updateProfilePictureModalView : window.updateProfilePictureModalView,
    cancelCrop: typeof cancelCrop !== 'undefined' ? cancelCrop : window.cancelCrop,
    handleCropAndUpload: typeof handleCropAndUpload !== 'undefined' ? handleCropAndUpload : window.handleCropAndUpload,
    handleDeleteProfilePicture: typeof handleDeleteProfilePicture !== 'undefined' ? handleDeleteProfilePicture : window.handleDeleteProfilePicture,
    updateGlobalAvatars: typeof updateGlobalAvatars !== 'undefined' ? updateGlobalAvatars : window.updateGlobalAvatars,
    openPhoneEditModal: typeof openPhoneEditModal !== 'undefined' ? openPhoneEditModal : window.openPhoneEditModal,
    closePhoneEditModal: typeof closePhoneEditModal !== 'undefined' ? closePhoneEditModal : window.closePhoneEditModal,
    savePhoneEdit: typeof savePhoneEdit !== 'undefined' ? savePhoneEdit : window.savePhoneEdit
};
console.log("[ARCHITECTURE]\nprofile loaded");
