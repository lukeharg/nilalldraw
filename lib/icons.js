// The "0–0" brand mark as real image files: drawn from primitives and encoded
// to PNG/ICO here in process.
//
// iOS ignores <link rel="icon"> for the home screen and reads apple-touch-icon,
// which must be a fetchable PNG — an SVG data: URI buys nothing there, and
// Google likewise won't take a data: URI as a site's search-result favicon. So
// the mark has to exist as files. The build has one dependency and runs on a
// bare CI runner, and the mark is two rings and a bar, so drawing it directly
// is less machinery than adding a rasteriser would be.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const INK = [0x13, 0x14, 0x11];
const AMBER = [0xf0, 0x80, 0x00];

// Mark proportions, every one a multiple of the cap height of the zeros.
const CAP = { zeroW: 0.7, ring: 0.205, dashW: 0.42, dashH: 0.17, gap: 0.08 };
const MARK_W = 2 * CAP.zeroW + 2 * CAP.gap + CAP.dashW;

// One drawing of the mark, centred on (cx, cy) at the given cap height. Both
// the rasteriser and the SVG writer below build from this, so every rendering
// of the mark — favicon, tile, card — is the same geometry.
function markShapes(cx, cy, cap) {
  const zeroW = CAP.zeroW * cap;
  const gap = CAP.gap * cap;
  const dashW = CAP.dashW * cap;
  const dashH = CAP.dashH * cap;
  const ring = CAP.ring * cap;
  let x = cx - (MARK_W * cap) / 2;
  const zero = () => ({
    type: "ring",
    cx: x + zeroW / 2,
    cy,
    rx: zeroW / 2,
    ry: cap / 2,
    ix: zeroW / 2 - ring,
    iy: cap / 2 - ring,
  });

  const left = zero();
  x += zeroW + gap;
  const dash = { type: "rect", x, y: cy - dashH / 2, w: dashW, h: dashH };
  x += dashW + gap;
  return [left, dash, zero()];
}

/* Rasteriser ------------------------------------------------------------- */

const SS = 4; // subsamples per axis, so 16 per pixel

function boundsOf(s) {
  return s.type === "ring"
    ? [s.cx - s.rx, s.cy - s.ry, s.cx + s.rx, s.cy + s.ry]
    : [s.x, s.y, s.x + s.w, s.y + s.h];
}

function covers(s, x, y) {
  if (s.type === "ring") {
    const dx = x - s.cx;
    const dy = y - s.cy;
    if ((dx / s.rx) ** 2 + (dy / s.ry) ** 2 > 1) return false;
    return (dx / s.ix) ** 2 + (dy / s.iy) ** 2 >= 1; // the counter, punched out
  }
  if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) return false;
  if (!s.r) return true;
  // Rounded rect: clamp into the straight band, then it is a circle test.
  const dx = x - Math.min(Math.max(x, s.x + s.r), s.x + s.w - s.r);
  const dy = y - Math.min(Math.max(y, s.y + s.r), s.y + s.h - s.r);
  return dx * dx + dy * dy <= s.r * s.r;
}

class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4); // transparent
  }

  // Source-over, so shapes can sit on transparent ground and keep clean edges
  // where a rounded background meets nothing.
  blend(x, y, color, a) {
    const i = (y * this.w + x) * 4;
    const da = this.px[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let c = 0; c < 3; c++) {
      this.px[i + c] = Math.round((color[c] * a + this.px[i + c] * da * (1 - a)) / oa);
    }
    this.px[i + 3] = Math.round(oa * 255);
  }

  draw(shape, color) {
    const [bx0, by0, bx1, by1] = boundsOf(shape);
    const x0 = Math.max(0, Math.floor(bx0));
    const y0 = Math.max(0, Math.floor(by0));
    const x1 = Math.min(this.w - 1, Math.ceil(bx1));
    const y1 = Math.min(this.h - 1, Math.ceil(by1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (covers(shape, x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
          }
        }
        if (hits) this.blend(x, y, color, hits / (SS * SS));
      }
    }
  }
}

