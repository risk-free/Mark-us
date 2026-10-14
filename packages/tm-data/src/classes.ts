/**
 * Nice classification adjacency (P5.3).
 *
 * Trademark conflicts cluster by the **relatedness of the goods/services**, which
 * the Nice class codes approximate. The group table below is a curated heuristic
 * (a data judgement, tunable without a model-version change — it feeds a feature,
 * not a score): classes in the same group are "related" (distance 1), identical
 * classes are distance 0, everything else is distance 2. It is deliberately
 * conservative and is expected to be refined against attorney spot-checks.
 */

/** Nice classes commonly cited together as similar goods/services. */
export const NICE_RELATED_GROUPS: ReadonlyArray<readonly number[]> = [
  [1, 5], // industrial chemicals <-> pharmaceuticals
  [3, 5, 10], // cosmetics/hygiene <-> pharma <-> medical devices
  [3, 44], // cosmetics <-> beauty/medical services
  [5, 10, 44], // pharma <-> medical devices <-> medical services
  [9, 28, 41], // software <-> games <-> entertainment (interactive media)
  [9, 35, 42], // software/electronics <-> retail <-> technology services
  [9, 16, 41], // software/publishing <-> printed matter <-> education
  [16, 35, 41], // printed matter <-> advertising <-> education
  [18, 25, 35], // leather goods <-> clothing <-> retail
  [24, 25, 26], // fabrics <-> clothing <-> lace/embroidery
  [29, 30, 31, 32, 33], // staple foods, coffee/tea, produce, beverages
  [29, 30, 43], // foods <-> food-service
  [33, 35], // alcoholic beverages <-> retail
  [36, 45], // insurance/finance <-> legal/personal services
  [38, 42], // telecommunications <-> technology services
  [41, 42, 45], // education <-> technology <-> legal/personal services
];

const groupsByClass = ((): ReadonlyMap<number, ReadonlySet<number>> => {
  const index = new Map<number, Set<number>>();
  NICE_RELATED_GROUPS.forEach((group, groupId) => {
    for (const niceClass of group) {
      const memberships = index.get(niceClass) ?? new Set<number>();
      memberships.add(groupId);
      index.set(niceClass, memberships);
    }
  });
  return index;
})();

const sharesGroup = (a: number, b: number): boolean => {
  const left = groupsByClass.get(a);
  if (left === undefined) return false;
  for (const groupId of left) {
    if (NICE_RELATED_GROUPS[groupId]!.includes(b)) return true;
  }
  return false;
};

export interface ClassAdjacency {
  related: boolean;
  /** 0 identical, 1 related, 2 unrelated. */
  distance: number;
}

/** Parse a Nice class code (number or numeric string like `"025"`) to `1..45`. */
export function normalizeClass(code: number | string): number | null {
  const value = typeof code === "string" ? Number.parseInt(code.trim(), 10) : code;
  if (!Number.isInteger(value) || value < 1 || value > 45) return null;
  return value;
}

/** Adjacency between two Nice classes; invalid input is treated as unrelated. */
export function classAdjacency(a: number, b: number): ClassAdjacency {
  const left = normalizeClass(a);
  const right = normalizeClass(b);
  if (left === null || right === null) return { related: false, distance: 2 };
  if (left === right) return { related: true, distance: 0 };
  if (sharesGroup(left, right)) return { related: true, distance: 1 };
  return { related: false, distance: 2 };
}

export function areRelatedClasses(a: number, b: number): boolean {
  return classAdjacency(a, b).related;
}

/**
 * Smallest adjacency distance from `a` to any class in `classes` (2 when the
 * list is empty or has no valid class).
 */
export function closestClassDistance(a: number, classes: readonly number[]): number {
  let best = 2;
  for (const candidate of classes) {
    const { distance } = classAdjacency(a, candidate);
    if (distance < best) best = distance;
    if (best === 0) break;
  }
  return best;
}
