export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { hospitalId, fileNumber, patientWallet } = req.body;
  const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;
  const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
  const ARC_RPC = "https://rpc.testnet.arc.network";

  if (!DEPLOYER_PRIVATE_KEY) return res.status(500).json({ error: "DEPLOYER_PRIVATE_KEY not set" });
  if (!CONTRACT_ADDRESS) return res.status(500).json({ error: "CONTRACT_ADDRESS not set" });

  const ABI = ["function registerPatient(address wallet, string memory fileNumber, string memory hospitalId) external"];

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Retry up to 3 times with increasing delays
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const signer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      console.log(`[Contract] Attempt ${attempt} for:`, fileNumber);
      const tx = await contract.registerPatient(
        patientWallet || signer.address,
        fileNumber || "UNKNOWN",
        hospitalId || "UNKNOWN"
      );

      console.log("[Contract] Tx sent:", tx.hash);
      await tx.wait();
      console.log("[Contract] Confirmed:", tx.hash);
      return res.json({ success: true, txHash: tx.hash });

    } catch (e) {
      console.error(`[Contract] Attempt ${attempt} failed:`, e.message);
      if (attempt < 3) {
        const delay = attempt * 3000; // 3s, 6s
        console.log(`[Contract] Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        return res.status(500).json({ error: e.message });
      }
    }
  }
}
