import {
  TREE_PATHS,
  TREE_STROKE_SCALE,
  TREE_TRANSFORM,
  TREE_VIEW_BOX,
} from "@/components/login/tree-paths";

/**
 * The supplied tree.svg artwork, drawn on a loop.
 *
 * The marks are the illustrator's own — line weights and the sketchy breaks
 * between strokes are preserved verbatim. Compound paths are split apart and
 * ordered bottom-to-top by `npm run tree`, and several pens draw at once at a
 * fixed speed, so the drawing rises from the ground up. It then holds, fades,
 * and starts again.
 *
 * This is intentionally a server component: the geometry is tens of kilobytes,
 * and keeping it out of a "use client" boundary means it renders as HTML and
 * never ships to the browser as JavaScript. The animation is pure CSS, so no
 * client runtime is needed either.
 */

/**
 * Line weight, relative to the source artwork. Traced (filled) art gets
 * outlined rather than centre-lined, which reads heavier than true stroke art,
 * so this trims it back. Raise toward 1 for a bolder line.
 */
const WEIGHT = 0.70;

// ── Timing ────────────────────────────────────────────────────────────────
/**
 * Pen speed, in user units per second — the only knob for pacing.
 *
 * Strokes are drawn one after another, so every duration is just its own
 * length / SPEED and the total falls out of the artwork. This drawing is
 * ${"`TREE_TOTAL_LENGTH`"} ≈ 26,900 units long, so 450 gives a ~60s draw;
 * 900 halves that, 225 doubles it.
 */
const SPEED = 200;

/** Fully drawn, before it starts to fade. Seconds. */
const HOLD = 7;
/** Fade out. Seconds. */
const FADE = 7;
/** Blank beat before it begins again. Seconds. */
const REST = 7;

/**
 * How many strokes are in flight at once. Two pens halve the draw time without
 * touching SPEED, so the linework is drawn at exactly the same rate.
 */
const PENS = 3;

const DURATIONS = TREE_PATHS.map(([, , length]) => length / SPEED);

/**
 * Marks arrive ordered bottom-to-top, and are taken in exactly that order —
 * each going to whichever pen is free soonest. So the drawing rises from the
 * ground up, with the pens working side by side at roughly the same height.
 *
 * Deliberately not re-sorted by length: taking the longest strokes first packs
 * the pens more evenly, but it scatters the drawing instead of sweeping it.
 */
const cursor = new Array<number>(PENS).fill(0);
const STARTS = DURATIONS.map((duration) => {
  let pen = 0;
  for (let k = 1; k < PENS; k++) if (cursor[k] < cursor[pen]) pen = k;
  const start = cursor[pen];
  cursor[pen] = start + duration;
  return start;
});
const DRAW = Math.max(...cursor);

const CYCLE = DRAW + HOLD + FADE + REST;

/** CSS keyframes are percentages of the cycle, so convert from seconds. */
const pct = (seconds: number) => (seconds / CYCLE) * 100;

/**
 * Strokes with near-identical windows share a keyframe track, so the CSS stays
 * a handful of rules rather than one per path.
 */
// Fine granularity matters: a coarse round would distort the very short
// strokes, whose whole window is a fraction of a percent of the cycle.
const round = (v: number) => Math.round(v * 100) / 100;
const trackOf = new Map<string, number>();
const TRACKS: { from: number; to: number }[] = [];
const PATH_TRACK = STARTS.map((start, i) => {
  const from = round(pct(start));
  const to = round(pct(start + DURATIONS[i]));
  const key = `${from}|${to}`;
  let index = trackOf.get(key);
  if (index === undefined) {
    index = TRACKS.length;
    trackOf.set(key, index);
    TRACKS.push({ from, to });
  }
  return index;
});

const FADED = pct(DRAW + HOLD + FADE);
// Rewind the geometry the instant the fade lands, while opacity is still 0.
// Browsers composite opacity off the main thread but stroke-dashoffset needs a
// repaint, so if both changed together at the loop boundary the opacity could
// land a frame early and flash the finished drawing. Rewinding here means only
// opacity changes at the wrap, and there is nothing drawn to show.
const REWIND = Math.min(FADED + 0.01, 100);

const KEYFRAMES = TRACKS.map(
  ({ from, to }, i) => `
@keyframes tree-${i} {
  0%, ${from.toFixed(2)}% { stroke-dashoffset: 1; opacity: 1; }
  ${to.toFixed(2)}%, ${pct(DRAW + HOLD).toFixed(2)}% { stroke-dashoffset: 0; opacity: 1; }
  ${FADED.toFixed(2)}% { stroke-dashoffset: 0; opacity: 0; }
  ${REWIND.toFixed(2)}%, 100% { stroke-dashoffset: 1; opacity: 0; }
}`,
).join("");

const STYLES = `
${KEYFRAMES}
.tree path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}
@media (prefers-reduced-motion: reduce) {
  .tree path {
    stroke-dashoffset: 0 !important;
    opacity: 1 !important;
    animation: none !important;
  }
}
`;

export function Redwood({ className }: { className?: string }) {
  return (
    <>
      <style>{STYLES}</style>
      <svg
        viewBox={TREE_VIEW_BOX}
        aria-hidden="true"
        focusable="false"
        className={`tree ${className ?? ""}`}
      >
        {/* The source artwork's own transform, reapplied verbatim. */}
        <g transform={TREE_TRANSFORM || undefined}>
          {TREE_PATHS.map(([d, width], i) => (
            <path
              key={i}
              d={d}
              pathLength={1}
              stroke="var(--sidebar-foreground)"
              strokeWidth={width * TREE_STROKE_SCALE * WEIGHT}
              style={{
                animation: `tree-${PATH_TRACK[i]} ${CYCLE}s linear infinite`,
              }}
            />
          ))}
        </g>
      </svg>
    </>
  );
}
