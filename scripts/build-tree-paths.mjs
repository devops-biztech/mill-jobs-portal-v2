#!/usr/bin/env node
/**
 * Converts a line-art SVG into src/components/login/tree-paths.ts.
 *
 *   npm run tree            # uses tree.svg in the project root
 *   npm run tree -- art.svg # or point it at another file
 *
 * The artwork is preserved verbatim: path data and per-path stroke widths are
 * copied through untouched. This script only decides *draw order* (farthest
 * from the apex first, so the animation converges on the treetop) and fits the
 * viewBox to the drawing's actual bounds.
 *
 * It expects monochrome, stroke-based line art — every shape a <path> with
 * fill="none". Anything else is reported below, because the draw-on animation
 * works by tracing a stroke and cannot animate a filled shape.
 */

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
let input = "tree.svg";
/** Drop marks shorter than this many user units. 0 keeps everything. */
let minLength = 0;
/** Write an HTML preview instead of generating, showing what --min would cut. */
let preview = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--min") minLength = Number(argv[++i]) || 0;
  else if (argv[i] === "--preview") preview = true;
  else if (!argv[i].startsWith("--")) input = argv[i];
}

const OUT = "src/components/login/tree-paths.ts";
const PREVIEW_OUT = "tree-preview.html";

if (!fs.existsSync(input)) {
  console.error(`✗ Cannot find ${input}`);
  process.exit(1);
}

const src = fs.readFileSync(input, "utf8");

// ── Transforms ────────────────────────────────────────────────────────────
// Rather than rewriting every coordinate, the group transform is carried
// through to the rendered <g>. Points are still mapped through it here so the
// viewBox, apex and draw order are computed in final screen space.
const IDENTITY = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

function parseTransform(str) {
  let m = IDENTITY;
  for (const [, fn, argStr] of str.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = argStr.split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === "translate") m = mul(m, [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
    else if (fn === "scale") m = mul(m, [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]);
    else if (fn === "matrix") m = mul(m, a.slice(0, 6));
    else if (fn === "rotate") {
      const r = ((a[0] || 0) * Math.PI) / 180;
      m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
    }
  }
  return m;
}

const groupTags = [...src.matchAll(/<g\b[^>]*>/g)].map((m) => m[0]);
const transformStr = groupTags
  .map((t) => /transform="([^"]+)"/.exec(t)?.[1])
  .filter(Boolean)
  .join(" ");
const MATRIX = transformStr ? parseTransform(transformStr) : IDENTITY;
const apply = ([x, y]) => [
  MATRIX[0] * x + MATRIX[2] * y + MATRIX[4],
  MATRIX[1] * x + MATRIX[3] * y + MATRIX[5],
];
/** Strokes shrink under a scaling transform; compensate so weights survive. */
const detScale = Math.sqrt(Math.abs(MATRIX[0] * MATRIX[3] - MATRIX[1] * MATRIX[2])) || 1;

// ── Warn about anything this pipeline cannot faithfully carry over ─────────
const warnings = [];
for (const el of ["polyline", "line", "circle", "ellipse", "rect", "polygon"]) {
  const n = (src.match(new RegExp(`<${el}\\b`, "g")) ?? []).length;
  if (n) warnings.push(`${n} <${el}> element(s) — only <path> is converted, these will be dropped`);
}
// Fill may be declared on the group rather than on each path.
const groupFilled = groupTags.some((t) => /fill="(?!none)[^"]+"/.test(t));
const pathFilled = [...src.matchAll(/<path\b[^>]*?>/gs)].filter(
  (m) => !/fill="none"/.test(m[0]) && /fill="/.test(m[0]),
).length;
if (groupFilled || pathFilled) {
  warnings.push(
    "artwork is FILLED, not stroked — a stroke draw-on traces each shape's outline, " +
      "which reads as hollow outlines rather than the solid drawing",
  );
}

// ── Extract paths, keeping each one's own stroke width ────────────────────
const paths = [...src.matchAll(/<path\b[^>]*?>/gs)]
  .map((m) => ({
    d: (/\sd="([^"]+)"/.exec(m[0])?.[1] ?? "").replace(/\s+/g, " ").trim(),
    w: parseFloat(/stroke-width="([^"]+)"/.exec(m[0])?.[1] ?? "2"),
  }))
  .filter((p) => p.d);

