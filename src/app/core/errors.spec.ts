import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("returns a string as it is, which is how Tauri rejects", () => {
    expect(errorMessage("Run not found.")).toBe("Run not found.");
  });

  it("returns an Error's message without the 'Error: ' prefix", () => {
    expect(errorMessage(new Error("Invalid JSON"))).toBe("Invalid JSON");
  });

  it("falls back to the error's name when the message is empty", () => {
    expect(errorMessage(new TypeError(""))).toBe("TypeError");
  });

  it("reads the message of a plain object that has one", () => {
    expect(errorMessage({ message: "from a plugin" })).toBe("from a plugin");
  });

  it("describes other objects as JSON instead of [object Object]", () => {
    expect(errorMessage({ code: 5 })).toBe('{"code":5}');
  });

  it("does not throw on a circular object", () => {
    const loop: Record<string, unknown> = {};
    loop["self"] = loop;
    expect(errorMessage(loop)).toBe("[object Object]");
  });

  it("stringifies numbers, null and undefined", () => {
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });

  it("keeps a multi-line message intact so callers can split it", () => {
    expect(errorMessage("a\nb").split("\n")).toEqual(["a", "b"]);
  });
});
