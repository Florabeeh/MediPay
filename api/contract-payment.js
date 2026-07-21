const crypto = require("crypto");
const { makeCiphertext, API_KEY, CIRCLE } = require("./_helpers");

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

async function circleContractCall(walletId, contractAddress, callData, ciphertext) {
  const response = await fetch(CIRCLE + "/v1/w3s/developer/transactions/contractExecution", {
    method: "POST",
    headers: { "Authorization": "Bearer " + API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      walletId,
      blockchain: "ARC-TESTNET",
      contractAddress,
      callData,
      feeLevel: "MEDIUM",
      entitySecretCiphertext: ciphertext,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  console.log("[CircleContract] Response:", JSON.stringify(data));
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { walletId, hospitalId, fileNumber, category, serviceItem, amountUSDC } = req.body;
  console.log("[ContractPayment] Starting:", fileNumber, hospitalId, amountUSDC);

  try {
    const { ethers } = await import("ethers");
    const amountWei = ethers.parseUnits(String(amountUSDC), 6);

    // Step 1: Approve contract to spend USDC
    console.log("[ContractPayment] Approving...");
    const approveIface = new ethers.Interface(["function approve(address spender, uint256 amount) returns (bool)"]);
    const approveData = approveIface.encodeFunctionData("approve", [CONTRACT_ADDRESS, amountWei]);
    const ciphertext1 = await makeCiphertext();
    const approveResult = await circleContractCall(walletId, USDC_ADDRESS, approveData, ciphertext1);
    console.log("[ContractPayment] Approve sent:", approveResult?.data?.transaction?.id);

    // Wait for approval to confirm
    await new Promise(r => setTimeout(r, 5000));

    // Step 2: Call processPayment on contract
    console.log("[ContractPayment] Processing payment...");
    const payIface = new ethers.Interface([
      "function processPayment(string hospitalId, string fileNumber, string category, string serviceItem, uint256 amountUSDC) external"
    ]);
    const payData = payIface.encodeFunctionData("processPayment", [
      hospitalId || "UNKNOWN",
      fileNumber || "UNKNOWN", 
      category || "General",
      serviceItem || "Service",
      amountWei
    ]);
    const ciphertext2 = await makeCiphertext();
    const payResult = await circleContractCall(walletId, CONTRACT_ADDRESS, payData, ciphertext2);
    
    const txHash = payResult?.data?.transaction?.txHash || payResult?.data?.transaction?.id;
    console.log("[ContractPayment] Done:", txHash);

    res.json({ success: true, txHash, id: txHash, data: payResult?.data });
  } catch (e) {
    console.error("[ContractPayment Error]", e.message);
    res.status(500).json({ error: e.message });
  }
}
