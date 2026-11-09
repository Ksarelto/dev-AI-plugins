// A stand-in for Playwright (PLAYWRIGHT_MODULE=<this file>): screenshots are tiny solid-colour PNGs,
// colour from STUB_COLOR (white|black); checklist items whose id is in STUB_CHECK_FAIL (comma list) fail.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
};
export function png(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const color = () => (process.env.STUB_COLOR === "black" ? [0, 0, 0] : [255, 255, 255]);
export const visited = [];

const page = {
  async goto(url) {
    visited.push(url);
  },
  async click() {},
  async waitForTimeout() {},
  async screenshot({ path }) {
    writeFileSync(path, png(8, 8, color()));
  },
  async evaluate(fn, arg) {
    const failing = (process.env.STUB_CHECK_FAIL ?? "").split(",").filter(Boolean);
    return Array.isArray(arg) ? arg.map((it) => ({ id: it.id, ok: !failing.includes(it.id), problem: failing.includes(it.id) ? `font-size is 12px, want ${it.styles?.["font-size"] ?? "?"}` : "" })) : [];
  },
  async close() {},
};
export const chromium = {
  async launch() {
    return { async newPage() { return page; }, async close() {} };
  },
};
