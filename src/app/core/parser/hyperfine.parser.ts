import {
  CaseResult,
  BenchmarkResult,
  CaseMetrics,
  HyperfineParseError,
} from "./hyperfine.types";
import { errorMessage } from "../errors";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const numArray = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => num(x) !== null) : [];

/**
 * Parses the output of `hyperfine --export-json`.
 * Optional fields (stddev, user, system, memory, exit codes, parameters) may be
 * absent across hyperfine versions; required ones (command, mean, median, min, max)
 * make the whole parse fail with a HyperfineParseError naming the offending case.
 */
export function parseHyperfineJSON(json: string): BenchmarkResult {
  let root: unknown;
  try {
    root = JSON.parse(json);
  } catch (e) {
    throw new HyperfineParseError(`Invalid JSON: ${errorMessage(e)}`);
  }
  if (!isObject(root) || !Array.isArray(root["results"])) {
    throw new HyperfineParseError('Missing "results" array');
  }
  if (root["results"].length === 0) {
    throw new HyperfineParseError('"results" is empty');
  }
  return { cases: root["results"].map(parseCase) };
}

function parseCase(raw: unknown, index: number): CaseResult {
  if (!isObject(raw)) {
    throw new HyperfineParseError(`results[${index}] is not an object`);
  }
  const command = raw["command"];
  if (typeof command !== "string") {
    throw new HyperfineParseError(`results[${index}]: missing "command"`);
  }
  const required = (key: string): number => {
    const v = num(raw[key]);
    if (v === null) {
      throw new HyperfineParseError(
        `results[${index}] ("${command}"): missing or invalid "${key}"`,
      );
    }
    return v;
  };

  const exitCodes = Array.isArray(raw["exit_codes"])
    ? raw["exit_codes"].map(num)
    : [];

  const metrics: CaseMetrics = {
    mean: required("mean"),
    median: required("median"),
    min: required("min"),
    max: required("max"),
    // hyperfine emits null stddev for a single run
    stddev: num(raw["stddev"]),
    user: num(raw["user"]),
    system: num(raw["system"]),
    times: numArray(raw["times"]),
    exitCodes,
    memoryUsageBytes: numArray(raw["memory_usage_byte"]),
  };

  const parameters: Record<string, string> = {};
  if (isObject(raw["parameters"])) {
    for (const [k, v] of Object.entries(raw["parameters"])) {
      parameters[k] = String(v);
    }
  }

  return {
    command,
    parameters,
    metrics,
    hasFailedRuns: exitCodes.some((c) => c !== 0),
  };
}
