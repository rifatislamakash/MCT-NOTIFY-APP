const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('id="screen-')) {
    console.log(i + ': ' + l.trim());
  }
});
