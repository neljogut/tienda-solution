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
VITE_FIREBASE_VAPID_KEY=BD5uadfHdJuGWxzpUAdolXOjuOVdPKHAwB6ejEiycrb9l1xCTUKk-58LOsBLmeEbLyQxVqS7WxtsOLZgHHsGWjU`,
};

try {
  console.log(`\n======================================================`);
  console.log(`STARTING DEPLOY TO: SOLUTION 3D (${CONFIG.projectId})`);
  console.log(`======================================================`);

  console.log(`Writing .env.local for Solution 3D...`);
  fs.writeFileSync(envFilePath, CONFIG.envText + '\n', 'utf8');

  console.log(`Generating Service Worker with Firebase config...`);
  execSync('node scripts/generate-fcm-sw.mjs', { stdio: 'inherit' });

  console.log(`Compiling and building production assets...`);
  execSync('npm run build', { stdio: 'inherit' });

  console.log(`Building Cloud Functions...`);
  execSync('npm run build', { cwd: path.join(rootDir, 'functions'), stdio: 'inherit' });

  console.log(`Switching Firebase CLI to use project: ${CONFIG.projectId}...`);
  execSync(`npx firebase use ${CONFIG.projectId}`, { stdio: 'inherit' });

  console.log(`Deploying Hosting and Functions...`);
  execSync(
    `npx firebase deploy --only functions,hosting --force`,
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

  console.log(`\n======================================================`);
  console.log(`✅ MERCADO PAGO INTEGRATION DEPLOY COMPLETED!`);
  console.log(`======================================================`);
} catch (error) {
  console.error(`\n❌ Deployment failed:`, error.message);
  process.exit(1);
}
