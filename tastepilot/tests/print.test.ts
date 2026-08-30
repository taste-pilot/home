import { afterEach, describe, expect, it } from "vitest";
import { deterministicTimestamp } from "../src/print/index.js";

const original = process.env.SOURCE_DATE_EPOCH;

afterEach(() => {
  if (original === undefined) delete process.env.SOURCE_DATE_EPOCH;
  else process.env.SOURCE_DATE_EPOCH = original;
});

describe("deterministicTimestamp", () => {
  it("is fixed when nothing is configured", () => {
    delete process.env.SOURCE_DATE_EPOCH;
    expect(deterministicTimestamp().getTime()).toBe(0);
    expect(deterministicTimestamp().getTime()).toBe(0);
  });

  it("honors SOURCE_DATE_EPOCH so a release can stamp a real date", () => {
    process.env.SOURCE_DATE_EPOCH = "1750000000";
    expect(deterministicTimestamp().getTime()).toBe(1_750_000_000_000);
  });

  it("ignores a malformed SOURCE_DATE_EPOCH rather than embedding garbage", () => {
    process.env.SOURCE_DATE_EPOCH = "not-a-number";
    expect(deterministicTimestamp().getTime()).toBe(0);
  });

  it("an explicit override wins over the environment", () => {
    process.env.SOURCE_DATE_EPOCH = "1750000000";
    const stamp = new Date("2001-02-03T04:05:06Z");
    expect(deterministicTimestamp(stamp)).toBe(stamp);
  });
});
