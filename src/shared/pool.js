// Bounded-concurrency task pool, pure, no I/O (ARCHITECTURE §2). Built once in S05 for the
// users/details N+1 fallback; S07's action pipeline reuses it instead of a second inline pool.
export async function runPool(items, worker, { concurrency = 4, shouldStop } = {}) {
  // Non-array input (e.g. an unchecked `result.data?.users` object shape) must not become
  // `new Array(undefined)` - that silently yields one phantom skipped item and an empty list.
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let nextIndex = 0;

  async function runLane() {
    for (;;) {
      if (shouldStop && shouldStop()) {
        // Checked before every dispatch: claim and mark the rest without ever calling worker().
        while (nextIndex < list.length) {
          results[nextIndex] = { nichtAusgefuehrt: true };
          nextIndex += 1;
        }
        return;
      }
      if (nextIndex >= list.length) return;
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(list[index], index);
      } catch (error) {
        // A throwing worker never aborts the pool; the error lands in this item's result.
        results[index] = { error };
      }
    }
  }

  const laneCount = Math.min(concurrency, list.length);
  await Promise.all(Array.from({ length: laneCount }, () => runLane()));
  return results;
}
