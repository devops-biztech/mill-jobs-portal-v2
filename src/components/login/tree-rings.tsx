/**
 * A log's cross-section, drawn as the brand mark.
 *
 * Tree rings are nature's own time series — one ring per year of growth — so a
 * lumber company's application dashboard gets a mark that is both literally
 * wood and structurally the same thing as its "Applications over time" chart.
 *
 * Geometry is generated once at module scope from a seeded PRNG, so the server
 * and client render byte-identical markup (no hydration mismatch) while still
 * looking hand-grown rather than mathematically perfect.
 */

const CX = 200;
const CY = 200;
const BARK_R = 188;
const PITH_R = 7;
const RING_COUNT = 26;
const SEGMENTS = 64;

/** Pith offset: real logs are rarely centered, the tree leans as it grows. */
const PITH_DX = -13;
const PITH_DY = 9;

function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom through every point, closed, emitted as cubic beziers. */
function closedSmoothPath(points: [number, number][]) {
  const n = points.length;
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const [p0x, p0y] = points[(i - 1 + n) % n];
    const [p1x, p1y] = points[i];
    const [p2x, p2y] = points[(i + 1) % n];
    const [p3x, p3y] = points[(i + 2) % n];
    const c1x = p1x + (p2x - p0x) / 6;
    const c1y = p1y + (p2y - p0y) / 6;
    const c2x = p2x - (p3x - p1x) / 6;
    const c2y = p2y - (p3y - p1y) / 6;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2x.toFixed(2)},${p2y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/**
 * One trunk, one grain profile. Every ring is displaced by the same shared
 * wobble (in pixels, not as a percentage of radius) so the rings nest without
 * ever crossing — real growth rings never intersect. Integer frequencies wrap
 * seamlessly around the loop, so each ring closes without a seam.
 */
const GRAIN = (() => {
  const rand = mulberry32(777);
  const harmonics = [
    { f: 2, a: 5.5, p: rand() * Math.PI * 2 },
    { f: 3, a: 3.2, p: rand() * Math.PI * 2 },
    { f: 5, a: 1.8, p: rand() * Math.PI * 2 },
    { f: 8, a: 0.9, p: rand() * Math.PI * 2 },
  ];
  return Array.from({ length: SEGMENTS }, (_, i) => {
    const theta = (i / SEGMENTS) * Math.PI * 2;
    let w = 0;
    for (const { f, a, p } of harmonics) w += a * Math.sin(f * theta + p);
    return w;
  });
})();

function ringPath(scale: number, radius: number, dx: number, dy: number) {
  const points: [number, number][] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * Math.PI * 2;
    const r = radius + GRAIN[i] * scale;
    points.push([CX + dx + r * Math.cos(theta), CY + dy + r * Math.sin(theta)]);
  }
  return closedSmoothPath(points);
}

type Ring = { d: string; width: number; opacity: number; mix: number };

/**
 * `stroke` scales the line weights: the hero disc is drawn hairline, while the
 * logo-sized mark needs far heavier strokes and far fewer rings to stay legible
 * once the same 400-unit viewBox is squeezed into ~44px.
 */
function buildRings(count: number, stroke: number, seed: number, gapVariance = 1.05): Ring[] {
  const rand = mulberry32(seed);

  // Uneven gaps read as good years and lean years. The mark damps this down:
  // at logo scale, wildly uneven rings just collide into mush.
  const gaps = Array.from({ length: count }, () => 1 - gapVariance / 2 + rand() * gapVariance);
  const totalGap = gaps.reduce((a, b) => a + b, 0);

  const rings: Ring[] = [];
  let radius = PITH_R;

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // Inner rings sit off-center around the pith and recenter as they grow out.
    const falloff = (1 - t) ** 1.4;
    rings.push({
      // Grain strengthens a little toward the bark, but never enough to cross.
      d: ringPath(0.55 + 0.75 * t + rand() * 0.12, radius, PITH_DX * falloff, PITH_DY * falloff),
      // Latewood bands are denser and read heavier than earlywood.
      width: (0.7 + rand() * 1.5) * stroke,
      opacity: 0.3 + rand() * 0.45,
      // Heartwood holds its warmth through the inner half before the sapwood
      // cools to the brand blue, the way a real log's colour actually falls.
      mix: 10 + 88 * t ** 1.7,
    });
    radius += ((BARK_R - PITH_R) * gaps[i]) / totalGap;
  }

  return rings;
}

type Ray = { d: string; width: number; opacity: number };

/** Medullary rays and the radial checks that open as a cut log end dries. */
function buildRays(): Ray[] {
  const rand = mulberry32(98765);
  const rays: Ray[] = [];

  for (let i = 0; i < 7; i++) {
    const angle = rand() * Math.PI * 2;
    // Held off the pith and kept short, so they read as grain rather than spokes.
    const inner = PITH_R + 22 + rand() * 46;
    const outer = inner + 34 + rand() * 78;
    const bow = (rand() - 0.5) * 0.22;
    const midAngle = angle + bow;
    const midR = (inner + outer) / 2;
    rays.push({
      d:
        `M${(CX + inner * Math.cos(angle)).toFixed(2)},${(CY + inner * Math.sin(angle)).toFixed(2)}` +
        `Q${(CX + midR * Math.cos(midAngle)).toFixed(2)},${(CY + midR * Math.sin(midAngle)).toFixed(2)}` +
        ` ${(CX + outer * Math.cos(angle + bow * 2)).toFixed(2)},${(CY + outer * Math.sin(angle + bow * 2)).toFixed(2)}`,
      // One slightly heavier check, the split that opens as a cut end dries.
      width: i === 0 ? 1 : 0.45 + rand() * 0.35,
      opacity: i === 0 ? 0.26 : 0.1 + rand() * 0.1,
    });
  }

  return rays;
}

