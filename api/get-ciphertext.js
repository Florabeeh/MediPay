const { makeCiphertext, API_KEY, ENTITY_SECRET } = require("./_helpers");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    if (!API_KEY) return res.status(400).json({ error: "REACT_APP_CIRCLE_API_KEY not set" });
    if (!ENTITY_SECRET) return res.status(400).json({ error: "REACT_APP_ENTITY_SECRET not set" });
    const ciphertext = await makeCiphertext();
    res.json({ ciphertext });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
