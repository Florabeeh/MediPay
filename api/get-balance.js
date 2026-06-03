const { API_KEY, CIRCLE } = require("./_helpers");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  const { walletId } = req.query;
  if (!walletId) return res.status(400).json({ error: "walletId required" });
  try {
    const response = await fetch(CIRCLE + "/v1/w3s/wallets/" + walletId + "/balances", {
      headers: { "Authorization": "Bearer " + API_KEY },
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    const amount = data?.data?.tokenBalances?.find(t => t.token?.symbol === "USDC")?.amount || "0.00";
    res.json({ amount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
// v2
