// Script to deploy to both Dualgi 3D and Solution platforms sequentially.
// It automatically updates .env.local variables, builds the application, and deploys to Firebase.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const envFilePath = path.join(rootDir, '.env.local');

const DUALGI_CONFIG = {
  projectId: 'dualgi3de',
  envText: `VITE_FIREBASE_API_KEY="AIzaSyDhSZUTwx7-TQ0cxrxsQO4_RYKdMo9ppC8"
VITE_FIREBASE_AUTH_DOMAIN="dualgi3de.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="dualgi3de"
VITE_FIREBASE_STORAGE_BUCKET="dualgi3de.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="756959344919"
VITE_FIREBASE_APP_ID="1:756959344919:web:968cc4b3092191444d9f52"`
};

const SOLUTION_CONFIG = {
  projectId: 'solution-3d',
  envText: `VITE_FIREBASE_API_KEY="AIzaSyAvDeGu9jbA-A72evVUT2wP8a4MbOpwcII"
VITE_FIREBASE_AUTH_DOMAIN="solution-3d.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="solution-3d"
VITE_FIREBASE_STORAGE_BUCKET="solution-3d.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="86569253623"
VITE_FIREBASE_APP_ID="1:86569253623:web:52e051771a39cf18b7f1f2"`
};

function deployTo(targetName, config) {
  console.log(`\n======================================================`);
  console.log(`STARTING DEPLOY TO: ${targetName.toUpperCase()} (${config.projectId})`);
  console.log(`======================================================`);

  // 1. Write the target project .env.local file
  console.log(`Writing .env.local for ${targetName}...`);
  fs.writeFileSync(envFilePath, config.envText + '\n', 'utf8');

  // 2. Build the production assets
  console.log(`Compiling and building production assets...`);
  execSync('npm run build', { stdio: 'inherit' });

  // 3. Switch Firebase CLI target project
  console.log(`Switching Firebase CLI to use project: ${config.projectId}...`);
  execSync(`npx firebase use ${config.projectId}`, { stdio: 'inherit' });

  // 4. Deploy to Firebase
  console.log(`Deploying to Firebase Firestore and Hosting...`);
  execSync('npx firebase deploy --only firestore,hosting', { stdio: 'inherit' });

  console.log(`\n🎉 Success! Deployed to ${targetName}.`);
}

try {
  // Deploy to Dualgi 3D first
  deployTo('Dualgi 3D', DUALGI_CONFIG);

  // Deploy to Solution second
  deployTo('Solution', SOLUTION_CONFIG);

  console.log(`\n======================================================`);
  console.log(`✅ ALL DEPLOYS COMPLETED SUCCESSFULLY!`);
  console.log(`======================================================`);
} catch (error) {
  console.error(`\n❌ Deployment failed:`, error.message);
  process.exit(1);
}
