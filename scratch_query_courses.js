import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ngropmfrneaaejwocnbf.supabase.co';
const supabaseKey = 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching courses...");
    const { data: courses } = await supabase.from('courses').select('id, course_name, short_name');
    const courseMap = {};
    for (const c of courses) {
        courseMap[c.id] = c;
        console.log(`Course ID: ${c.id} | Name: ${c.course_name} | Short: ${c.short_name}`);
    }

    console.log("\nFetching user courses with section info...");
    const { data: userCourses } = await supabase.from('user_courses').select('id, user_id, course_id, section_name');
    
    // Group by user
    const userMap = {};
    for (const uc of userCourses) {
        if (!userMap[uc.user_id]) userMap[uc.user_id] = [];
        const c = courseMap[uc.course_id] || { course_name: 'Unknown' };
        userMap[uc.user_id].push({
            course_name: c.course_name,
            section_name: uc.section_name
        });
    }

    for (const [userId, enrollments] of Object.entries(userMap)) {
        console.log(`\nUser: ${userId}`);
        for (const e of enrollments) {
            console.log(` - ${e.course_name}: ${e.section_name}`);
        }
    }
}

main().catch(console.error);
