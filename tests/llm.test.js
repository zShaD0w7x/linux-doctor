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

test("aiSummary: redacts IPs and home paths before sending to the LLM", async () => {
  const prevKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "test-key";
  let body = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    body = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };
  try {
    await aiSummary([
      { severity: "high", title: "Disk at 192.168.1.50:/home/alice/mount is full", detail: "route via 10.0.0.1 · log at /home/alice/.local/share/app.log" },
      { severity: "info", title: "Fine", detail: "nothing sensitive here" },
    ]);
  } finally {
    globalThis.fetch = origFetch;
    if (prevKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prevKey;
  }
  const content = body.messages[0].content;
  assert.ok(!content.includes("192.168.1.50"), "finding text must not leak an IPv4 address to the LLM");
  assert.ok(!content.includes("10.0.0.1"), "finding text must not leak a second IPv4 address");
  assert.ok(!content.includes("/home/alice"), "finding text must not leak a /home/<user> path");
  assert.match(content, /<ip-redacted>/);
  assert.match(content, /<user-redacted>/);
  assert.match(content, /nothing sensitive here/, "benign text passes through untouched");
});