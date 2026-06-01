const crypto = require("crypto");
const { makeCiphertext, getWalletSetId, API_KEY, CIRCLE } = require("./_helpers");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { refId } = req.body;
    console.log("[CreateWallet] Starting for:", refId);
    const walletSetId = await getWalletSetId();
    const entitySecretCiphertext = await makeCiphertext();
    const walletRes = await fetch(CIRCLE + "/v1/w3s/developer/wallets", {
      method: "POST",
      headers: { "Authorization": "Bearer " + API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        accountType: "SCA",
        blockchains: ["ARC-TESTNET"],
        count: 1,
        walletSetId,
        entitySecretCiphertext,
        metadata: [{ name: refId, refId }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const walletData = await walletRes.json();
    if (!walletRes.ok) return res.status(walletRes.status).json(walletData);
    const wallet = walletData?.data?.wallets?.[0];
    console.log("[CreateWallet] Success:", wallet?.id, wallet?.address);
    res.json({ wallet });
  } catch (e) {
    console.error("[CreateWallet Error]", e.message);
    res.status(500).json({ error: e.message });
  }
}
