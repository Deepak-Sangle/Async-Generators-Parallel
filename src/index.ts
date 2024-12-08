export type ConsumeSettings =
  | {
      mode: "whichever-first";
      concurrency?: number;
    }
  | {
      mode: "serially";
    }
  | {
      mode: "concat";
    };

/**
 * consume a set of generators in parallel.
 * @param generators an array of async iterables
 * @param setting
 * `modes:`
 *  - `whichever-first` yields a value as soon as it is available.
 *  - `serially` allows each generator to yield 1 result at a time and yield them as the order in which they were passed.
 *  - `concat` is used when you want the first generator to exhaust entirely and then only start the next generator.
 * `concurrency`
 *  - it is currently only supported for `whichever-first` mode, largely because, for other modes, concurrency would get confusing and have different meaning for different users
 */
export async function* consume<T>(
  generators: AsyncGenerator<T>[],
  setting: ConsumeSettings
): AsyncGenerator<T> {
  const getConcurrency = (): number => {
    switch (setting.mode) {
      case "whichever-first":
        return setting.concurrency ?? Infinity;
      case "serially":
        return Infinity;
      case "concat":
        return 1;
    }
  };

  const concurrency: number = getConcurrency();

  type GeneratorPromise = {
    done: boolean;
    value: T | null;
    generator: AsyncGenerator<T>;
    promise: Promise<GeneratorPromise>;
  };

  const next = (generator: AsyncGenerator<T>): Promise<GeneratorPromise> => {
    const generatorPromise: Promise<IteratorResult<T>> = generator.next();
    const promise: Promise<GeneratorPromise> = generatorPromise.then(
      ({ done, value }): GeneratorPromise => ({
        done: done ?? false,
        value: value ?? null,
        generator,
        promise,
      })
    );
    return promise;
  };

  const consumeWhicheverFirst = async (): Promise<T[]> => {
    const { done, value, generator, promise } = await Promise.race(promises);
    promises.delete(promise);

    if (!done) {
      promises.add(next(generator));
      return value == null ? [] : [value];
    }
    return [];
  };

  const consumeSerially = async (): Promise<T[]> => {
    const promisesAndGens: GeneratorPromise[] = await Promise.all(promises);
    promises.clear();
    for (const promiseAndGen of promisesAndGens) {
      if (!promiseAndGen.done) {
        promises.add(next(promiseAndGen.generator));
      }
    }
    return promisesAndGens.reduce((acc: T[], prevVal: GeneratorPromise) => {
      if (prevVal.value != null) {
        acc.push(prevVal.value);
      }
      return acc;
    }, []);
  };

  async function* consumeByMode(): AsyncGenerator<T> {
    const latestResult: T[] =
      setting.mode === "serially"
        ? await consumeSerially()
        : await consumeWhicheverFirst();

    for (const result of latestResult) {
      yield result;
    }
  }

  const promises: Set<Promise<GeneratorPromise>> = new Set();
  for (const gen of generators) {
    promises.add(next(gen));
    while (promises.size >= concurrency) {
      yield* consumeByMode();
    }
  }

  while (promises.size > 0) {
    yield* consumeByMode();
  }
}