const RINGS = buildRings(RING_COUNT, 1, 20260731);
const RAYS = buildRays();
const BARK = ringPath(1.4, BARK_R, 0, 0);

/**
 * Logo variant. Six rings and ~7x stroke weight, so the same geometry survives
 * being scaled down to a 44px mark. Rays are dropped — at that size they are
 * noise, and the off-center pith is what keeps it reading as wood rather than
 * as a bullseye.
 */
const MARK_RING_COUNT = 4;
const MARK_RINGS = buildRings(MARK_RING_COUNT, 7, 515, 0.3);

const DRAW_STAGGER = 0.075;
const RAYS_DELAY = RING_COUNT * DRAW_STAGGER + 0.5;

const STYLES = `
@keyframes tr-draw { to { stroke-dashoffset: 0; } }
@keyframes tr-in { to { opacity: var(--tr-o); } }
@keyframes tr-turn { to { transform: rotate(360deg); } }

.tr-disc {
  transform-origin: ${CX}px ${CY}px;
  animation: tr-turn 200s linear infinite;
}
.tr-stroke {
  fill: none;
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  opacity: var(--tr-o);
  animation: tr-draw 1.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.tr-ray {
  fill: none;
  stroke-linecap: round;
  opacity: 0;
  animation: tr-in 1.4s ease-out both;
}
.tr-pith { opacity: 0; animation: tr-in 1.2s ease-out both; }

@media (prefers-reduced-motion: reduce) {
  .tr-disc { animation: none; }
  .tr-stroke { stroke-dashoffset: 0; animation: none; }
  .tr-ray, .tr-pith { opacity: var(--tr-o); animation: none; }
}
`;

export function TreeRings({ className }: { className?: string }) {
  return (
    <>
      <style>{STYLES}</style>
      <svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <g className="tr-disc">
          {RINGS.map((ring, i) => (
            <path
              key={i}
              d={ring.d}
              className="tr-stroke"
              style={{
                stroke: `color-mix(in oklab, var(--chart-3), var(--sidebar-primary) ${ring.mix}%)`,
                strokeWidth: ring.width,
                animationDelay: `${(i * DRAW_STAGGER).toFixed(3)}s`,
                ["--tr-o" as string]: ring.opacity.toFixed(2),
              }}
            />
          ))}

          {RAYS.map((ray, i) => (
            <path
              key={`ray-${i}`}
              d={ray.d}
              className="tr-ray"
              style={{
                stroke: "color-mix(in oklab, var(--chart-3), var(--sidebar-primary) 45%)",
                strokeWidth: ray.width,
                animationDelay: `${(RAYS_DELAY + i * 0.05).toFixed(3)}s`,
                ["--tr-o" as string]: ray.opacity.toFixed(2),
              }}
            />
          ))}

          <circle
            cx={CX + PITH_DX}
            cy={CY + PITH_DY}
            r="3.2"
            className="tr-pith"
            style={{
              fill: "var(--chart-3)",
              ["--tr-o" as string]: "0.85",
            }}
          />
        </g>

        {/* Bark edge stays fixed while the grain turns inside it. */}
        <path
          d={BARK}
          className="tr-stroke"
          style={{
            stroke: "var(--sidebar-primary)",
            strokeWidth: 2.5,
            animationDelay: `${(RING_COUNT * DRAW_STAGGER).toFixed(3)}s`,
            ["--tr-o" as string]: "0.9",
          }}
        />
      </svg>
    </>
  );
}

const MARK_STAGGER = 0.09;

/**
 * The same log end at logo scale. No rotation — it would be imperceptible at
 * this size — just the growth draw on load.
 */
export function TreeRingsMark({ className }: { className?: string }) {
  return (
    <>
      <style>{STYLES}</style>
      <svg viewBox="0 0 400 400" aria-hidden="true" focusable="false" className={className}>
        {MARK_RINGS.map((ring, i) => (
          <path
            key={i}
            d={ring.d}
            className="tr-stroke"
            style={{
              stroke: `color-mix(in oklab, var(--chart-3), var(--sidebar-primary) ${ring.mix}%)`,
              strokeWidth: ring.width,
              animationDelay: `${(i * MARK_STAGGER).toFixed(3)}s`,
              // Opaque at this size: thin translucent lines disappear on a 44px mark.
              ["--tr-o" as string]: "1",
            }}
          />
        ))}

        <path
          d={BARK}
          className="tr-stroke"
          style={{
            stroke: "var(--sidebar-primary)",
            strokeWidth: 15,
            animationDelay: `${(MARK_RING_COUNT * MARK_STAGGER).toFixed(3)}s`,
            ["--tr-o" as string]: "1",
          }}
        />

        <circle
          cx={CX + PITH_DX}
          cy={CY + PITH_DY}
          r="11"
          className="tr-pith"
          style={{ fill: "var(--chart-3)", ["--tr-o" as string]: "1" }}
        />
      </svg>
    </>
  );
}
