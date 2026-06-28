const { ethers } = require("ethers");

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const ARC_RPC = "https://rpc.arcscan.app";

const ABI = [
  "function processPayment(string hospitalId, string fileNumber, string category, string serviceItem, uint256 amountUSDC) external"
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { hospitalId, fileNumber, category, serviceItem, amountUSDC } = req.body;

  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const signer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    // Convert USDC amount to 6 decimals
    const amountWei = ethers.parseUnits(String(amountUSDC || "0"), 6);

    const tx = await contract.processPayment(
      hospitalId || "UNKNOWN",
      fileNumber || "UNKNOWN",
      category || "General",
      serviceItem || "Medical Service",
      amountWei
    );

    await tx.wait();
    console.log("[Contract] Payment recorded:", tx.hash);
    res.json({ success: true, txHash: tx.hash });
  } catch (e) {
    console.error("[Contract] Record failed:", e.message);
    res.status(500).json({ error: e.message });
  }
}
