/** Extract the 13 original MGE setup-screen images from Intro.dll. */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const civ2Dir = path.resolve(process.argv[2] ?? process.env.CIV2_MGE_PATH ?? '');
if (!process.argv[2] && !process.env.CIV2_MGE_PATH) {
  throw new Error('Usage: node tools/extract-mge-intro.js /path/to/Civ2');
}

const source = path.join(civ2Dir, 'Intro.dll');
const destination = path.resolve(process.argv[3] ?? path.join(root, 'public', 'sprites', 'extracted', 'intro'));
const bytes = fs.readFileSync(source);

const resources = {
  sinaiPic:          [0x1e630, 0x9f78],
  stPeterburgPic:    [0x285a8, 0x15d04],
  desertPic:         [0xd0140, 0xa35a],
  snowPic:           [0xe2e1c, 0xa925],
  canyonPic:         [0xc51b8, 0xaf88],
  mingGeneralPic:    [0x3e2ac, 0x1d183],
  islandPic:         [0xda49c, 0x8980],
  ancientPersonsPic: [0x5b430, 0x15d04],
  barbariansPic:     [0x71134, 0x13d5b],
  galleyPic:         [0xb6a3c, 0xe77a],
  peoplePic1:        [0x84e90, 0x129ce],
  peoplePic2:        [0x97860, 0x139a0],
  templePic:         [0xab200, 0xb839],
};

fs.mkdirSync(destination, { recursive: true });
for (const [name, [offset, length]] of Object.entries(resources)) {
  const image = bytes.subarray(offset, offset + length);
  if (image.subarray(0, 3).toString('ascii') !== 'GIF') {
    throw new Error(`Intro.dll image ${name} was not found at 0x${offset.toString(16)}`);
  }
  await sharp(image).png().toFile(path.join(destination, `${name}.png`));
}
