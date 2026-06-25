// Phase 11: Bridge Migration Entry Point


import { _supabase } from './js/supabase-client.js';
import { batchService } from './js/services/batchService.js';
import { crPermissionService } from './js/services/crPermissionService.js';

window.crPermissionService = crPermissionService;
window._supabase = _supabase;

import { showGlobalToast, dismissGlobalToast, showLoader, forceHideLoader, deduplicateRequest, fetchCachedOrDeduplicated, cancelActiveRequest, cancelAllActiveRequests, fetchWithRetry, ensureBucketExists, extractIdFromEmail, getGreeting, showNotificationToast } from './js/utils.js';
window.showGlobalToast = showGlobalToast;
window.showNotificationToast = showNotificationToast;
window.dismissGlobalToast = dismissGlobalToast;
window.showLoader = showLoader;
window.forceHideLoader = forceHideLoader;
window.deduplicateRequest = deduplicateRequest;
window.fetchCachedOrDeduplicated = fetchCachedOrDeduplicated;
window.cancelActiveRequest = cancelActiveRequest;
window.cancelAllActiveRequests = cancelAllActiveRequests;
window.fetchWithRetry = fetchWithRetry;
window.ensureBucketExists = ensureBucketExists;
window.extractIdFromEmail = extractIdFromEmail;
window.getGreeting = getGreeting;

import { fetchUserProfile, handleUserRouting, checkActiveSession, handleConfirmOTP, handleLogin, handleRegister, logout, handleForgot, handleRecoveryOtp, handleUpdatePassword } from './js/auth.js';
window.fetchUserProfile = fetchUserProfile;
window.handleUserRouting = handleUserRouting;
window.checkActiveSession = checkActiveSession;
window.handleConfirmOTP = handleConfirmOTP;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleForgot = handleForgot;
window.handleRecoveryOtp = handleRecoveryOtp;
window.handleUpdatePassword = handleUpdatePassword;

import { ReactionService, AuthorService } from './js/services/ReactionService.js';
window.ReactionService = ReactionService;
window.AuthorService = AuthorService;
window.logout = logout;

import { AuthService } from './js/auth.js';
window.AuthService = AuthService;

import { populateProfileDetails, savePhoneEdit } from './js/profile.js';
window.populateProfileDetails = populateProfileDetails;
window.savePhoneEdit = savePhoneEdit;

import { ProfileService } from './js/profile.js';
window.ProfileService = ProfileService;
window.openProfilePictureModal = ProfileService.openProfilePictureModal;
window.closeProfilePictureModal = ProfileService.closeProfilePictureModal;
window.resetProfilePictureModal = ProfileService.resetProfilePictureModal;
window.updateProfilePictureModalView = ProfileService.updateProfilePictureModalView;
window.cancelCrop = ProfileService.cancelCrop;
window.handleCropAndUpload = ProfileService.handleCropAndUpload;
window.handleDeleteProfilePicture = ProfileService.handleDeleteProfilePicture;
window.updateGlobalAvatars = ProfileService.updateGlobalAvatars;
window.openPhoneEditModal = ProfileService.openPhoneEditModal;
window.closePhoneEditModal = ProfileService.closePhoneEditModal;

import { uploadFacultyImage, deleteFacultyImageFromStorage, loadFacultyList, loadFacultyDetails, updateFaculty, removeFaculty, fetchCourseList, loadCourseDropdown, loadCourseDropdownForDetails, handleAddFaculty } from './js/faculty.js';
window.uploadFacultyImage = uploadFacultyImage;
window.deleteFacultyImageFromStorage = deleteFacultyImageFromStorage;
window.loadFacultyList = loadFacultyList;
window.loadFacultyDetails = loadFacultyDetails;
window.updateFaculty = updateFaculty;
window.removeFaculty = removeFaculty;
window.fetchCourseList = fetchCourseList;
window.loadCourseDropdown = loadCourseDropdown;
window.loadCourseDropdownForDetails = loadCourseDropdownForDetails;
window.handleAddFaculty = handleAddFaculty;

import { FacultyService } from './js/faculty.js';
window.FacultyService = FacultyService;
window.handleFacultyListLogic = FacultyService.handleFacultyListLogic;
window.handleFacultyImageSelect = FacultyService.handleFacultyImageSelect;
window.clearFacultyImagePreview = FacultyService.clearFacultyImagePreview;
window.filterFacultyList = FacultyService.filterFacultyList;
window.renderFacultyList = FacultyService.renderFacultyList;
window.openFacultyDetails = FacultyService.openFacultyDetails;

import { MaterialsService } from './js/materials.js';
window.MaterialsService = MaterialsService;
window.loadMaterials = MaterialsService.loadMaterials;
window.filterMaterialsUI = MaterialsService.filterMaterialsUI;
window.renderMaterialsList = MaterialsService.renderMaterialsList;
window.openMaterialDetails = MaterialsService.openMaterialDetails;
window.checkUploadMaterialForm = MaterialsService.checkUploadMaterialForm;
window.checkUpdateMaterialForm = MaterialsService.checkUpdateMaterialForm;
window.loadUploadMaterialDropdowns = MaterialsService.loadUploadMaterialDropdowns;
window.handleMaterialFileChange = MaterialsService.handleMaterialFileChange;
window.clearMaterialFile = MaterialsService.clearMaterialFile;
window.handleUploadMaterial = MaterialsService.handleUploadMaterial;
window.openUpdateMaterial = MaterialsService.openUpdateMaterial;
window.handleUpdateMaterial = MaterialsService.handleUpdateMaterial;
window.deleteMaterialAction = MaterialsService.deleteMaterialAction;
window.deleteMaterialFromDetails = MaterialsService.deleteMaterialFromDetails;

