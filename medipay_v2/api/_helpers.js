const crypto = require("crypto");

const API_KEY = process.env.REACT_APP_CIRCLE_API_KEY || "";
const ENTITY_SECRET = process.env.REACT_APP_ENTITY_SECRET || "";
const CIRCLE = "https://api.circle.com";

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

async function getWalletSetId() {
  try {
    const res = await fetch(CIRCLE + "/v1/w3s/developer/walletSets", {
      headers: { "Authorization": "Bearer " + API_KEY },
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    const sets = data?.data?.walletSets;
    if (sets && sets.length > 0) return sets[0].id;
  } catch (e) { console.log("[WalletSet] Fetch error:", e.message); }

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
  return data?.data?.walletSet?.id;
}

module.exports = { makeCiphertext, getWalletSetId, API_KEY, ENTITY_SECRET, CIRCLE };
