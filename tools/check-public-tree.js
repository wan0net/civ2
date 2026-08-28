#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const forbiddenExtensions = new Set([
  '.avi', '.dll', '.exe', '.isu', '.log', '.m4a', '.net', '.reg', '.sav', '.wav',
]);
const forbiddenNames = new Set(['.DS_Store']);
const required = [
  '.nojekyll',
  'data/mpcredits.txt',
  'sprites/raw/197704.gif',
  'sprites/raw/197706.gif',
  'sprites/extracted/video/OPENING.webm',
  'sprites/extracted/video/LOSER.webm',
  'sprites/extracted/wonders/WONDER27.webm',
  'sprites/extracted/heralds/HRLDSIO.webm',
  'PEDIA/CONCEPT.PDE',
  'Music/Civilization II - Menu Music.mp3',
];

function walk(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const childRelative = path.posix.join(relative, entry.name);
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(child, childRelative) : [childRelative];
  });
}

const files = walk(publicDir).sort();
const rejected = files.filter(file =>
  forbiddenNames.has(path.basename(file)) || forbiddenExtensions.has(path.extname(file).toLowerCase())
);
const missing = required.filter(file => !files.includes(file));

if (rejected.length || missing.length) {
  if (rejected.length) console.error(`Forbidden public files:\n${rejected.join('\n')}`);
  if (missing.length) console.error(`Missing runtime files:\n${missing.join('\n')}`);
  process.exit(1);
}

const bytes = files.reduce((total, file) => total + fs.statSync(path.join(publicDir, file)).size, 0);
console.log(`Public runtime allow-list: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB`);
