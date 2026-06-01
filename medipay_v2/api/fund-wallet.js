const crypto = require("crypto");
const { API_KEY, CIRCLE } = require("./_helpers");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { address } = req.body;
  console.log("[Faucet] Funding:", address);
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
  } catch (e) { console.log("[Faucet] Circle API error:", e.message); }
  try {
    const r2 = await fetch("https://faucet.circle.com/api/faucet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, blockchain: "ARC-TESTNET", usdc: true }),
      signal: AbortSignal.timeout(20000),
    });
    const d2 = await r2.json();
    if (r2.ok) return res.json(d2);
  } catch (e) { console.log("[Faucet] Public faucet error:", e.message); }
  res.status(403).json({ message: "Faucet rate limited — use faucet.circle.com manually" });
}
