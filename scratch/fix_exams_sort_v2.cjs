const fs = require('fs');
let js = fs.readFileSync('js/routines.js', 'utf8');

const target1 = `                exams.forEach(exam => {
                     let isPast = exam._isPast;
                     exam._isPast = isPast;
                });`;

const replace1 = `                exams.forEach(exam => {
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
                });`;

js = js.replace(target1, replace1);

const target2 = `                     let isPast = false;
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

const replace2 = `                     let isPast = exam._isPast;`;

js = js.replace(target2, replace2);

fs.writeFileSync('js/routines.js', js);
console.log('Fixed exams.sort logic in routines.js');
