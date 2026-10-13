let failures = 0;

export function check(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures++;
}

export const failureCount = () => failures;
