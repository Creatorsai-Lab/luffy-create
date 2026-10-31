/**
 * Rotating a box about its centre. Konva turns an element about its top-left
 * corner (x, y), so a typed-in rotation would swing the box away; this finds
 * the x, y that keep the centre where it is — as the canvas rotate handle does.
 */
export interface RotatedBox { x: number; y: number; width: number; height: number; rotation: number }

const rad = (deg: number) => (deg * Math.PI) / 180

/** The centre of a box rotated (degrees, clockwise) about its top-left corner. */
export function boxCenter(b: RotatedBox): [number, number] {
  const c = Math.cos(rad(b.rotation)), s = Math.sin(rad(b.rotation))
  return [b.x + (b.width / 2) * c - (b.height / 2) * s, b.y + (b.width / 2) * s + (b.height / 2) * c]
}

/** A rotation in −180…180. */
export function normalizeRotation(deg: number) {
  const r = ((deg % 360) + 360) % 360
  return r > 180 ? r - 360 : r
}

/** x, y and rotation for `box` turned to `rotation` degrees with its centre kept. */
export function rotateAboutCenter(box: RotatedBox, rotation: number): { x: number; y: number; rotation: number } {
  const [cx, cy] = boxCenter(box)
  const r = normalizeRotation(rotation)
  const c = Math.cos(rad(r)), s = Math.sin(rad(r))
  return { x: cx - (box.width / 2) * c + (box.height / 2) * s, y: cy - (box.width / 2) * s - (box.height / 2) * c, rotation: r }
}
