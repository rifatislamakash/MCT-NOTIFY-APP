const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Check CSS Comments
const start = html.indexOf('<style>');
const end = html.indexOf('</style>', start);
const css = html.substring(start, end);
const openCount = (css.match(/\/\*/g) || []).length;
const closeCount = (css.match(/\*\//g) || []).length;
console.log('/* count:', openCount, '*/ count:', closeCount);

// 2. Add missing </head> right before <body>
if (!html.includes('</head>')) {
    html = html.replace('<body ', '</head>\n<body ');
    fs.writeFileSync('index.html', html);
    console.log('Added missing </head>');
}
