import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
  });
}

/** Names in `tauri::generate_handler![...]`: the last path segment of each entry. */
function registeredCommands(): string[] {
  const lib = readFileSync(join(root, "src-tauri", "src", "lib.rs"), "utf8");
  const list = /generate_handler!\[([\s\S]*?)\]/.exec(lib)?.[1] ?? "";
  return list
    .split(",")
    .map((entry) => entry.trim().split("::").pop() ?? "")
    .filter(Boolean);
}

/** String literals passed as the first argument to `invoke(...)`, including `invoke<T>(...)`. */
function invokedCommands(): string[] {
  const names = new Set<string>();
  for (const file of sourceFiles(join(root, "src", "app"))) {
    for (const match of readFileSync(file, "utf8").matchAll(/invoke(?:<[^(]*>)?\(\s*"([a-z_]+)"/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

function mockedCommands(): string[] {
  const mock = readFileSync(join(root, "scripts", "ui-audit", "mock-tauri.mjs"), "utf8");
  return [...mock.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]).sort();
}

describe("IPC contract between the Angular app and the Rust backend", () => {
  const registered = registeredCommands();
  const invoked = invokedCommands();

  it("finds both lists (a broken extraction must not pass vacuously)", () => {
    expect(registered.length).toBeGreaterThan(10);
    expect(invoked.length).toBeGreaterThan(10);
  });

  it("every command the frontend invokes is registered in Rust", () => {
    expect(invoked.filter((name) => !registered.includes(name))).toEqual([]);
  });

  it("every registered command is used by the frontend", () => {
    expect(registered.filter((name) => !invoked.includes(name))).toEqual([]);
  });

  it("the audit mock only answers commands that exist", () => {
    expect(mockedCommands().filter((name) => !registered.includes(name))).toEqual([]);
  });
});
