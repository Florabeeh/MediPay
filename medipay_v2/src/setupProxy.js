const { createProxyMiddleware } = require("http-proxy-middleware");
const crypto = require("crypto");

const API_KEY = process.env.REACT_APP_CIRCLE_API_KEY || "";
const ENTITY_SECRET = process.env.REACT_APP_ENTITY_SECRET || "";
const CIRCLE = "https://api.circle.com";

let cachedWalletSetId = null;

// ── Helper: generate fresh RSA-OAEP ciphertext server-side ──────────────────
async function makeCiphertext() {
  const pkRes = await fetch(CIRCLE + "/v1/w3s/config/entity/publicKey", {
    headers: { "Authorization": "Bearer " + API_KEY },
    signal: AbortSignal.timeout(15000),
  });
  const pkData = await pkRes.json();
  const pem = pkData?.data?.publicKey;
  if (!pem) throw new Error("No public key: " + JSON.stringify(pkData));

  const secretBytes = Buffer.from(ENTITY_SECRET.replace(/^0x/, ""), "hex");
  const encrypted = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    secretBytes
  );
  return encrypted.toString("base64");
}

// ── Helper: get or create wallet set ────────────────────────────────────────
async function getWalletSetId() {
  if (cachedWalletSetId) return cachedWalletSetId;

  // Try fetching existing wallet sets first
  try {
    const res = await fetch(CIRCLE + "/v1/w3s/developer/walletSets", {
      headers: { "Authorization": "Bearer " + API_KEY },
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    const sets = data?.data?.walletSets;
    if (sets && sets.length > 0) {
      cachedWalletSetId = sets[0].id;
      console.log("[WalletSet] Using existing:", cachedWalletSetId);
      return cachedWalletSetId;
    }
  } catch (e) {
    console.log("[WalletSet] Could not fetch existing:", e.message);
  }

  // Create a new wallet set
  const ciphertext = await makeCiphertext();
  const res = await fetch(CIRCLE + "/v1/w3s/developer/walletSets", {
    method: "POST",
    headers: { "Authorization": "Bearer " + API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      name: "medipay-patients",
      entitySecretCiphertext: ciphertext,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("WalletSet creation failed: " + JSON.stringify(data));
  cachedWalletSetId = data?.data?.walletSet?.id;
  console.log("[WalletSet] Created new:", cachedWalletSetId);
  return cachedWalletSetId;
}

module.exports = function (app) {
  app.use(require("express").json());

  // ── /get-ciphertext ─────────────────────────────────────────────────────────
  app.get("/get-ciphertext", async (req, res) => {
    try {
      if (!API_KEY) return res.status(400).json({ error: "REACT_APP_CIRCLE_API_KEY not set" });
      if (!ENTITY_SECRET) return res.status(400).json({ error: "REACT_APP_ENTITY_SECRET not set" });
      const ciphertext = await makeCiphertext();
      console.log("[Ciphertext] Generated OK");
      res.json({ ciphertext });
    } catch (e) {
      console.error("[Ciphertext Error]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── /create-wallet ──────────────────────────────────────────────────────────
  // Full server-side wallet creation — avoids all proxy timeout issues
  app.post("/create-wallet", async (req, res) => {
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
      if (!walletRes.ok) {
        console.error("[CreateWallet] Failed:", JSON.stringify(walletData));
        return res.status(walletRes.status).json(walletData);
      }

      const wallet = walletData?.data?.wallets?.[0];
      console.log("[CreateWallet] Success:", wallet?.id, wallet?.address);
      res.json({ wallet });
    } catch (e) {
      console.error("[CreateWallet Error]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── /fund-wallet ─────────────────────────────────────────────────────────────
  // Tries Circle's public faucet (no auth needed for EOA/external wallets)
  app.post("/fund-wallet", async (req, res) => {
    const { address } = req.body;
    console.log("[Faucet] Funding:", address);

    // SCA wallets use Circle's console faucet API directly
    try {
      const r1 = await fetch(CIRCLE + "/v1/faucet/drips", {
        method: "POST",
        headers: { "Authorization": "Bearer " + API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), address, blockchain: "ARC-TESTNET", usdc: true }),
        signal: AbortSignal.timeout(30000),
      });
      const d1 = await r1.json();
      console.log("[Faucet] Circle API response:", r1.status, JSON.stringify(d1));
      if (r1.ok) return res.json(d1);
      if (r1.status === 429) {
        console.log("[Faucet] Rate limited — already funded recently");
        return res.json({ status: "rate_limited" });
      }
    } catch (e) { console.log("[Faucet] Circle API error:", e.message); }

    // Fallback: public faucet
    try {
      const r2 = await fetch("https://faucet.circle.com/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, blockchain: "ARC-TESTNET", usdc: true }),
        signal: AbortSignal.timeout(20000),
      });
      const d2 = await r2.json();
      console.log("[Faucet] Public faucet response:", r2.status, JSON.stringify(d2));
      if (r2.ok) return res.json(d2);
    } catch (e) { console.log("[Faucet] Public faucet error:", e.message); }

    res.status(403).json({ message: "Faucet rate limited — use faucet.circle.com manually" });
  });

  // ── /test-circle ─────────────────────────────────────────────────────────────
  // Visit http://localhost:3000/test-circle to verify your API key works
  app.get("/test-circle", async (req, res) => {
    const results = {};
    try {
      const r = await fetch(CIRCLE + "/v1/w3s/config/entity/publicKey", {
        headers: { "Authorization": "Bearer " + API_KEY },
        signal: AbortSignal.timeout(10000),
      });
      results.publicKey = r.ok ? "✅ OK" : "❌ " + r.status;
    } catch (e) { results.publicKey = "❌ " + e.message; }
    try {
      const r = await fetch(CIRCLE + "/v1/w3s/developer/walletSets", {
        headers: { "Authorization": "Bearer " + API_KEY },
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      results.walletSets = r.ok ? "✅ Found " + (d?.data?.walletSets?.length || 0) + " sets" : "❌ " + r.status + " " + JSON.stringify(d);
    } catch (e) { results.walletSets = "❌ " + e.message; }
    results.apiKeySet = API_KEY ? "✅ Set (" + API_KEY.slice(0, 20) + "...)" : "❌ MISSING";
    results.entitySecretSet = ENTITY_SECRET ? "✅ Set (length " + ENTITY_SECRET.replace(/^0x/,"").length + " hex chars)" : "❌ MISSING";
    res.json(results);
  });

  // ── /test-faucet ─────────────────────────────────────────────────────────────
  app.get("/test-faucet", async (req, res) => {
    const address = req.query.address || "0x0000000000000000000000000000000000000001";
    const results = {};
    // Test with auth
    try {
      const r = await fetch(CIRCLE + "/v1/faucet/drips", {
        method: "POST",
        headers: { "Authorization": "Bearer " + API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), address, blockchain: "ARC-TESTNET", usdc: true }),
        signal: AbortSignal.timeout(15000),
      });
      results.withAuth = { status: r.status, data: await r.json() };
    } catch (e) { results.withAuth = { error: e.message }; }
    // Test without auth
    try {
      const r = await fetch(CIRCLE + "/v1/faucet/drips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), address, blockchain: "ARC-TESTNET", usdc: true }),
        signal: AbortSignal.timeout(15000),
      });
      results.withoutAuth = { status: r.status, data: await r.json() };
    } catch (e) { results.withoutAuth = { error: e.message }; }
    res.json(results);
  });

  // ── /send-payment ────────────────────────────────────────────────────────────
  // Full server-side payment — avoids proxy timeout on transactions
  app.post("/send-payment", async (req, res) => {
    const { fromWalletId, toAddress, amount, blockchain } = req.body;
    console.log("[Payment] Sending", amount, "USDC from", fromWalletId, "to", toAddress);
    try {
      // 1. Get fresh ciphertext
      const ciphertext = await makeCiphertext();

      // 2. Send transaction
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
      console.log("[Payment] Response:", response.status, JSON.stringify(data));
      if (!response.ok) return res.status(response.status).json(data);
      res.json(data);
    } catch (e) {
      console.error("[Payment Error]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── /circle-api proxy ────────────────────────────────────────────────────────
  app.use("/circle-api", createProxyMiddleware({
    target: CIRCLE,
    changeOrigin: true,
    pathRewrite: { "^/circle-api": "" },
    proxyTimeout: 60000,
    timeout: 60000,
    on: {
      error: (err, req, res) => {
        console.error("[Proxy Error]", err.message);
        res.status(502).json({ error: "Proxy error: " + err.message });
      },
      proxyRes: (proxyRes, req) => {
        console.log("[Proxy]", req.method, req.path, "→", proxyRes.statusCode);
      },
    },
  }));
};