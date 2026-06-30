const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const matches = txt.match(/id="screen-[^"]+"[^>]*>/g) || [];
matches.forEach(m => {
    if(!m.includes('class="screen') && !m.includes("class='screen") && !m.includes('screen ')) {
        console.log('Missing .screen:', m);
    }
});
