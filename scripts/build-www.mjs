// Copies the static game into www/, which Capacitor packages into the Android app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const FILES = ['index.html', 'style.css', 'privacy.html', 'icon.svg', 'icon-180.png', 'icon-512.png', 'manifest.webmanifest'];
const DIRS = ['js', 'vendor', 'fonts'];

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of FILES) cpSync(f, `www/${f}`);
for (const d of DIRS) cpSync(d, `www/${d}`, { recursive: true });
console.log('www/ ready');
