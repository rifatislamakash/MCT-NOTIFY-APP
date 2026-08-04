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

    formatSchedule: function(title, message) {
        return {
            title: title || 'Schedule Update',
            message: message || 'A new schedule update is available.'
        };
    },

    formatMaterial: function(title, message, courseName) {
        return {
            title: title || (courseName ? `Material: ${courseName}` : 'New Material Added'),
            message: message || 'A new material was uploaded.'
        };
    },

    formatPoll: function(title, message) {
        return {
            title: title || 'New Poll Created',
            message: message || 'A new poll requires your attention.'
        };
    },

    formatGroup: function(title, message) {
        return {
            title: title || 'New Group Link',
            message: message || 'A new group link was added.'
        };
    },

    formatExam: function(title, message, date, time) {
        return {
            title: title || '📝 Upcoming Exam',
            message: message || `Upcoming Exam on ${date} ${time ? '& ' + time : ''}. Open the app to see details.`
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