/* PNG / ICO encoding ------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(r) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(r.w, 0);
  ihdr.writeUInt32BE(r.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = r.w * 4;
  const raw = Buffer.alloc((stride + 1) * r.h);
  for (let y = 0; y < r.h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none — these are flat-colour images
    Buffer.from(r.px.buffer, r.px.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A one-image .ico wrapping a PNG, which every browser back to IE11 reads.
// Only here because browsers still probe /favicon.ico directly.
function encodeIco(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(1, 4); // one image
  head.writeUInt8(size, 6);
  head.writeUInt8(size, 7);
  head.writeUInt16LE(1, 10); // colour planes
  head.writeUInt16LE(32, 12); // bits per pixel
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(head.length, 18);
  return Buffer.concat([head, png]);
}

/* Compositions ------------------------------------------------------------ */

const TILE_RADIUS = 0.1875; // 12/64, the radius the mark has always had
const TILE_MARK = 0.74; // mark width as a fraction of the tile

function tile(size, { radius = TILE_RADIUS, mark = TILE_MARK } = {}) {
  const r = new Raster(size, size);
  r.draw({ type: "rect", x: 0, y: 0, w: size, h: size, r: radius * size }, INK);
  for (const s of markShapes(size / 2, size / 2, (size * mark) / MARK_W)) r.draw(s, AMBER);
  return r;
}

// Social card. The mark alone: the wordmark is set in Archivo Black, and
// nothing here can set type — see the note in README on replacing this.
function ogCard(w, h) {
  const band = Math.round(h * 0.028);
  const r = new Raster(w, h);
  r.draw({ type: "rect", x: 0, y: 0, w, h }, INK);
  for (const s of markShapes(w / 2, (h - band) / 2, (w * 0.42) / MARK_W)) r.draw(s, AMBER);
  r.draw({ type: "rect", x: 0, y: h - band, w, h: band }, AMBER);
  return r;
}

export function faviconSvg(size = 64, { radius = TILE_RADIUS, mark = TILE_MARK } = {}) {
  const n = (v) => Math.round(v * 100) / 100;
  // Two ellipse subpaths under evenodd: the ring stays a ring on any ground,
  // rather than relying on a counter painted in the background colour.
  const ellipse = (cx, cy, rx, ry) =>
    `M${n(cx - rx)} ${n(cy)}` +
    `A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}` +
    `A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
  const mk = markShapes(size / 2, size / 2, (size * mark) / MARK_W)
    .map((s) =>
      s.type === "ring"
        ? `<path fill-rule="evenodd" d="${ellipse(s.cx, s.cy, s.rx, s.ry)}${ellipse(s.cx, s.cy, s.ix, s.iy)}"/>`
        : `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}"/>`
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="NilAllDraw">` +
    `<rect width="${size}" height="${size}" rx="${n(radius * size)}" fill="#131411"/>` +
    `<g fill="#f08000">${mk}</g></svg>`
  );
}

export function writeBrandAssets(dist) {
  const out = (name, data) => fs.writeFileSync(path.join(dist, name), data);
  const tilePng = (size) => encodePng(tile(size));

  out("favicon.svg", faviconSvg());
  out("favicon.ico", encodeIco(tilePng(48), 48));
  // 192 and 512 are the manifest sizes; both are multiples of 48, which is what
  // Google asks of a favicon it will show in search results.
  out("icon-192.png", tilePng(192));
  out("icon-512.png", tilePng(512));
  // iOS rounds the home-screen icon itself, so this one is full-bleed square
  // with the mark pulled in clear of the corner radius the system applies.
  out("apple-touch-icon.png", encodePng(tile(180, { radius: 0, mark: 0.68 })));
  out("og.png", encodePng(ogCard(1200, 630)));
}
