import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const envFilePath = path.join(rootDir, '.env.local');

const SOLUTION_CONFIG = {
  projectId: 'solution-3d',
  envText: `VITE_FIREBASE_API_KEY=AIzaSyAvDeGu9jbA-A72evVUT2wP8a4MbOpwcII
VITE_FIREBASE_AUTH_DOMAIN=solution-3d.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=solution-3d
VITE_FIREBASE_STORAGE_BUCKET=solution-3d.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=86569253623
VITE_FIREBASE_APP_ID=1:86569253623:web:52e051771a39cf18b7f1f2
VITE_FIREBASE_VAPID_KEY=BD5uadfHdJuGWxzpUAdolXOjuOVdPKHAwB6ejEiycrb9l1xCTUKk-58LOsBLmeEbLyQxVqS7WxtsOLZgHHsGWjU
VITE_BUSINESS_NAME=Solution 3D`
};

console.log('Writing .env.local with Solution 3D config...');
fs.writeFileSync(envFilePath, SOLUTION_CONFIG.envText + '\n', 'utf8');

console.log('Generating Service Worker with Firebase config...');
execSync('node scripts/generate-fcm-sw.mjs', { stdio: 'inherit' });

console.log('Compiling and building production assets for Solution 3D...');
execSync('tsc -b && vite build', { stdio: 'inherit' });

console.log(`\n🎉 Success! The compiled files in the 'dist' folder are now configured for Solution 3D.`);
console.log(`You can now upload the contents of the 'dist' folder to your Donweb hosting.`);