if (!paths.length) {
  console.error(`✗ No <path d="..."> elements found in ${input}`);
  process.exit(1);
}

/** Args consumed per command; a repeat of the args means an implicit repeat. */
const ARITY = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

const tokenize = (d) => d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];

/**
 * Approximate drawn length of a path, by flattening curves. Used to give each
 * stroke a duration proportional to its size, so the pen moves at a constant
 * speed instead of every stroke taking the same time regardless of length.
 */
function lengthOf(d) {
  const tokens = tokenize(d);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const cubic = (p0, p1, p2, p3, t) => {
    const m = 1 - t;
    return (
      m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3
    );
  };

  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "", total = 0;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const n = ARITY[lower];
    if (n === undefined) { i++; continue; }
    if (lower === "z") { total += dist(cx, cy, sx, sy); cx = sx; cy = sy; continue; }
    if (i + n > tokens.length) break;
    const a = tokens.slice(i, i + n).map(Number);
    i += n;

    if (lower === "m") {
      cx = rel ? cx + a[0] : a[0];
      cy = rel ? cy + a[1] : a[1];
      sx = cx; sy = cy;
    } else if (lower === "h") {
      const nx = rel ? cx + a[0] : a[0];
      total += Math.abs(nx - cx); cx = nx;
    } else if (lower === "v") {
      const ny = rel ? cy + a[0] : a[0];
      total += Math.abs(ny - cy); cy = ny;
    } else if (lower === "c" || lower === "q" || lower === "s" || lower === "t" || lower === "a") {
      // Endpoint is the last pair; sample cubics, chord-approximate the rest.
      const ex = rel ? cx + a[n - 2] : a[n - 2];
      const ey = rel ? cy + a[n - 1] : a[n - 1];
      if (lower === "c") {
        const x1 = rel ? cx + a[0] : a[0], y1 = rel ? cy + a[1] : a[1];
        const x2 = rel ? cx + a[2] : a[2], y2 = rel ? cy + a[3] : a[3];
        let px = cx, py = cy;
        for (let k = 1; k <= 12; k++) {
          const t = k / 12;
          const qx = cubic(cx, x1, x2, ex, t);
          const qy = cubic(cy, y1, y2, ey, t);
          total += dist(px, py, qx, qy);
          px = qx; py = qy;
        }
      } else {
        total += dist(cx, cy, ex, ey);
      }
      cx = ex; cy = ey;
    } else {
      const ex = rel ? cx + a[0] : a[0];
      const ey = rel ? cy + a[1] : a[1];
      total += dist(cx, cy, ex, ey);
      cx = ex; cy = ey;
    }
  }
  return total;
}

/**
 * Splits a compound path into standalone subpaths, one per moveto.
 *
 * Traced artwork routinely packs dozens of unrelated marks into a single
 * <path> — this file has one holding 51 of them, scattered across the whole
 * drawing. Left joined, that path draws marks all over the image at once and
 * no amount of re-ordering can produce a clean sweep. Each subpath's start is
 * re-emitted as an absolute moveto so it stands alone.
 */
function splitSubpaths(d) {
  const tokens = tokenize(d);
  const out = [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "", parts = null;

  const flush = () => {
    if (parts && parts.length > 1) out.push(parts.join(""));
    parts = null;
  };

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const n = ARITY[lower];
    if (n === undefined) { i++; continue; }

    if (lower === "z") {
      if (parts) parts.push("Z");
      cx = sx; cy = sy;
      continue;
    }
    if (i + n > tokens.length) break;
    const a = tokens.slice(i, i + n).map(Number);
    i += n;

    if (lower === "m") {
      const nx = rel ? cx + a[0] : a[0];
      const ny = rel ? cy + a[1] : a[1];
      flush();
      parts = [`M${+nx.toFixed(2)},${+ny.toFixed(2)}`];
      cx = nx; cy = ny; sx = nx; sy = ny;
    } else {
      if (!parts) parts = [`M${+cx.toFixed(2)},${+cy.toFixed(2)}`];
      parts.push(cmd + a.join(" "));
      if (lower === "h") cx = rel ? cx + a[0] : a[0];
      else if (lower === "v") cy = rel ? cy + a[0] : a[0];
      else if (lower === "a") {
        cx = rel ? cx + a[5] : a[5];
        cy = rel ? cy + a[6] : a[6];
      } else {
        cx = rel ? cx + a[n - 2] : a[n - 2];
        cy = rel ? cy + a[n - 1] : a[n - 1];
      }
    }
  }
  flush();
  return out;
}

