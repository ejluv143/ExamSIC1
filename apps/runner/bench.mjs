// Measures the runner's cost per language: `node bench.mjs` (needs Docker and the sandbox image).
// It starts its own runner on a spare port, runs a trivial program with 1 test and with 10 tests, and works out
//   per test = (time with 10 - time with 1) / 9     start-up (container, compile) = time with 1 - per test
// Compare these numbers with the time limits in server.mjs before adding a warm pool or per-test parallelism.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4199;
const SECRET = "bench-secret-bench-secret";
const REPEATS = Number(process.env.BENCH_REPEATS ?? 3);
const programs = {
  python: "print(input())",
  javascript: "console.log(require('fs').readFileSync(0, 'utf8').trim());",
  c: '#include <stdio.h>\nint main(){char s[100];fgets(s,100,stdin);printf("%s",s);return 0;}',
  cpp: '#include <iostream>\n#include <string>\nint main(){std::string s;std::getline(std::cin,s);std::cout<<s<<"\\n";}',
  java: "public class Main{public static void main(String[] a){System.out.println(new java.util.Scanner(System.in).nextLine());}}",
  php: "<?php echo trim(fgets(STDIN)), \"\\n\";",
};

const server = spawn(process.execPath, ["server.mjs"], {
  env: { ...process.env, PORT: String(PORT), RUNNER_SECRET: SECRET, RUNNER_CONCURRENCY: "1", OTEL_EXPORTER_OTLP_ENDPOINT: "" },
  stdio: "inherit",
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break;
  } catch {}
  await sleep(200);
}

const time = async (language, count) => {
  const tests = Array.from({ length: count }, (_, i) => ({ id: `t${i}`, input: `hello ${i}\n` }));
  const started = performance.now();
  const res = await fetch(`http://127.0.0.1:${PORT}/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ language, code: programs[language], tests }),
  });
  const body = await res.json();
  if (!body.results || body.results.some((r) => r.error)) throw new Error(`${language}: ${JSON.stringify(body).slice(0, 300)}`);
  return performance.now() - started;
};
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

try {
  console.log(`language   1 test (ms)  10 tests (ms)  per test (ms)  start-up (ms)   [median of ${REPEATS}]`);
  for (const language of Object.keys(programs)) {
    await time(language, 1); // warm the page cache and the image
    const one = [], ten = [];
    for (let i = 0; i < REPEATS; i++) {
      one.push(await time(language, 1));
      ten.push(await time(language, 10));
    }
    const [a, b] = [median(one), median(ten)];
    const perTest = Math.max(0, (b - a) / 9);
    console.log(`${language.padEnd(10)} ${a.toFixed(0).padStart(11)} ${b.toFixed(0).padStart(14)} ${perTest.toFixed(0).padStart(14)} ${(a - perTest).toFixed(0).padStart(14)}`);
  }
} finally {
  server.kill();
}
