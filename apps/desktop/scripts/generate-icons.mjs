import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(here, "..");
const buildDir = join(desktopDir, "build");
const iconsetDir = join(buildDir, "icon.iconset");
const sourcePng = join(desktopDir, "assets", "icon.png");
const iconPng = join(buildDir, "icon.png");
const iconIcns = join(buildDir, "icon.icns");

mkdirSync(buildDir, { recursive: true });
const source = readFileSync(sourcePng);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (!source.subarray(0, 8).equals(pngSignature)) throw new Error("assets/icon.png must be a PNG file");

const width = source.readUInt32BE(16);
const height = source.readUInt32BE(20);
const bitDepth = source[24];
const colorType = source[25];
const interlace = source[28];
if (width !== height || width < 1024) throw new Error(`assets/icon.png must be a square PNG at least 1024x1024, got ${width}x${height}`);
if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
  throw new Error("assets/icon.png must be a non-interlaced 8-bit RGBA PNG");
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function cornerAlphas(png) {
  const idat = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }

  const inflated = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  let previous = Buffer.alloc(rowBytes);
  const corners = [];
  let cursor = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[cursor++];
    const raw = inflated.subarray(cursor, cursor + rowBytes);
    cursor += rowBytes;
    const row = Buffer.alloc(rowBytes);

    for (let i = 0; i < rowBytes; i++) {
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const up = previous[i];
      const upperLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      row[i] = (raw[i] + predictor) & 0xff;
    }

    if (y === 0) corners.push(row[3], row[rowBytes - 1]);
    if (y === height - 1) corners.push(row[3], row[rowBytes - 1]);
    previous = row;
  }
  return corners;
}

const corners = cornerAlphas(source);
if (corners.some((alpha) => alpha !== 0)) {
  throw new Error(`assets/icon.png corners must be fully transparent (alpha=0), got ${corners.join(", ")}`);
}

if (width === 1024) copyFileSync(sourcePng, iconPng);
else execFileSync("sips", ["-z", "1024", "1024", sourcePng, "--out", iconPng], { stdio: "inherit" });

if (process.platform === "darwin") {
  rmSync(iconsetDir, { recursive: true, force: true });
  mkdirSync(iconsetDir, { recursive: true });

  for (const size of [16, 32, 128, 256, 512]) {
    execFileSync("sips", ["-z", String(size), String(size), iconPng, "--out", join(iconsetDir, `icon_${size}x${size}.png`)], { stdio: "ignore" });
    const retina = size * 2;
    execFileSync("sips", ["-z", String(retina), String(retina), iconPng, "--out", join(iconsetDir, `icon_${size}x${size}@2x.png`)], { stdio: "ignore" });
  }

  execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", iconIcns], { stdio: "inherit" });
  rmSync(iconsetDir, { recursive: true, force: true });
}

console.log(`Generated app icons in ${buildDir}`);
