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
  const ABI = ["function registerPatient(address wallet, string memory fileNumber, string memory hospitalId) external"];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const signer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      // Get current nonce fresh each attempt
      const nonce = await provider.getTransactionCount(signer.address, "latest");
      console.log(`[Contract] Attempt ${attempt}, nonce: ${nonce}`);

      const tx = await contract.registerPatient(
        patientWallet || signer.address,
        fileNumber || "UNKNOWN",
        hospitalId || "UNKNOWN",
        { nonce, gasLimit: 200000 }
      );

      console.log("[Contract] Tx sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("[Contract] Confirmed:", tx.hash, "block:", receipt.blockNumber);
      return res.json({ success: true, txHash: tx.hash });

    } catch (e) {
      console.error(`[Contract] Attempt ${attempt} failed:`, e.message);
      if (e.message.includes("request limit reached") || e.message.includes("rate")) {
        const delay = attempt * 4000;
        console.log(`[Contract] Rate limited. Waiting ${delay}ms...`);
        await sleep(delay);
      } else if (attempt < 5) {
        await sleep(2000);
      } else {
        return res.status(500).json({ error: e.message });
      }
    }
  }
}
