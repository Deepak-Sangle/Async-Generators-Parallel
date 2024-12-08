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
  setting: number,
  numOfItems: number = 3
): AsyncGenerator<number, void, void> {
  console.log("making API call for setting ", setting);
  await sleep(setting * 100);
  console.log("API call completed for setting ", setting);
  let val = 0;
  for (let i = 0; i < numOfItems; i += 1) {
    yield setting * 100 + val;
    val += 10;
  }
}

test("Should give items for single generator", async () => {
  const settings = [1];
  const finalGenerator: AsyncGenerator<number, void, void> = consume(
    settings.map((s) => createAsyncGenerator(s)),
    {
      mode: "serially",
    }
  );

  expect(await getAllValuesFromGenerator(finalGenerator)).toEqual([
    100, 110, 120,
  ]);
});

test("Should give items serially", async () => {
  const settings = [1, 2, 3];
  const finalGenerator: AsyncGenerator<number, void, void> = consume(
    settings.map((s) => createAsyncGenerator(s)),
    {
      mode: "serially",
    }
  );

  expect(await getAllValuesFromGenerator(finalGenerator)).toEqual([
    // first values from each generator
    100, 200, 300,
    // second values from each gen
    110, 210, 310,
    // third values ...
    120, 220, 320,
  ]);
});

test("Should give items with unequal sizes", async () => {
  const settings = [1, 2, 3];
  const finalGenerator: AsyncGenerator<number, void, void> = consume(
    settings.map((s) => createAsyncGenerator(s, 3 - s)),
    {
      mode: "serially",
    }
  );

  // generators would emit values like
  // gen 1 => 100, 110
  // gen 2 => 200
  // gen 3 =>

  expect(await getAllValuesFromGenerator(finalGenerator)).toEqual([
    100, 200, 110,
  ]);
});
