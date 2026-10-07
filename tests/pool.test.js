// S05 A3 Abnahme 4: Parallelität, Reihenfolge, Vollständigkeit, Fehlertoleranz, shouldStop.
import { describe, expect, it } from 'vitest';
import { runPool } from '../src/shared/pool.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('runPool', () => {
  it('hat nie mehr als 4 Worker gleichzeitig in Flug', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await runPool(
      items,
      async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(15);
        inFlight -= 1;
        return item;
      },
      { concurrency: 4 },
    );
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBe(4);
  });

  it('liefert Ergebnisse in Eingabereihenfolge, auch wenn spätere Items zuerst abschließen', async () => {
    const items = [0, 1, 2, 3];
    const delays = [30, 20, 10, 0]; // item 0 finishes last, item 3 finishes first
    const results = await runPool(
      items,
      async (item) => {
        await delay(delays[item]);
        return item * 10;
      },
      { concurrency: 4 },
    );
    expect(results).toEqual([0, 10, 20, 30]);
  });

  it('verarbeitet jedes Item genau einmal', async () => {
    const items = Array.from({ length: 9 }, (_, i) => i);
    const seen = [];
    await runPool(
      items,
      async (item) => {
        seen.push(item);
        await delay(1);
        return item;
      },
      { concurrency: 3 },
    );
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it('ein werfender Worker bricht den Pool nicht ab, der Fehler landet im Ergebnis dieses Items', async () => {
    const boom = new Error('boom');
    const results = await runPool(
      [0, 1, 2],
      async (item) => {
        if (item === 1) throw boom;
        return item;
      },
      { concurrency: 2 },
    );
    expect(results[0]).toBe(0);
    expect(results[1]).toEqual({ error: boom });
    expect(results[2]).toBe(2);
  });

  it('shouldStop wahr nach Item 3 verbucht den Rest als nichtAusgefuehrt', async () => {
    let dispatched = 0;
    const shouldStop = () => dispatched >= 3;
    const items = [0, 1, 2, 3, 4];
    const results = await runPool(
      items,
      async (item) => {
        dispatched += 1;
        return item;
      },
      { concurrency: 1, shouldStop },
    );
    expect(results.slice(0, 3)).toEqual([0, 1, 2]);
    expect(results.slice(3)).toEqual([{ nichtAusgefuehrt: true }, { nichtAusgefuehrt: true }]);
  });

  // Produktion läuft mit concurrency 4 (ARCHITECTURE §5/§7); der concurrency-1-Test oben beweist
  // den Stop-Mechanismus nicht für mehrere gleichzeitige Lanes.
  it('shouldStop bei concurrency 4 verhindert Dispatch für den Rest, nicht nur für die eigene Lane', async () => {
    let dispatched = 0;
    const shouldStop = () => dispatched >= 3;
    const items = Array.from({ length: 10 }, (_, i) => i);
    const results = await runPool(
      items,
      async (item) => {
        dispatched += 1;
        await delay(5);
        return item;
      },
      { concurrency: 4, shouldStop },
    );
    expect(results.slice(0, 3)).toEqual([0, 1, 2]);
    expect(results.slice(3)).toEqual(Array(7).fill({ nichtAusgefuehrt: true }));
    expect(dispatched).toBe(3); // nothing dispatched after the flag flipped
  });

  it('nicht-array-artige items ergeben eine leere Ergebnisliste statt new Array(undefined)', async () => {
    const results = await runPool(undefined, async (item) => item, { concurrency: 4 });
    expect(results).toEqual([]);
  });
});
