// Scripted stand-in for the Gemini generateContent API. FOR TESTING ONLY: it is not an AI.
// It records every request body (to prove what would be sent to Google) and answers with
// deterministic, schema-valid JSON:
//  - draft checks: flags superlatives and any sentence containing a masking placeholder, quoting the
//    masked text exactly as the real model is instructed to;
//  - vision: returns the demo poster's known text regions, an alt-text suggestion and "no logo".
// Usage: PORT=54400 LOG=/tmp/gemini-requests.jsonl node tests/e2e/mock-gemini.mjs
import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT || 54400);
const LOG = process.env.LOG || "/tmp/gemini-requests.jsonl";
fs.writeFileSync(LOG, "");

function draftOf(prompt) {
  const m = prompt.match(/<<<DRAFT\n([\s\S]*?)\nDRAFT>>>/);
  return m ? m[1] : "";
}

function check(prompt) {
  const draft = draftOf(prompt);
  const findings = [];
  for (const m of draft.matchAll(/\b(the best|number one|world[- ]class)\b[^.!?\n]*/gi)) {
    findings.push({ quote: m[0], source_id: "CLAIM-1", explanation: "Stub: a superlative claim with no source in the Fact Vault.", suggestion: m[0].replace(/the best|number one|world[- ]class/i, "a helpful"), severity: "high" });
  }
  for (const m of draft.matchAll(/[^.!?\n]*\[\[PRODUCT_\d+_[a-z0-9]+\]\][^.!?\n]*/g)) {
    findings.push({ quote: m[0].trim(), source_id: "MSG-2", explanation: "Stub: this announces an unreleased product.", suggestion: "More study features are on the way", severity: "high" });
  }
  // A deliberately ungrounded answer, to exercise the grounding gate.
  findings.push({ quote: "This sentence is not in the draft.", source_id: "CLAIM-1", explanation: "Stub hallucination", suggestion: "x", severity: "low" });
  return { findings };
}

function vision() {
  return {
    alt_text: "Poster announcing Lumio Premium with the line 'Offer ends Sunday' above magenta and indigo bands",
    text_blocks: [
      { text: "Lumio Premium is here", box_2d: [60, 60, 180, 940] },
      { text: "Offer ends Sunday", box_2d: [230, 60, 300, 640] },
    ],
    logo: { logo_label: "NONE", confidence: "high", note: "Stub: no reference logo visible." },
  };
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      let body = {};
      try { body = JSON.parse(raw); } catch {}
      const parts = body?.contents?.[0]?.parts ?? [];
      const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
      const kind = text.includes("TARGET IMAGE") ? "vision" : text.includes("GUIDELINE DOCUMENT") ? "extract" : "check";
      // Log the text parts in full; images are logged by size only.
      fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), kind, text, system: body?.systemInstruction?.parts?.[0]?.text?.slice(0, 80), images: parts.filter((p) => p.inlineData).map((p) => p.inlineData.data.length) }) + "\n");
      const payload = kind === "vision" ? vision() : kind === "extract" ? { rules: [] } : check(text);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }] }));
    });
  })
  .listen(PORT, () => console.log(`mock gemini on :${PORT}, logging to ${LOG}`));
