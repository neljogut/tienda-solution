import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GoogleAuth } from 'google-auth-library';

const FIREBASE_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

/**
 * Usa el refresh_token guardado por `firebase login` (misma cuenta que Firebase CLI).
 */
export async function getFirebaseCliAuthClient() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const raw = await readFile(configPath, 'utf8');
  const config = JSON.parse(raw);
  const refreshToken = config?.tokens?.refresh_token;

  if (!refreshToken) {
    throw new Error('No hay sesión de Firebase CLI. Ejecutá: firebase login');
  }

  const auth = new GoogleAuth({
    credentials: {
      type: 'authorized_user',
      client_id: FIREBASE_CLIENT_ID,
      client_secret: FIREBASE_CLIENT_SECRET,
      refresh_token: refreshToken,
    },
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/datastore',
      'https://www.googleapis.com/auth/firebase',
    ],
  });

  return auth.getClient();
}
