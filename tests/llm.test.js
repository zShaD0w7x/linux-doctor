import { test } from "node:test";
import assert from "node:assert/strict";
import { aiSummary } from "../src/llm.js";

test("aiSummary: returns null without an API key", async () => {
  const prev = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    assert.equal(await aiSummary([{ severity: "high", title: "x", detail: "d" }]), null);
  } finally {
    if (prev === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prev;
  }
});

test("aiSummary: sends an AbortSignal so a hung endpoint cannot block", async () => {
  const prevKey = process.env.LLM_API_KEY;
  const prevUrl = process.env.LLM_BASE_URL;
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_BASE_URL = "https://example.com/v1";

  let signal = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    signal = opts.signal;
    return { ok: true, json: async () => ({ choices: [{ message: { content: "healthy" } }] }) };
  };

  let text = null;
  try {
    text = await aiSummary([{ severity: "info", title: "All clear", detail: "" }]);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.LLM_BASE_URL;
    else process.env.LLM_BASE_URL = prevUrl;
  }

  assert.equal(text, "healthy");
  assert.ok(signal instanceof AbortSignal, "fetch must carry an abort signal");
});

test("aiSummary: falls back to null on network failure (never throws)", async () => {
  const prevKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "test-key";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  try {
    assert.equal(await aiSummary([{ severity: "high", title: "x" }]), null);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prevKey;
  }
});