const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(src)) {
  fs.cpSync(src, __dirname, { recursive: true, force: true });
  console.log('Successfully synchronized compiled frontend/dist to root directory.');
}
