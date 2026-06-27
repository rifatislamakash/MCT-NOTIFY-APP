// js/services/NotificationFormatter.js

/**
 * A generic, UI-agnostic formatter for notification titles and messages.
 * This keeps the queue service decoupled from specific content formatting rules.
 */
export const NotificationFormatter = {
    formatNotice: function(title, message) {
        return {
            title: title || 'MCT Notice Update',
            message: message || 'Check the app for details.'
        };
    },

    formatSchedule: function(courseName, message) {
        return {
            title: courseName ? `Schedule Update: ${courseName}` : 'Schedule Update',
            message: message || 'A new schedule update is available.'
        };
    },

    formatMaterial: function(courseName, title) {
        return {
            title: 'New Material Added',
            message: `A new material '${title}' was uploaded.`
        };
    },

    formatPoll: function(title) {
        return {
            title: 'New Poll Created',
            message: title || 'A new poll requires your attention.'
        };
    },

    formatGroup: function(title) {
        return {
            title: 'New Group Link',
            message: `A new group link '${title}' was added.`
        };
    },

    formatExam: function(courseName, date, time) {
        return {
            title: `📝 Exam: '${courseName || 'Course'}'`,
            message: `Upcoming Exam is '${courseName || 'Course'}' at ${date} ${time ? '& ' + time : ''}. Open the app to see the syllabus.`
        };
    },
    
    // Generic fallback
    formatGeneric: function(title, message) {
        return {
            title: title || 'MCT Update',
            message: message || 'New notification received.'
        };
    }
};
