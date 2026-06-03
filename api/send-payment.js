const crypto = require("crypto");
const { makeCiphertext, API_KEY, CIRCLE } = require("./_helpers");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { fromWalletId, toAddress, amount, blockchain } = req.body;
  try {
    const ciphertext = await makeCiphertext();
    const response = await fetch(CIRCLE + "/v1/w3s/developer/transactions/transfer", {
      method: "POST",
      headers: { "Authorization": "Bearer " + API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        walletId: fromWalletId,
        blockchain: blockchain || "ARC-TESTNET",
        tokenAddress: "0x3600000000000000000000000000000000000000",
        destinationAddress: toAddress,
        amounts: [String(amount)],
        feeLevel: "MEDIUM",
        entitySecretCiphertext: ciphertext,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
