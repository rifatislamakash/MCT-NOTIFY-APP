const fs = require('fs');
const files = ['index.html', 'js/auth.js', 'js/main.js'];
files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8').split('\n');
  c.forEach((l, i) => {
    if(l.toLowerCase().includes('confirm your email') || l.toLowerCase().includes('check your inbox')) {
      console.log(f + ':' + (i+1) + ': ' + l.trim());
    }
  });
});
