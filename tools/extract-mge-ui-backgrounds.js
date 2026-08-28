/**
 * Extract the original MGE World-screen backdrops embedded in Tiles.dll.
 *
 * Resource ids and byte ranges were verified against the PE GIF resources in
 * the bundled Civilization II Multiplayer Gold installation.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const civ2Dir = path.resolve(process.argv[2] ?? process.env.CIV2_MGE_PATH ?? '');
if (!process.argv[2] && !process.env.CIV2_MGE_PATH) {
  throw new Error('Usage: node tools/extract-mge-ui-backgrounds.js /path/to/Civ2');
}
const source = path.join(civ2Dir, 'Tiles.dll');
const destination = path.resolve(process.argv[3] ?? path.join(root, 'public', 'sprites', 'extracted', 'tiles'));
const bytes = fs.readFileSync(source);

const resources = {
  bgSmall:        { resourceId: 56, offset: 0xed354, length: 0xa0fd },
  hallOfFameBack: { resourceId: 57, offset: 0x7b96c, length: 0xb9e0 },
  top5Back:       { resourceId: 58, offset: 0x8734c, length: 0x12acc },
  scoreBack:      { resourceId: 59, offset: 0x99e18, length: 0xb823 },
};

fs.mkdirSync(destination, { recursive: true });
for (const [name, { resourceId, offset, length }] of Object.entries(resources)) {
  const image = bytes.subarray(offset, offset + length);
  if (image.subarray(0, 6).toString('ascii') !== 'GIF87a') {
    throw new Error(`Tiles.dll GIF resource ${resourceId} was not found at 0x${offset.toString(16)}`);
  }
  if (name === 'bgSmall') await sharp(image).png().toFile(path.join(destination, `${name}.png`));
  else fs.writeFileSync(path.join(destination, `${name}.gif`), image);
}
