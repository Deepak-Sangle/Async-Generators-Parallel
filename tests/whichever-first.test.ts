import { consume } from "../src";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAllValuesFromGenerator<T>(
  generator: AsyncGenerator<T, void, void>
): Promise<T[]> {
  let values: T[] = [];
  for await (const value of generator) {
    values.push(value);
  }
  return values;
}

async function* createAsyncGenerator(
  setting: number
): AsyncGenerator<number, void, void> {
  console.log("making API call for setting ", setting);
  await sleep(setting * 100);
  console.log("API call completed for setting ", setting);
  yield setting * 100;
  yield setting * 100 + 10;
  yield setting * 100 + 20;
}

test("Should work correctly with single generator", async () => {
  const settings = [1];
  const finalGenerator: AsyncGenerator<number, void, void> = consume(
    settings.map((s) => createAsyncGenerator(s)),
    {
      concurrency: 3,
      mode: "whichever-first",
    }
  );

  expect(await getAllValuesFromGenerator(finalGenerator)).toEqual([
    100, 110, 120,
  ]);
});

test("Should work correctly with multiple generator", async () => {
  const settings = [1, 2];
  const finalGenerator: AsyncGenerator<number, void, void> = consume(
    settings.map((s) => createAsyncGenerator(s)),
    {
      concurrency: 3,
      mode: "whichever-first",
    }
  );

  expect(await getAllValuesFromGenerator(finalGenerator)).toEqual([
    100, 110, 120, 200, 210, 220,
  ]);
});

test("Should return the items from the generator which gives items faster", async () => {
  // if we reverse the settings, the second generator would finish before the first one
  // even tho the first generator was started before the second one (bcz we wait for "setting*100" ms.)

  const reverseSettings = [2, 1];
  // these are the chronological order

  // generator 2 starts
  // generator 1 starts
  // generator 1 finishes
  // generator 1 gives first result
  // generator 1 gives second result
  // generator 1 gives third result
  // generator 2 finishes
  // generator 2 gives first result
  // generator 2 gives second result
  // generator 2 gives third result
  const finalGeneratorReverse: AsyncGenerator<number, void, void> = consume(
    reverseSettings.map((s) => createAsyncGenerator(s)),
    {
      concurrency: 3,
      mode: "whichever-first",
    }
  );

  expect(await getAllValuesFromGenerator(finalGeneratorReverse)).toEqual([
    100, 110, 120, 200, 210, 220,
  ]);
});

// similar to above function, but with more await sleep calls
async function* createAsyncGeneratorComplex(
  setting: number
): AsyncGenerator<number, void, void> {
  console.log("making API call for setting ", setting);
  await sleep(setting * 100);
  console.log("API call completed for setting ", setting);
  // now yield 3 items from this elastic query
  yield setting * 100;
  yield setting * 100 + 10;
  yield setting * 100 + 20;

  // now again make another call
  console.log("making API call for setting ", setting);
  await sleep(setting * 500); // wait for a lot more this time
  console.log("API call completed for setting", setting);
  // now yield 3 items from this elastic query
  yield setting * 100 + 30;
  yield setting * 100 + 40;
  yield setting * 100 + 50;
}

test("Should be able to handle multiple await calls inside each generator", async () => {
  const settings = [1, 2];
  const finalGenerator: AsyncGenerator<number, void, void> = consume(
    settings.map((s) => createAsyncGeneratorComplex(s)),
    {
      concurrency: 3,
      mode: "whichever-first",
    }
  );

  expect(await getAllValuesFromGenerator(finalGenerator)).toEqual([
    // first call from first generator  (after 100 ms)
    100, 110, 120,
    // first call from second generator (after 200 ms)
    200, 210, 220,
    // second call from first generator (after 500 ms)
    130, 140, 150,
    // second call from first generator (after 1000 ms)
    230, 240, 250,
  ]);
});

test("Should yield items whichever comes first from any generator", async () => {
  const settings = [2, 1];
  // gen 2 starts (time t0)
  // gen 1 starts (time t0)
  // 100 ms completed (time t0 + 100ms)
  // gen 1 yields 3 items (time t0 + 100ms)
  // 200 ms completed (time t0 + 200ms)
  // gen 2 yields 3 items (time t0 + 200ms)
  // 500 ms completed (time t0 + 500ms)
  // gen1 yields 3 items again (time t0 + 500ms)
  // 1000 ms completed (time t0 + 1000ms)
  // gen2 yields 3 items again (time t0 + 1000ms)
  const finalGenerator: AsyncGenerator<number, void, void> = consume(
    settings.map((s) => createAsyncGeneratorComplex(s)),
    {
      concurrency: 3,
      mode: "whichever-first",
    }
  );

  expect(await getAllValuesFromGenerator(finalGenerator)).toEqual([
    // first call from first generator  (after 100 ms)
    100, 110, 120,
    // first call from second generator (after 200 ms)
    200, 210, 220,
    // second call from first generator (after 500 ms)
    130, 140, 150,
    // second call from first generator (after 1000 ms)
    230, 240, 250,
  ]);
});

test("Should work correctly if one query takes a long time but other are quicker", async () => {
  const settings = [10, 1, 3, 2];
  // the first one would take 10 * 100 ms to return the first three items
  // whereas the second and third would return 1 * 100 ms and 2 * 100 ms respectively
  const finalGenerator: AsyncGenerator<number, void, void> = consume(
    settings.map((s) => createAsyncGenerator(s)),
    {
      concurrency: 6,
      mode: "whichever-first",
    }
  );

  expect(await getAllValuesFromGenerator(finalGenerator)).toEqual([
    // gen 2 results
    100, 110, 120,
    // gen 4 results
    200, 210, 220,
    // gen 3 results
    300, 310, 320,
    // gen 1 results
    1000, 1010, 1020,
  ]);
});
