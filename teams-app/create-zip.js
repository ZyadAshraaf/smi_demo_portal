const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const manifestDir = path.join(__dirname, 'manifest');
const zipPath = path.join(__dirname, 'unified-workspace-teams.zip');

// Remove old zip if exists
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// Use PowerShell to create the zip
const files = ['manifest.json', 'color.png', 'outline.png']
  .map(f => path.join(manifestDir, f).replace(/\//g, '\\'))
  .map(f => `'${f}'`)
  .join(',');

const dest = zipPath.replace(/\//g, '\\');
const cmd = `powershell -Command "Compress-Archive -Path ${files} -DestinationPath '${dest}'"`;

execSync(cmd);

const stats = fs.statSync(zipPath);
console.log('Created:', zipPath);
console.log('Size:', stats.size, 'bytes');
