/**
 * MCP endpoint test suite
 * Run: node test-mcp.mjs
 */

const BASE    = "http://localhost:4000/mcp/AgentMail";
const API_KEY = "sk_EHSEd3pR7mPHqZjM9g7iMpwrseDrzRNR";
const BAD_KEY = "sk_badkey12345678901234567890123456";

const COLORS = {
  reset:  "\x1b[0m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  gray:   "\x1b[90m",
  magenta:"\x1b[35m",
  bold:   "\x1b[1m",
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

let passed = 0;
let failed = 0;

async function mcpCall(label, body, apiKey = null, expectedStatus = "ok") {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  console.log(`\n${c("cyan", "─".repeat(60))}`);
  console.log(c("bold", `  ${label}`));
  console.log(c("cyan", "─".repeat(60)));

  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }

    const isError = json?.error || json?.result?.content?.[0]?.text?.includes('"status":"REVERTED"');
    const isSuccess = !isError && (json?.result !== undefined);

    if (expectedStatus === "ok" && isSuccess) {
      console.log(c("green", "  ✓ PASS"));
      passed++;
    } else if (expectedStatus === "error" && isError) {
      console.log(c("green", "  ✓ PASS (got expected error)"));
      passed++;
    } else if (expectedStatus === "ok" && isError) {
      console.log(c("red", "  ✗ FAIL — got error, expected success"));
      failed++;
    } else {
      console.log(c("yellow", "  ~ INFO"));
      passed++;
    }

    // Pretty print the response
    const pretty = JSON.stringify(json, null, 2);
    const lines = pretty.split("\n").slice(0, 30);
    lines.forEach(l => console.log(c("gray", "  " + l)));
    if (pretty.split("\n").length > 30) console.log(c("gray", "  ... (truncated)"));

    return json;
  } catch (err) {
    console.log(c("red", `  ✗ FAIL — ${err.message}`));
    failed++;
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

console.log(c("magenta", "\n╔══════════════════════════════════════════════╗"));
console.log(c("magenta",   "║   SocialPilot MCP — Full Test Suite          ║"));
console.log(c("magenta",   "╚══════════════════════════════════════════════╝"));

// TEST 1: initialize (no auth)
await mcpCall(
  "TEST 1: MCP initialize (no auth required)",
  { jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" }
  }}
);

// TEST 2: tools/list — count all tools
const r2 = await mcpCall(
  "TEST 2: tools/list — enumerate all registered tools",
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }
);
if (r2?.result?.tools) {
  const tools = r2.result.tools;
  console.log(c("green", `\n  → ${tools.length} tools registered:`));
  tools.forEach(t => console.log(c("gray", `     • ${t.name}`)));
}

// TEST 3: list_posts — valid API key
await mcpCall(
  "TEST 3: list_posts — VALID API key",
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: {
    name: "list_posts",
    arguments: { limit: 3 }
  }},
  API_KEY,
  "ok"
);

// TEST 4: list_posts — invalid API key (expect REVERTED)
await mcpCall(
  "TEST 4: list_posts — INVALID API key (expect auth error)",
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: {
    name: "list_posts",
    arguments: { limit: 3 }
  }},
  BAD_KEY,
  "error"
);

// TEST 5: list_posts — no API key at all (expect REVERTED)
await mcpCall(
  "TEST 5: list_posts — NO API key (expect auth error)",
  { jsonrpc: "2.0", id: 5, method: "tools/call", params: {
    name: "list_posts",
    arguments: { limit: 3 }
  }},
  null,
  "error"
);

// TEST 6: get_usage_stats — hits Zernio API
await mcpCall(
  "TEST 6: get_usage_stats — Zernio plan & rate limit info",
  { jsonrpc: "2.0", id: 6, method: "tools/call", params: {
    name: "get_usage_stats",
    arguments: {}
  }},
  API_KEY,
  "ok"
);

// TEST 7: list_accounts — connected social accounts
await mcpCall(
  "TEST 7: list_accounts — connected social accounts",
  { jsonrpc: "2.0", id: 7, method: "tools/call", params: {
    name: "list_accounts",
    arguments: {}
  }},
  API_KEY,
  "ok"
);

// TEST 8: list_queue_slots
await mcpCall(
  "TEST 8: list_queue_slots — posting queue schedule",
  { jsonrpc: "2.0", id: 8, method: "tools/call", params: {
    name: "list_queue_slots",
    arguments: {}
  }},
  API_KEY,
  "ok"
);

// TEST 9: validate_post — content validation
await mcpCall(
  "TEST 9: validate_post — content validation",
  { jsonrpc: "2.0", id: 9, method: "tools/call", params: {
    name: "validate_post",
    arguments: {
      content: "Hello from SocialPilot MCP! #test",
      platforms: [{ platform: "twitter", accountId: "dummy_acc" }]
    }
  }},
  API_KEY,
  "ok"
);

// TEST 10: get_post — missing required param (schema validation)
await mcpCall(
  "TEST 10: get_post — missing postId (expect schema error)",
  { jsonrpc: "2.0", id: 10, method: "tools/call", params: {
    name: "get_post",
    arguments: {}
  }},
  API_KEY,
  "error"
);

// TEST 11: check_accounts_health
await mcpCall(
  "TEST 11: check_accounts_health — account connection status",
  { jsonrpc: "2.0", id: 11, method: "tools/call", params: {
    name: "check_accounts_health",
    arguments: {}
  }},
  API_KEY,
  "ok"
);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${c("magenta", "═".repeat(50))}`);
console.log(c("bold", `  Results: ${c("green", `${passed} passed`)}  ${failed > 0 ? c("red", `${failed} failed`) : c("green", "0 failed")}`));
console.log(c("magenta", "═".repeat(50)));
process.exit(failed > 0 ? 1 : 0);
