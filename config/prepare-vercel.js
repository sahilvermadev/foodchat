const fs = require('fs');
const path = require('path');

// 1. Prepare package.json
const packageJsonPath = path.resolve(__dirname, '../package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.workspaces) {
    // Filter out 'api' workspace
    packageJson.workspaces = packageJson.workspaces.filter(ws => ws !== 'api');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
    console.log('Successfully prepared package.json for Vercel (removed "api" workspace).');
  }
}

// 2. Prepare turbo.json
const turboJsonPath = path.resolve(__dirname, '../turbo.json');
if (fs.existsSync(turboJsonPath)) {
  const turboJson = JSON.parse(fs.readFileSync(turboJsonPath, 'utf8'));
  if (turboJson.tasks) {
    // Delete backend tasks to avoid Turborepo validation errors on missing packages
    delete turboJson.tasks['@librechat/data-schemas#build'];
    delete turboJson.tasks['@librechat/api#build'];
    fs.writeFileSync(turboJsonPath, JSON.stringify(turboJson, null, 2) + '\n', 'utf8');
    console.log('Successfully prepared turbo.json for Vercel (removed backend tasks).');
  }
}