/**
 * Walks a path and returns its points in absolute coordinates. Relative
 * commands carry deltas rather than positions, so naively reading every number
 * as a coordinate gives nonsense — this tracks the current point instead.
 * Control points are included; that slightly over-estimates the bounds, which
 * is harmless for framing.
 */
function pointsOf(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const pts = [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "";

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const n = ARITY[lower];
    if (n === undefined) { i++; continue; }
    if (lower === "z") { cx = sx; cy = sy; continue; }
    if (i + n > tokens.length) break;

    const a = tokens.slice(i, i + n).map(Number);
    i += n;

    if (lower === "h") { cx = rel ? cx + a[0] : a[0]; }
    else if (lower === "v") { cy = rel ? cy + a[0] : a[0]; }
    else if (lower === "a") {
      // Only the endpoint matters for bounds; radii and flags are ignored.
      cx = rel ? cx + a[5] : a[5];
      cy = rel ? cy + a[6] : a[6];
    } else {
      // Every remaining command is a list of x,y pairs ending at the endpoint.
      for (let k = 0; k + 1 < n; k += 2) {
        const px = rel ? cx + a[k] : a[k];
        const py = rel ? cy + a[k + 1] : a[k + 1];
        pts.push([px, py]);
      }
      cx = rel ? cx + a[n - 2] : a[n - 2];
      cy = rel ? cy + a[n - 1] : a[n - 1];
      if (lower === "m") { sx = cx; sy = cy; }
    }
    pts.push([cx, cy]);
  }
  return pts.length ? pts : [[0, 0]];
}

// ── Fit the viewBox to the drawing, with a small margin ───────────────────
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
let apex = [0, Infinity];
for (const p of paths) {
  // Relative commands carry deltas, not positions, so only absolute-command
  // paths would map exactly. Sampling every coordinate is close enough for
  // framing and ordering, and avoids a full path parser.
  for (const raw of pointsOf(p.d)) {
    const [x, y] = apply(raw);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (y < apex[1]) apex = [x, y];
  }
}
const pad = Math.max(maxX - minX, maxY - minY) * 0.02;
const vb = [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2].map((v) =>
  Number(v.toFixed(2)),
);

// ── Draw order: farthest from the apex first ──────────────────────────────
// Break compound paths apart, so each mark can be ordered on its own.
const marks = paths.flatMap((p) => splitSubpaths(p.d).map((d) => ({ ...p, d })));

const withDist = marks.map((p) => {
  const pts = pointsOf(p.d).map(apply);
  const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  // Lowest on screen first, so the drawing grows from the ground upward.
  return { ...p, depth: -cy };
});
withDist.sort((a, b) => a.depth - b.depth);

// Drawn length of each stroke, in final (post-transform) user units, so the
// component can set one pen speed and derive every duration from it.
for (const p of withDist) {
  p.len = Number((lengthOf(p.d) * detScale).toFixed(2));
}

