// Script to deploy to both Dualgi 3D and Solution platforms sequentially.
// First deploys Solution, then Dualgi 3D.
// It automatically updates .env.local variables, builds the application, and deploys to Firebase.
// Only builds and deploys modified resources (Firestore rules, Cloud Functions, or Hosting/assets)
// unless `--force` or `--all` is specified.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const envFilePath = path.join(rootDir, '.env.local');

const DUALGI_CONFIG = {
  projectId: 'dualgi3de',
  hostingUrl: 'https://dualgi3de.web.app',
  envText: `VITE_FIREBASE_API_KEY=AIzaSyDhSZUTwx7-TQ0cxrxsQO4_RYKdMo9ppC8
VITE_FIREBASE_AUTH_DOMAIN=dualgi3de.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dualgi3de
VITE_FIREBASE_STORAGE_BUCKET=dualgi3de.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=756959344919
VITE_FIREBASE_APP_ID=1:756959344919:web:968cc4b3092191444d9f52
VITE_FIREBASE_VAPID_KEY=BJZsOEW6D3QI0uflC-mbD2HjlD2hhKdDHDNnbQkPJXyx0gEbUppeSSKtT67ijmzFMAs6laNC19uDXd5n7zCI_eE`,
};

const SOLUTION_CONFIG = {
  projectId: 'solution-3d',
  hostingUrl: 'https://solution-3d.web.app',
  envText: `VITE_FIREBASE_API_KEY=AIzaSyAvDeGu9jbA-A72evVUT2wP8a4MbOpwcII
VITE_FIREBASE_AUTH_DOMAIN=solution-3d.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=solution-3d
VITE_FIREBASE_STORAGE_BUCKET=solution-3d.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=86569253623
VITE_FIREBASE_APP_ID=1:86569253623:web:52e051771a39cf18b7f1f2
VITE_FIREBASE_VAPID_KEY=BD5uadfHdJuGWxzpUAdolXOjuOVdPKHAwB6ejEiycrb9l1xCTUKk-58LOsBLmeEbLyQxVqS7WxtsOLZgHHsGWjU`,
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

const hasFunctionsChanges = forceAll || modifiedFiles.some(file => file.startsWith('functions/'));
const hasFirestoreChanges = forceAll || modifiedFiles.some(file => file.includes('firestore.rules') || file.includes('firestore.indexes.json'));
const hasHostingChanges = forceAll || modifiedFiles.some(file => 
  file.startsWith('src/') || 
  file.startsWith('public/') || 
  file.includes('index.html') || 
  file.includes('package.json') || 
  file.includes('vite.config.ts') || 
  file.includes('.env')
);

const changes = { hasFunctionsChanges, hasFirestoreChanges, hasHostingChanges };

console.log('======================================================');
console.log('DEPLOY CONFIGURATION ANALYSIS:');
console.log(`- Force All: ${forceAll}`);
console.log(`- Deploy Functions: ${hasFunctionsChanges}`);
console.log(`- Deploy Firestore Rules: ${hasFirestoreChanges}`);
console.log(`- Deploy Hosting (Client App): ${hasHostingChanges}`);
console.log('======================================================');

function deployTo(targetName, config, changes) {
  const { hasFunctionsChanges, hasFirestoreChanges, hasHostingChanges } = changes;

  console.log(`\n======================================================`);
  console.log(`STARTING DEPLOY TO: ${targetName.toUpperCase()} (${config.projectId})`);
  console.log(`======================================================`);

  if (hasHostingChanges) {
    console.log(`Writing .env.local for ${targetName}...`);
    fs.writeFileSync(envFilePath, config.envText + '\n', 'utf8');

    console.log(`Generating Service Worker with Firebase config...`);
    execSync('node scripts/generate-fcm-sw.mjs', { stdio: 'inherit' });

    console.log(`Compiling and building production assets...`);
    execSync('npm run build', { stdio: 'inherit' });
  } else {
    console.log(`No hosting changes detected. Skipping asset building for ${targetName}.`);
  }

  if (hasFunctionsChanges) {
    console.log(`Building Cloud Functions...`);
    execSync('npm run build', { cwd: path.join(rootDir, 'functions'), stdio: 'inherit' });
  } else {
    console.log(`No functions changes detected. Skipping cloud functions building for ${targetName}.`);
  }

  console.log(`Switching Firebase CLI to use project: ${config.projectId}...`);
  execSync(`npx firebase use ${config.projectId}`, { stdio: 'inherit' });

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
    console.log(`Nothing to deploy for ${targetName}. Skipping firebase deploy.`);
    return;
  }

  console.log(`Deploying ${targets.join(', ')}...`);
  execSync(
    `npx firebase deploy --only ${targets.join(',')} --force`,
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        HOSTING_URL: config.hostingUrl,
        GCLOUD_PROJECT: config.projectId,
        GCP_PROJECT: config.projectId,
      },
    }
  );

  console.log(`\n🎉 Success! Deployed to ${targetName}.`);
}

try {
  // First compile/deploy Solution, then Dualgi 3D
  deployTo('Solution', SOLUTION_CONFIG, changes);
  deployTo('Dualgi 3D', DUALGI_CONFIG, changes);

  console.log(`\n======================================================`);
  console.log(`✅ ALL DEPLOYS COMPLETED SUCCESSFULLY!`);
  console.log(`======================================================`);
  console.log(`\nIMPORTANTE: Registrá las claves VAPID en cada proyecto Firebase:`);
  console.log(`Console → Project Settings → Cloud Messaging → Web Push certificates`);
  console.log(`Dualgi 3D:  BJZsOEW6D3QI0uflC-mbD2HjlD2hhKdDHDNnbQkPJXyx0gEbUppeSSKtT67ijmzFMAs6laNC19uDXd5n7zCI_eE`);
  console.log(`Solution 3D: BD5uadfHdJuGWxzpUAdolXOjuOVdPKHAwB6ejEiycrb9l1xCTUKk-58LOsBLmeEbLyQxVqS7WxtsOLZgHHsGWjU`);
} catch (error) {
  console.error(`\n❌ Deployment failed:`, error.message);
  process.exit(1);
}
