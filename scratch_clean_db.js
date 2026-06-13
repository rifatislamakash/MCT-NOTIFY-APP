import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ngropmfrneaaejwocnbf.supabase.co';
const supabaseKey = 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-';
const supabase = createClient(supabaseUrl, supabaseKey);

// Same parsing logic as window.parseSectionsName
function parseSectionsName(sectionsName) {
    if (!sectionsName) return [];
    let sectionsArray = [];
    try {
        if (typeof sectionsName === 'string') {
            const parsed = JSON.parse(sectionsName);
            if (Array.isArray(parsed)) {
                sectionsArray = parsed;
            } else {
                sectionsArray = sectionsName.split(',').map(s => s.trim()).filter(s => s);
            }
        } else if (Array.isArray(sectionsName)) {
            sectionsArray = sectionsName;
        } else {
            sectionsArray = [String(sectionsName)];
        }
    } catch(e) {
        sectionsArray = String(sectionsName).split(',').map(s => s.trim()).filter(s => s);
    }
    return sectionsArray.map(sec => {
        if (typeof sec === 'string') {
            return sec.replace(/[\[\]"]/g, '').trim();
        }
        return String(sec).trim();
    }).filter(Boolean);
}

async function main() {
    console.log("Fetching all user courses...");
    const { data: userCourses, error } = await supabase
        .from('user_courses')
        .select('*');

    if (error) {
        console.error("Error fetching user courses:", error);
        return;
    }

    console.log(`Found ${userCourses.length} user course enrollments.`);

    // 1. Detect duplicates and clean up malformed section names
    const uniqueMap = new Map(); // key: user_id + '|' + course_id
    const toDelete = [];
    const toUpdate = [];

    for (const record of userCourses) {
        const key = `${record.user_id}|${record.course_id}`;
        
        // Parse section name to clean array
        const parsed = parseSectionsName(record.section_name);
        const cleanSectionStr = parsed.length > 0 ? JSON.stringify(parsed) : null;

        if (uniqueMap.has(key)) {
            // Duplicate found! Keep the one that has a section or the first one
            const existing = uniqueMap.get(key);
            if (!existing.section_name && cleanSectionStr) {
                // The new one has a section, delete the existing one instead
                toDelete.push(existing.id);
                uniqueMap.set(key, { id: record.id, section_name: cleanSectionStr });
            } else {
                // Delete this duplicate
                toDelete.push(record.id);
            }
        } else {
            uniqueMap.set(key, { id: record.id, section_name: cleanSectionStr });
        }

        // If not duplicate, check if update is needed
        if (!toDelete.includes(record.id)) {
            // If the section_name in DB is different from cleanSectionStr, update it
            if (record.section_name !== cleanSectionStr) {
                toUpdate.push({ id: record.id, section_name: cleanSectionStr });
            }
        }
    }

    console.log(`Deleting ${toDelete.length} duplicate records...`);
    for (const id of toDelete) {
        const { error: delErr } = await supabase
            .from('user_courses')
            .delete()
            .eq('id', id);
        if (delErr) {
            console.error(`Failed to delete record ${id}:`, delErr.message);
        } else {
            console.log(`Deleted duplicate row ID: ${id}`);
        }
    }

    console.log(`Updating ${toUpdate.length} records with cleaned section names...`);
    for (const item of toUpdate) {
        const { error: upErr } = await supabase
            .from('user_courses')
            .update({ section_name: item.section_name })
            .eq('id', item.id);
        if (upErr) {
            console.error(`Failed to update record ${item.id}:`, upErr.message);
        } else {
            console.log(`Updated row ID: ${item.id} -> ${item.section_name}`);
        }
    }

    console.log("Cleanup finished successfully!");
}

main().catch(console.error);