// ── Size report, so a --min threshold can be chosen with evidence ─────────
const allLens = withDist.map((p) => p.len).sort((a, b) => a - b);
const grandTotal = allLens.reduce((a, b) => a + b, 0);
const q = (f) => allLens[Math.floor(allLens.length * f)] ?? 0;
console.log(`\n  marks by length — p10 ${q(0.1).toFixed(0)} · p25 ${q(0.25).toFixed(0)} · median ${q(0.5).toFixed(0)} · p75 ${q(0.75).toFixed(0)} · max ${allLens[allLens.length - 1].toFixed(0)}`);
for (const t of [10, 20, 30, 50, 80]) {
  const under = withDist.filter((p) => p.len < t);
  if (!under.length) continue;
  const share = (under.reduce((a, p) => a + p.len, 0) / grandTotal) * 100;
  console.log(
    `  --min ${String(t).padStart(3)} would drop ${String(under.length).padStart(3)} marks ` +
      `(${((under.length / withDist.length) * 100).toFixed(0).padStart(2)}% of marks, only ${share.toFixed(1)}% of the drawing)`,
  );
}

// ── Preview: show exactly which marks a threshold would remove ────────────
if (preview) {
  const svg = withDist
    .map(
      (p) =>
        `<path d="${p.d}" fill="none" stroke="${p.len < minLength ? "#e11" : "#0a0a0a"}" ` +
        `stroke-width="${p.len < minLength ? p.w * 2.5 : p.w}" ${p.len < minLength ? "" : 'opacity="0.25"'}/>`,
    )
    .join("\n");
  fs.writeFileSync(
    PREVIEW_OUT,
    `<!doctype html><meta charset="utf-8"><title>tree preview — --min ${minLength}</title>
<body style="margin:0;font:14px system-ui;background:#fff;padding:24px">
<p><b>--min ${minLength}</b> — <span style="color:#e11">red = would be dropped</span>, grey = kept.
Dropping ${withDist.filter((p) => p.len < minLength).length} of ${withDist.length} marks.</p>
<svg viewBox="${vb.join(" ")}" width="760">${transformStr ? `<g transform="${transformStr}">` : ""}
${svg}
${transformStr ? "</g>" : ""}</svg></body>`,
  );
  console.log(`\n✓ wrote ${PREVIEW_OUT} — open it to see what --min ${minLength} removes (nothing else was changed)`);
  process.exit(0);
}

// ── Apply the threshold ───────────────────────────────────────────────────
const dropped = withDist.filter((p) => p.len < minLength);
if (dropped.length) {
  const idx = new Set(dropped);
  for (let i = withDist.length - 1; i >= 0; i--) if (idx.has(withDist[i])) withDist.splice(i, 1);
}

const totalLen = withDist.reduce((s, p) => s + p.len, 0);

const out = `// GENERATED — do not edit by hand.
// Source: ${path.basename(input)} · regenerate with \`npm run tree\`
//
// Each entry is [path data, stroke width]; both come straight from the artwork.
// Compound paths are split into individual marks and ordered bottom-to-top,
// so the draw animation grows from the ground upward.

/** Fitted to the artwork's bounds, in final (post-transform) space. */
export const TREE_VIEW_BOX = "${vb.join(" ")}";

/** The source's own group transform, reapplied on render. "" when there is none. */
export const TREE_TRANSFORM = ${JSON.stringify(transformStr)};

/** Stroke widths are divided by the transform's scale, so undo it here. */
export const TREE_STROKE_SCALE = ${(1 / detScale).toFixed(4)};

/** Total drawn length, in user units. */
export const TREE_TOTAL_LENGTH = ${totalLen.toFixed(1)};

/**
 * [path data, stroke width, drawn length]. Length is in final user units, so a
 * constant pen speed gives each stroke a duration of length / speed.
 */
export const TREE_PATHS: [string, number, number][] = [
${withDist.map((p) => `  ["${p.d}", ${p.w}, ${p.len}],`).join("\n")}
];
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

console.log(`\n✓ ${paths.length} paths → ${withDist.length} marks${dropped.length ? ` (${dropped.length} dropped by --min ${minLength})` : ""} → ${OUT}`);
console.log(`  viewBox "${vb.join(" ")}"  ·  apex (${apex[0].toFixed(1)}, ${apex[1].toFixed(1)})`);
console.log(`  total drawn length ${totalLen.toFixed(0)} units — split across N pens, draw time is roughly this / (speed x N)`);
if (warnings.length) {
  console.log("\n⚠ Check these before trusting the result:");
  for (const w of warnings) console.log(`  · ${w}`);
}
