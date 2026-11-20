import assert from "node:assert/strict";
import { test } from "node:test";
import { callGemini } from "../src/lib/engine/gemini";

/** fetch stub: per-model behaviour; "hang" waits until the request is aborted. */
function stub(behaviour: Record<string, "hang" | "ok" | "503">) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    const model = String(url).match(/models\/([^:]+):/)![1];
    calls.push(model);
    const b = behaviour[model];
    if (b === "hang")
      return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    if (b === "503") return Promise.resolve(new Response("overloaded", { status: 503 }));
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"findings":[]}' }] } }] }), { status: 200 }));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("a hung primary model hands over to the fallback model within the budget", async () => {
  process.env.GEMINI_API_KEY = "k";
  const s = stub({ "gemini-3.5-flash": "hang", "gemini-3.5-flash-lite": "ok" });
  try {
    const t = Date.now();
    const out = await callGemini("sys", "user", {}, 10000);
    assert.deepEqual(out, { findings: [] });
    assert.deepEqual(s.calls, ["gemini-3.5-flash", "gemini-3.5-flash-lite"]);
    assert.ok(Date.now() - t < 7000, "fallback starts after ~55% of the budget, not after all of it");
  } finally {
    s.restore();
  }
});

test("an overloaded primary (503) falls back immediately", async () => {
  process.env.GEMINI_API_KEY = "k";
  const s = stub({ "gemini-3.5-flash": "503", "gemini-3.5-flash-lite": "ok" });
  try {
    assert.deepEqual(await callGemini("sys", "user", {}, 10000), { findings: [] });
    assert.deepEqual(s.calls, ["gemini-3.5-flash", "gemini-3.5-flash-lite"]);
  } finally {
    s.restore();
  }
});

test("both models hanging gives a timeout error inside the budget", async () => {
  process.env.GEMINI_API_KEY = "k";
  const s = stub({ "gemini-3.5-flash": "hang", "gemini-3.5-flash-lite": "hang" });
  try {
    const t = Date.now();
    await assert.rejects(callGemini("sys", "user", {}, 8000), /timed out/);
    assert.ok(Date.now() - t < 9000);
  } finally {
    s.restore();
  }
});
