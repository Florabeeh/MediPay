const { ethers } = require("ethers");

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const ARC_RPC = "https://rpc.testnet.arc.network";

const ABI = [
  "function registerPatient(address wallet, string memory fileNumber, string memory hospitalId) external",
  "event PatientRegistered(address wallet, string fileNumber, string hospitalId, uint256 timestamp)"
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { hospitalId, fileNumber, patientWallet } = req.body;

  console.log("[Contract] Recording payment for:", fileNumber, hospitalId, patientWallet);

  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const signer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    const tx = await contract.registerPatient(
      patientWallet || signer.address,
      fileNumber || "UNKNOWN",
      hospitalId || "UNKNOWN"
    );

    console.log("[Contract] Tx sent:", tx.hash);
    await tx.wait();
    console.log("[Contract] Confirmed:", tx.hash);
    res.json({ success: true, txHash: tx.hash });
  } catch (e) {
    console.error("[Contract] Failed:", e.message);
    res.status(500).json({ error: e.message });
  }
}
