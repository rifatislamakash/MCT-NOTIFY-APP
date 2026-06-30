const fs = require('fs');
let js = fs.readFileSync('js/routines.js', 'utf8');

const targetHtmlLoopStart = `                const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                
                exams.forEach(exam => {`;

const replacementLoopStart = `                const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                
                exams.forEach(exam => {
                     let isPast = false;
                     if (exam.exam_date < todayStr) {
                         isPast = true;
                     } else if (exam.exam_date === todayStr) {
                         if (exam.end_time) {
                             const [h, m] = exam.end_time.split(':').map(Number);
                             if ((h * 60 + m) <= currentTotalMinutes) {
                                 isPast = true;
                             }
                         } else if (exam.start_time) {
                             const [h, m] = exam.start_time.split(':').map(Number);
                             if ((h * 60 + m) <= currentTotalMinutes) {
                                 isPast = true;
                             }
                         }
                     }
                     exam._isPast = isPast;
                });

                exams.sort((a, b) => {
                    if (a._isPast !== b._isPast) {
                        return a._isPast ? 1 : -1;
                    }
                    // If both are past, show the most recent past exam first
                    if (a._isPast) {
                        return new Date(b.exam_date) - new Date(a.exam_date);
                    }
                    // If both are upcoming, show the nearest upcoming exam first (ascending)
                    return 0; // Already sorted ascending by Supabase
                });

                exams.forEach(exam => {`;

js = js.replace(targetHtmlLoopStart, replacementLoopStart);

// Now inside the main HTML loop, replace the old isPast logic with exam._isPast
const oldIsPastLogic = `                     let isPast = false;
                     if (exam.exam_date < todayStr) {
                         isPast = true;
                     } else if (exam.exam_date === todayStr) {
                         if (exam.end_time) {
                             const [h, m] = exam.end_time.split(':').map(Number);
                             if ((h * 60 + m) <= currentTotalMinutes) {
                                 isPast = true;
                             }
                         } else if (exam.start_time) {
                             const [h, m] = exam.start_time.split(':').map(Number);
                             if ((h * 60 + m) <= currentTotalMinutes) {
                                 isPast = true;
                             }
                         }
                     }`;

const newIsPastLogic = `                     let isPast = exam._isPast;`;

js = js.replace(oldIsPastLogic, newIsPastLogic);

fs.writeFileSync('js/routines.js', js);
console.log("Exams sorting fixed!");
