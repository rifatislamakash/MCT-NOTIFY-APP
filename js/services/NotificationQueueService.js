// js/services/NotificationQueueService.js
import { NotificationFormatter } from './NotificationFormatter.js?v=rescue2';
import { _supabase } from '../supabase-client.js?v=rescue2';

/**
 * Universal Notification Queue Service
 * UI-agnostic service for inserting notifications into the `notification_reminders` table.
 */
export const NotificationQueueService = {
    /**
     * @param {Object} params
     * @param {string} params.parentType - The exact parent_type string to store in the DB (e.g., 'notice', 'schedule', 'exam', 'material', 'poll', 'group')
     * @param {string} [params.formatType] - Override formatting type if it differs from parentType (e.g., formatType: 'poll')
     * @param {string} params.parentId - The UUID of the created content
     * @param {boolean} params.isNotifyEnabled - Checkbox status from the UI
     * @param {string} params.createdBy - User ID of the creator
     * @param {string} [params.audienceType] - For logging purposes
     * 
     * Formatting params (pass what is available):
     * @param {string} [params.title]
     * @param {string} [params.message]
     * @param {string} [params.courseName]
     * @param {string} [params.date]
     * @param {string} [params.time]
     */
    queueNotification: async function(params) {
        const { 
            parentType, 
            formatType,
            parentId, 
            isNotifyEnabled, 
            createdBy, 
            audienceType,
            title, 
            message, 
            courseName, 
            date, 
            time 
        } = params;

        const startTime = performance.now();

        try {
            console.log(`[QUEUE START] Type: ${parentType} | ID: ${parentId}`);

            if (!isNotifyEnabled) {
                console.log(`[QUEUE VERIFIED] Parent: ${parentType} | ID: ${parentId} | Checkbox: false | Status: Skipped`);
                return { success: true, skipped: true };
            }

            if (!parentId) {
                const errMsg = "[QUEUE FAILED] Parent ID is missing. Cannot queue notification for null parent.";
                console.error(errMsg);
                return { success: false, error: new Error(errMsg) };
            }

            console.log(`[QUEUE VERIFIED] Checkbox enabled and Parent ID exists.`);

            // Strict Idempotency Check removed to allow push notifications even if custom reminders exist

            // Route to appropriate formatter
            let formatted;
            const typeToFormat = formatType || parentType;
            switch(typeToFormat) {
                case 'notice':
                    formatted = NotificationFormatter.formatNotice(title, message);
                    break;
                case 'schedule':
                    formatted = NotificationFormatter.formatSchedule(courseName, message);
                    break;
                case 'material':
                    formatted = NotificationFormatter.formatMaterial(courseName, title);
                    break;
                case 'poll':
                    formatted = NotificationFormatter.formatPoll(title);
                    break;
                case 'group':
                    formatted = NotificationFormatter.formatGroup(title);
                    break;
                case 'exam':
                case 'exam_schedules':
                    formatted = NotificationFormatter.formatExam(courseName, date, time);
                    break;
                default:
                    formatted = NotificationFormatter.formatGeneric(title, message);
            }

            const payload = {
                parent_type: parentType, // strict generic mapping per user request
                parent_id: parentId,
                reminder_title: formatted.title,
                reminder_message: formatted.message,
                created_by: createdBy,
                sent: false,
                reminder_time: new Date(Date.now() + 60000).toISOString()
            };

            console.log(`[QUEUE INSERT] Payload ready for ${parentType}`);

            const { data, error } = await _supabase.from('notification_reminders').insert([payload]);

            if (error) {
                console.error(`[QUEUE FAILED] Error inserting for ${parentType}:`, error);
                return { success: false, error };
            }

            const duration = (performance.now() - startTime).toFixed(2);
            console.log(`[QUEUE SUCCESS] Notification queued successfully for ${parentType} ${parentId}. Duration: ${duration}ms`);
            return { success: true, data };
        } catch (e) {
            const duration = (performance.now() - startTime).toFixed(2);
            console.error(`[QUEUE FAILED] Exception for ${parentType}:`, e, `Duration: ${duration}ms`);
            return { success: false, error: e };
        }
    }
};

