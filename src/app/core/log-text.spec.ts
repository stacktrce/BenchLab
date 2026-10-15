import { describe, expect, it } from "vitest";
import { splitMatches, stripAnsi, tailLines } from "./log-text";

describe("stripAnsi", () => {
  it("removes colours, cursor moves and window titles", () => {
    expect(stripAnsi("\x1b[1mBenchmark\x1b[0m \x1b[1;32m1\x1b[0m")).toBe("Benchmark 1");
    expect(stripAnsi("a\x1b[2Kb\x1b[1Ac")).toBe("abc");
    expect(stripAnsi("\x1b]0;title\x07text")).toBe("text");
    expect(stripAnsi("\x1b]8;;http://x\x1b\\link\x1b]8;;\x1b\\")).toBe("link");
  });

  it("leaves plain text and newlines alone", () => {
    expect(stripAnsi("line 1\nline 2\r\n")).toBe("line 1\nline 2\r\n");
  });

  it("drops a lone escape at the end", () => {
    expect(stripAnsi("done\x1b")).toBe("done");
  });
});

describe("splitMatches", () => {
  it("marks every match, ignoring case", () => {
    expect(splitMatches("Time and time", "time")).toEqual([
      { text: "Time", match: true },
      { text: " and ", match: false },
      { text: "time", match: true },
    ]);
  });

  it("treats regex characters literally", () => {
    expect(splitMatches("a.b axb", ".")).toEqual([
      { text: "a", match: false },
      { text: ".", match: true },
      { text: "b axb", match: false },
    ]);
  });

  it("returns the whole text as one non-match for an empty query", () => {
    expect(splitMatches("abc", "")).toEqual([{ text: "abc", match: false }]);
    expect(splitMatches("", "x")).toEqual([]);
  });
});

describe("tailLines", () => {
  it("keeps the last lines without trailing blank ones", () => {
    expect(tailLines("1\n2\n3\n4\n\n", 2)).toBe("3\n4");
    expect(tailLines("only", 12)).toBe("only");
  });
});
