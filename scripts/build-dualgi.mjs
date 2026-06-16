import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const envFilePath = path.join(rootDir, '.env.local');

const DUALGI_CONFIG = {
  projectId: 'dualgi3de',
  envText: `VITE_FIREBASE_API_KEY=AIzaSyDhSZUTwx7-TQ0cxrxsQO4_RYKdMo9ppC8
VITE_FIREBASE_AUTH_DOMAIN=dualgi3de.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dualgi3de
VITE_FIREBASE_STORAGE_BUCKET=dualgi3de.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=756959344919
VITE_FIREBASE_APP_ID=1:756959344919:web:968cc4b3092191444d9f52
VITE_FIREBASE_VAPID_KEY=BJZsOEW6D3QI0uflC-mbD2HjlD2hhKdDHDNnbQkPJXyx0gEbUppeSSKtT67ijmzFMAs6laNC19uDXd5n7zCI_eE
VITE_BUSINESS_NAME=Dualgi 3D`
};

console.log('Writing .env.local with Dualgi 3D config...');
fs.writeFileSync(envFilePath, DUALGI_CONFIG.envText + '\n', 'utf8');

console.log('Generating Service Worker with Firebase config...');
execSync('node scripts/generate-fcm-sw.mjs', { stdio: 'inherit' });

console.log('Compiling and building production assets for Dualgi 3D...');
execSync('tsc -b && vite build', { stdio: 'inherit' });

console.log(`\n🎉 Success! The compiled files in the 'dist' folder are now configured for Dualgi 3D.`);
console.log(`You can now upload the contents of the 'dist' folder to your Donweb hosting.`);
