// Script to deploy to Solution 3D.
// It automatically updates .env.local variables, builds the application, and deploys to Firebase.
// Only builds and deploys modified resources (Firestore rules, Cloud Functions, or Hosting/assets)
// unless `--force` or `--all` is specified.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const envFilePath = path.join(rootDir, '.env.local');

const CONFIG = {
  projectId: 'solution-3d',
  hostingUrl: 'https://solution-3d.web.app',
  envText: `VITE_FIREBASE_API_KEY=AIzaSyAvDeGu9jbA-A72evVUT2wP8a4MbOpwcII
VITE_FIREBASE_AUTH_DOMAIN=solution-3d.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=solution-3d
VITE_FIREBASE_STORAGE_BUCKET=solution-3d.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=86569253623
VITE_FIREBASE_APP_ID=1:86569253623:web:52e051771a39cf18b7f1f2
VITE_FIREBASE_VAPID_KEY=BD5uadfHdJuGWxzpUAdolXOjuOVdPKHAwB6ejEiycrb9l1xCTUKk-58LOsBLmeEbLyQxVqS7WxtsOLZgHHsGWjU
VITE_BUSINESS_NAME=Solution 3D`,
};

// 1. Detect modified files to only deploy what's changed
let modifiedFiles = [];
let isGit = false;
try {
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' })
    .split('\n')
    .map(line => {
      if (line.length > 3) return line.substring(3).trim();
      return '';
    })
    .filter(Boolean);

  const lastCommit = execSync('git log -1 --name-only --pretty=format:', { encoding: 'utf8' })
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  modifiedFiles = Array.from(new Set([...gitStatus, ...lastCommit]));
  isGit = true;
} catch (e) {
  console.log('Warning: Git not available. Will deploy all components by default.');
}

const forceAll = process.argv.includes('--force') || process.argv.includes('--all') || !isGit;

const hasFunctionsChanges = false; // Desactivado temporalmente para plan Spark
const hasFirestoreChanges = forceAll || modifiedFiles.some(file => file.includes('firestore.rules') || file.includes('firestore.indexes.json'));
const hasHostingChanges = forceAll || modifiedFiles.some(file => 
  file.startsWith('src/') || 
  file.startsWith('public/') || 
  file.includes('index.html') || 
  file.includes('package.json') || 
  file.includes('vite.config.ts') || 
  file.includes('.env')
);

console.log('======================================================');
console.log('DEPLOY CONFIGURATION ANALYSIS:');
console.log(`- Force All: ${forceAll}`);
console.log(`- Deploy Functions: ${hasFunctionsChanges}`);
console.log(`- Deploy Firestore Rules: ${hasFirestoreChanges}`);
console.log(`- Deploy Hosting (Client App): ${hasHostingChanges}`);
console.log('======================================================');

try {
  console.log(`\n======================================================`);
  console.log(`STARTING DEPLOY TO: SOLUTION 3D (${CONFIG.projectId})`);
  console.log(`======================================================`);

  if (hasHostingChanges) {
    console.log(`Writing .env.local for Solution 3D...`);
    fs.writeFileSync(envFilePath, CONFIG.envText + '\n', 'utf8');

    console.log(`Generating Service Worker with Firebase config...`);
    execSync('node scripts/generate-fcm-sw.mjs', { stdio: 'inherit' });

    console.log(`Compiling and building production assets...`);
    execSync('npm run build', { stdio: 'inherit' });
  } else {
    console.log(`No hosting changes detected. Skipping asset building.`);
  }

  if (hasFunctionsChanges) {
    console.log(`Building Cloud Functions...`);
    execSync('npm run build', { cwd: path.join(rootDir, 'functions'), stdio: 'inherit' });
  } else {
    console.log(`No functions changes detected. Skipping cloud functions building.`);
  }

  console.log(`Switching Firebase CLI to use project: ${CONFIG.projectId}...`);
  execSync(`npx firebase use ${CONFIG.projectId}`, { stdio: 'inherit' });

  const targets = [];
  if (hasFirestoreChanges) {
    targets.push('firestore');
  }
  if (hasFunctionsChanges) {
    // Deploying all functions is safer and handles all exports
    targets.push('functions');
  }
  if (hasHostingChanges) {
    targets.push('hosting');
  }

  if (targets.length === 0) {
    console.log(`Nothing to deploy. Skipping firebase deploy.`);
  } else {
    console.log(`Deploying ${targets.join(', ')}...`);
    execSync(
      `npx firebase deploy --only ${targets.join(',')} --force`,
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          HOSTING_URL: CONFIG.hostingUrl,
          GCLOUD_PROJECT: CONFIG.projectId,
          GCP_PROJECT: CONFIG.projectId,
        },
      }
    );

    console.log(`\n🎉 Success! Deployed to Solution 3D.`);
  }

  console.log(`\n======================================================`);
  console.log(`✅ DEPLOY COMPLETED SUCCESSFULLY!`);
  console.log(`======================================================`);
  console.log(`\nIMPORTANTE: Registrá las claves VAPID en cada proyecto Firebase:`);
  console.log(`Console → Project Settings → Cloud Messaging → Web Push certificates`);
  console.log(`Solution 3D: BD5uadfHdJuGWxzpUAdolXOjuOVdPKHAwB6ejEiycrb9l1xCTUKk-58LOsBLmeEbLyQxVqS7WxtsOLZgHHsGWjU`);
} catch (error) {
  console.error(`\n❌ Deployment failed:`, error.message);
  process.exit(1);
}
