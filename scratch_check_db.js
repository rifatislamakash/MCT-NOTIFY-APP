import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ngropmfrneaaejwocnbf.supabase.co';
const supabaseKey = 'sb_publishable_re_AUBMShiJJq7tXgB3J9g_lRETY_K-';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching raw user courses...");
    const { data: userCourses, error: ucErr } = await supabase.from('user_courses').select('id, user_id, course_id, section_name');
    if (ucErr) {
        console.error(ucErr);
        return;
    }
    
    for (const uc of userCourses) {
        console.log(`Row ID: ${uc.id} | Course ID: ${uc.course_id} | Raw Section Name: ${JSON.stringify(uc.section_name)} | Type: ${typeof uc.section_name}`);
    }
}

main().catch(console.error);
