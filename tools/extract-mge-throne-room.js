/**
 * Extract the original MGE throne-room base and upgrade layers from pv.dll.
 *
 * pv.dll stores 640x480 GIF resources. Upgrade layers use #04c5c5 as their
 * transparency key, which is converted to a transparent PNG here so the
 * browser can composite the room exactly like the original game.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const civ2Dir = path.resolve(process.argv[2] ?? process.env.CIV2_MGE_PATH ?? '');
if (!process.argv[2] && !process.env.CIV2_MGE_PATH) {
  throw new Error('Usage: node tools/extract-mge-throne-room.js /path/to/Civ2');
}
const source = path.join(civ2Dir, 'pv.dll');
const destination = path.resolve(process.argv[3] ?? path.join(root, 'public', 'sprites', 'extracted', 'palace'));
const bytes = fs.readFileSync(source);

// Offsets and lengths verified against the PE GIF resources in the bundled
// Civilization II Multiplayer Gold installation.
const sourceResources = [
  [100, 126880, 133694],
  [105, 260576, 74478], [106, 335056, 74478], [107, 409536, 40733], [108, 450272, 38477],
  [110, 488752, 47357], [111, 536112, 65890], [112, 602004, 47339], [113, 649344, 55335],
  [115, 704680, 23327], [116, 728008, 22331], [117, 750340, 13353], [118, 763696, 27293],
  [120, 790992, 100081], [121, 891076, 92886], [122, 983964, 71859], [123, 1055824, 96350],
  [125, 1152176, 13414], [126, 1165592, 28037], [127, 1193632, 25812], [128, 1219444, 21906],
  [130, 1241352, 38774], [131, 1280128, 24819], [132, 1304948, 25054], [133, 1330004, 49801],
  [135, 1379808, 8977], [136, 1388788, 7729], [137, 1396520, 12599], [138, 1409120, 7584],
  [140, 1416704, 11170], [141, 1427876, 12374], [142, 1440252, 19898], [143, 1460152, 24189],
];

const outputNames = new Map([[100, 'base']]);
for (const [category, firstId] of [
  ['walls', 105], ['floor', 110], ['entrance', 115], ['windows', 120],
  ['banner', 125], ['columns', 130], ['throne', 135], ['guards', 140],
]) {
  for (let tier = 0; tier < 4; tier++) outputNames.set(firstId + tier, `${category}-${tier}`);
}

fs.mkdirSync(destination, { recursive: true });
for (const [resourceId, offset, length] of sourceResources) {
  const image = bytes.subarray(offset, offset + length);
  if (image.subarray(0, 6).toString('ascii') !== 'GIF87a') {
    throw new Error(`pv.dll GIF resource ${resourceId} was not found at 0x${offset.toString(16)}`);
  }

  const decoded = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = decoded.data;
  const chromaKeys = new Set(['4,197,197', '90,255,254', '51,36,254', '68,40,254']);
  for (let i = 0; i < rgba.length; i += 4) {
    if (chromaKeys.has(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`)) rgba[i + 3] = 0;
  }

  await sharp(rgba, { raw: decoded.info }).png().toFile(path.join(destination, `${outputNames.get(resourceId)}.png`));
}
