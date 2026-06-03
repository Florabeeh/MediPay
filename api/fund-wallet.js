const crypto = require("crypto");
const { API_KEY, CIRCLE } = require("./_helpers");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { address } = req.body;
  try {
    const r1 = await fetch(CIRCLE + "/v1/faucet/drips", {
      method: "POST",
      headers: { "Authorization": "Bearer " + API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), address, blockchain: "ARC-TESTNET", usdc: true }),
      signal: AbortSignal.timeout(30000),
    });
    const d1 = await r1.json();
    if (r1.ok) return res.json(d1);
    if (r1.status === 429) return res.json({ status: "rate_limited" });
  } catch (e) { console.log("[Faucet] error:", e.message); }
  res.status(403).json({ message: "Faucet rate limited — use faucet.circle.com manually" });
};