import { NoticeService } from './js/notices.js';
window.NoticeService = NoticeService;
window.loadNotices = NoticeService.loadNotices;
window.openCreateNotice = NoticeService.openCreateNotice;
window.handleSaveNotice = NoticeService.handleSaveNotice;
window.openNoticeDetails = NoticeService.openNoticeDetails;
window.openEditNotice = NoticeService.openEditNotice;
window.deleteNoticeAction = NoticeService.deleteNoticeAction;
window._urgentNoticeForPopup = NoticeService._urgentNoticeForPopup;
window.renderNoticesList = NoticeService.renderNoticesList;
window.injectDashboardNotices = NoticeService.injectDashboardNotices;
window.setNoticeFilter = NoticeService.setNoticeFilter;
window.filterNotices = NoticeService.filterNotices;
window.toggleNoticeAudience = NoticeService.toggleNoticeAudience;
window.togglePublishDate = NoticeService.togglePublishDate;
window.onNoticeFileSelected = NoticeService.onNoticeFileSelected;
window.clearNoticeFile = NoticeService.clearNoticeFile;


import { ScheduleService } from './js/schedules.js';
window.ScheduleService = ScheduleService;
window.loadScheduleList = ScheduleService.loadScheduleList;
window.currentSchedulesList = ScheduleService.currentSchedulesList;
window.filterSchedulesUI = ScheduleService.filterSchedulesUI;
window.openScheduleDetails = ScheduleService.openScheduleDetails;
window.openCreateSchedule = ScheduleService.openCreateSchedule;
window.onCourseCheckboxChange = ScheduleService.onCourseCheckboxChange;
window.selectAudienceType = ScheduleService.selectAudienceType;
window.onScheduleFileSelected = ScheduleService.onScheduleFileSelected;
window.clearScheduleFile = ScheduleService.clearScheduleFile;
window.handleCreateSchedule = ScheduleService.handleCreateSchedule;
window.openEditSchedule = ScheduleService.openEditSchedule;
window.selectEditAudienceType = ScheduleService.selectEditAudienceType;
window.onEditScheduleFileSelected = ScheduleService.onEditScheduleFileSelected;
window.clearEditScheduleFile = ScheduleService.clearEditScheduleFile;
window.clearEditAttachment = ScheduleService.clearEditAttachment;
window.handleUpdateSchedule = ScheduleService.handleUpdateSchedule;
window.handleDeleteSchedule = ScheduleService.handleDeleteSchedule;

import { fetchRoutineDependencies, loadWeeklyRoutine, renderDailyRoutineView, openAddRoutine, handleSaveRoutine, openRoutineDetails, handleUpdateRoutine, handleDeleteRoutine } from './js/routines.js?v=2';
window.fetchRoutineDependencies = fetchRoutineDependencies;
window.loadWeeklyRoutine = loadWeeklyRoutine;
window.renderDailyRoutineView = renderDailyRoutineView;
window.openAddRoutine = openAddRoutine;
window.handleSaveRoutine = handleSaveRoutine;
window.openRoutineDetails = openRoutineDetails;
window.handleUpdateRoutine = handleUpdateRoutine;
window.handleDeleteRoutine = handleDeleteRoutine;

import { RoutineService } from './js/routines.js?v=2';
window.RoutineService = RoutineService;
window.switchRoutineView = RoutineService.switchRoutineView;
window.getSmartDashboardDay = RoutineService.getSmartDashboardDay;
window.formatRoutineTime = RoutineService.formatRoutineTime;
window.getDayNameByIndex = RoutineService.getDayNameByIndex;
window.getTodayRoutineDayName = RoutineService.getTodayRoutineDayName;
window.getTomorrowRoutineDayName = RoutineService.getTomorrowRoutineDayName;
window.onRoutineCourseChange = RoutineService.onRoutineCourseChange;

import { loadDashboardTodayRoutine } from './js/dashboard.js?v=4';
window.loadDashboardTodayRoutine = loadDashboardTodayRoutine;

import { DashboardService } from './js/dashboard.js?v=4';
window.DashboardService = DashboardService;
window.updateDashboardGreetings = DashboardService.updateDashboardGreetings;
window.updateDashboardQuickAccessBadges = DashboardService.updateDashboardQuickAccessBadges;
window.goHome = DashboardService.goHome;
window.updateBottomNavHighlights = DashboardService.updateBottomNavHighlights;

window.simulateReload = DashboardService.simulateReload;

import { PollService } from './js/polls.js';
window.PollService = PollService;
window.loadPolls = PollService.loadPolls.bind(PollService);

import { ReportService } from './js/reports.js';
window.ReportService = ReportService;
window.loadMyReports = ReportService.loadMyReports.bind(ReportService);
window.loadAdminReports = ReportService.loadAdminReports.bind(ReportService);

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        console.log("[BFCACHE] Page loaded from back-forward cache. Force-hiding loader.");
        if (typeof window.forceHideLoader === 'function') {
            window.forceHideLoader();
        }
    }
});
