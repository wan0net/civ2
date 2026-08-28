/**
 * xBRZ 2x upscaling algorithm — JavaScript port
 *
 * Original C++ by Zenju (https://sourceforge.net/projects/xbrz/)
 * Ported to JS for use in Civ2 Web.
 *
 * xBRZ is a pixel-art upscaling algorithm that produces smooth diagonal edges
 * by examining 3×3 pixel neighbourhoods and applying carefully chosen blend rules.
 */

// ─── Colour helpers ──────────────────────────────────────────────────────────

function r(c) { return (c >>> 16) & 0xff; }
function g(c) { return (c >>>  8) & 0xff; }
function b(c) { return  c         & 0xff; }
function a(c) { return (c >>> 24) & 0xff; }

function pack(r, g, b, a) {
  return ((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** Weighted colour distance (perceptual) */
function colorDist(c1, c2) {
  const dr = r(c1) - r(c2);
  const dg = g(c1) - g(c2);
  const db = b(c1) - b(c2);
  const da = a(c1) - a(c2);
  // YCbCr-ish weights
  return (dr * dr * 2 + dg * dg * 3 + db * db + da * da * 2);
}

function colorEqual(c1, c2) {
  return colorDist(c1, c2) < 100;
}

/** Bilinear blend of two colours at ratio t (0–1 toward c2) */
function blend(c1, c2, t) {
  const s = 1 - t;
  return pack(
    Math.round(r(c1) * s + r(c2) * t),
    Math.round(g(c1) * s + g(c2) * t),
    Math.round(b(c1) * s + b(c2) * t),
    Math.round(a(c1) * s + a(c2) * t),
  );
}

// ─── Blend type constants ────────────────────────────────────────────────────

const BLEND_NONE    = 0;
const BLEND_NORMAL  = 1;
const BLEND_DOMINANT = 2;

// ─── Rotation helpers for the 4-fold symmetry loop ──────────────────────────

// Pixel positions in a 3×3 neighbourhood, named by compass position:
// a b c
// d e f
// g h i
// We rotate the grid 4× (0°, 90°, 180°, 270°) to avoid duplicating blend logic.

const ROT0   = [0,1,2,3,4,5,6,7,8];
const ROT90  = [6,3,0,7,4,1,8,5,2];
const ROT180 = [8,7,6,5,4,3,2,1,0];
const ROT270 = [2,5,8,1,4,7,0,3,6];
const ROTATIONS = [ROT0, ROT90, ROT180, ROT270];

// Output pixel offsets for each rotation (2×2 output block from one input pixel):
// rot0  → TL TR BL BR  = [0,1,2,3] at offset (0,0)
// We map the 4 output sub-pixels for each rotation.
// Output layout at 2×: top-left, top-right, bottom-left, bottom-right
const OUT_ROT = [
  [0, 1, 2, 3],  // rot0
  [2, 0, 3, 1],  // rot90
  [3, 2, 1, 0],  // rot180
  [1, 3, 0, 2],  // rot270
];

// ─── Core 2× scaling ─────────────────────────────────────────────────────────

/**
 * Scale ImageData by 2× using xBRZ algorithm.
 * @param {ImageData} src
 * @returns {ImageData} 2× scaled ImageData
 */
export function xbrz2x(src) {
  const sw = src.width;
  const sh = src.height;
  const dw = sw * 2;
  const dh = sh * 2;
  const dst = new ImageData(dw, dh);

  const srcBuf = src.data;
  const dstBuf = dst.data;

  // Read pixel as ARGB int from source buffer
  function getPixel(x, y) {
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x >= sw) x = sw - 1;
    if (y >= sh) y = sh - 1;
    const i = (y * sw + x) * 4;
    return pack(srcBuf[i], srcBuf[i+1], srcBuf[i+2], srcBuf[i+3]);
  }

  // Write pixel to dst at (dx, dy)
  function setPixel(dx, dy, c) {
    const i = (dy * dw + dx) * 4;
    dstBuf[i]   = r(c);
    dstBuf[i+1] = g(c);
    dstBuf[i+2] = b(c);
    dstBuf[i+3] = a(c);
  }

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      // Read 3×3 neighbourhood
      const s = [
        getPixel(x-1, y-1), getPixel(x, y-1), getPixel(x+1, y-1),
        getPixel(x-1, y  ), getPixel(x, y  ), getPixel(x+1, y  ),
        getPixel(x-1, y+1), getPixel(x, y+1), getPixel(x+1, y+1),
      ];

      const e = s[4]; // centre pixel

      // Default output: 2×2 block all equal to centre
      const out = [e, e, e, e]; // TL, TR, BL, BR

      // Apply blend rules for each rotation
      for (let rot = 0; rot < 4; rot++) {
        const rs = ROTATIONS[rot];
        // Map rotated neighbourhood
        const a_ = s[rs[0]], b_ = s[rs[1]], c_ = s[rs[2]];
        const d_ = s[rs[3]], e_ = s[rs[4]], f_ = s[rs[5]];
        const g_ = s[rs[6]], h_ = s[rs[7]], i_ = s[rs[8]];

        // xBRZ blend decision logic (simplified 2× variant)
        const haveSharp =
          !colorEqual(e_, h_) && !colorEqual(e_, f_) &&
          (colorEqual(e_, g_) || colorEqual(e_, c_) ||
           colorEqual(h_, d_) || colorEqual(f_, b_) ||
           ((!colorEqual(h_, b_) && !colorEqual(h_, c_) &&
             !colorEqual(f_, g_) && !colorEqual(f_, d_))));

        if (!haveSharp) continue;

        // Determine blend strength
        const dominated =
          colorEqual(e_, g_) && colorEqual(e_, c_) &&
          !colorEqual(h_, d_) && !colorEqual(f_, b_);

        const blendType = dominated ? BLEND_DOMINANT : BLEND_NORMAL;

        // Apply to the appropriate corner of the output block
        const outIdx = OUT_ROT[rot];
        if (blendType === BLEND_DOMINANT) {
          out[outIdx[3]] = blend(e_, h_, 0.5);
          out[outIdx[2]] = blend(e_, h_, 0.25);
          out[outIdx[1]] = blend(e_, f_, 0.25);
        } else {
          out[outIdx[3]] = blend(e_, blend(h_, f_, 0.5), 0.5);
        }
      }

      // Write 2×2 output block
      const dx = x * 2;
      const dy = y * 2;
      setPixel(dx,   dy,   out[0]);
      setPixel(dx+1, dy,   out[1]);
      setPixel(dx,   dy+1, out[2]);
      setPixel(dx+1, dy+1, out[3]);
    }
  }

  return dst;
}
