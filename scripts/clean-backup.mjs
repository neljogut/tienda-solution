import { rmSync, existsSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

const paths = [
  'node_modules',
  'dist',
  'dist-ssr',
  '.vite',
  '.firebase',
  '.env.local',
  'functions/node_modules',
  'functions/lib',
  'pdf',
  'scratch',
  'scratch_inspect.cjs',
  'scratch_inspect.js',
  'scratch_inspect.mjs',
];

let removed = 0;
for (const rel of paths) {
  const full = join(root, rel);
  if (!existsSync(full)) continue;
  rmSync(full, { recursive: true, force: true });
  console.log(`Eliminado: ${rel}`);
  removed++;
}

if (removed === 0) {
  console.log('Nada que limpiar: el proyecto ya estaba liviano.');
} else {
  console.log(`\nListo. Se eliminaron ${removed} rutas regenerables o temporales.`);
  console.log('Para restaurar dependencias: npm install && cd functions && npm install && npm run build');
}
