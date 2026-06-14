const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const fields = [
    'add-routine-batch', 'add-routine-day', 'add-routine-time', 'add-routine-course', 'add-routine-faculty', 'add-routine-room',
    'edit-routine-batch', 'edit-routine-day', 'edit-routine-time', 'edit-routine-course', 'edit-routine-faculty', 'edit-routine-room'
];

for (const id of fields) {
    const regex = new RegExp(`(id="${id}"(?:[^>]*?))\\s+required\\b`, 'g');
    html = html.replace(regex, '$1');
}

fs.writeFileSync('index.html', html);
console.log('Removed required attributes');
