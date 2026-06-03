import React, { useState, useEffect } from "react";
import { auth, signInWithGoogle, signInEmail, signUpEmail, getPatientRecord, savePatientRecord, logOut, resetPassword } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";

// ─── Circle API ───────────────────────────────────────────────────────────────
const DEMO_MODE = process.env.REACT_APP_DEMO_MODE !== "false";
const API_KEY = process.env.REACT_APP_CIRCLE_API_KEY || "";
const CIRCLE_API = "/circle-api";

async function circlePost(path, body, apiKey) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 1200)); return null; }
  const res = await fetch(CIRCLE_API + path, { method: "POST", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { console.error("Circle error:", data); throw new Error(data?.message || data?.error || "Circle API " + res.status); }
  return data;
}
async function circleGet(path, apiKey) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 800)); return null; }
  const res = await fetch(CIRCLE_API + path, { headers: { "Authorization": "Bearer " + apiKey } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Circle API " + res.status);
  return data;
}

// ── Server-side ciphertext — Node crypto is fully compatible with Circle API ──
async function getCiphertext() {
  const res = await fetch("/get-ciphertext");
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to get ciphertext from server");
  return data.ciphertext;
}


async function createCircleWallet(apiKey, _unused, refId) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 1400)); return { id: "wlt_" + Math.random().toString(36).slice(2, 14), address: "0x" + [...Array(20)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(""), blockchain: "ARC-TESTNET", state: "LIVE", accountType: "SCA" }; }
  // Server-side wallet creation — avoids all proxy/timeout/ciphertext issues
  const res = await fetch("/create-wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || "Wallet creation failed " + res.status);
  return data.wallet;
}
async function faucetDrip(apiKey, address) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 1000)); return { amount: "10.00", status: "pending" }; }
  try {
    const res = await fetch("/fund-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Faucet " + res.status);
    return data;
  } catch(e) {
    console.warn("Faucet skipped:", e.message);
    return { amount: "0", status: "skipped" };
  }
}
async function getWalletBalance(apiKey, walletId) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 600)); return (Math.random() * 18 + 2).toFixed(2); }
  const data = await circleGet("/v1/w3s/wallets/" + walletId + "/balances", apiKey);
  return data?.data?.tokenBalances?.find(t => t.token?.symbol === "USDC")?.amount || "0.00";
}
async function sendPayment(apiKey, fromWalletId, toAddress, amount) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 2000)); return { id: "txn_" + Math.random().toString(36).slice(2, 14), txHash: "0x" + [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join(""), state: "COMPLETE" }; }

  const res = await fetch("/send-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromWalletId, toAddress, amount, blockchain: "ARC-TESTNET" }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data?.data?.transaction;
  if (res.status !== 404 && res.status !== 405) throw new Error(data?.message || data?.error || "Payment failed " + res.status);

  // Fallback for environments that only expose the generic Circle proxy.
  const entitySecretCiphertext = await getCiphertext();
  const fallback = await circlePost("/v1/w3s/developer/transactions/transfer", { idempotencyKey: crypto.randomUUID(), walletId: fromWalletId, blockchain: "ARC-TESTNET", tokenAddress: "0x3600000000000000000000000000000000000000", destinationAddress: toAddress, amounts: [String(amount)], feeLevel: "MEDIUM", entitySecretCiphertext }, apiKey);
  return fallback?.data?.transaction;
}

// ─── Data ─────────────────────────────────────────────────────────────────────
// ─── Inline SVG Icons (no emoji) ───────────────────────────────────────────────
function Ico({ svg, size = 20, color = "currentColor" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {svg}
      </svg>
    </span>
  );
}
Ico.Bolt = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>);
Ico.Shield = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
Ico.LinkIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>);
Ico.CardIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>);
Ico.Globe = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>);
Ico.HomeIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>);
Ico.ClockIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>);
Ico.UserIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
Ico.MailIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>);
Ico.SearchIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>);
Ico.MapPin = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>);
Ico.CheckIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>);
Ico.ArrowRight = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>);
Ico.ArrowUp = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>);
Ico.ArrowDown = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>);
Ico.ShareIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>);
Ico.DownloadIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>);
Ico.RefreshIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>);
Ico.CloseIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
Ico.MenuIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>);
Ico.ChevronRight = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><polyline points="9 18 15 12 9 6"/></svg>);
Ico.ChevronDown = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><polyline points="6 9 12 15 18 9"/></svg>);
Ico.FolderIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>);
Ico.BrainIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M12 2a4 4 0 014 4c0 1-.3 1.8-.9 2.5 1.5.7 2.5 2.2 2.5 3.9 0 1.6-.9 3.1-2.3 3.8.6 1 1 2.1 1 3.3a4 4 0 01-4 4"/><path d="M12 2a4 4 0 00-4 4c0 1 .3 1.8.9 2.5-1.5.7-2.5 2.2-2.5 3.9 0 1.6.9 3.1 2.3 3.8-.6 1-1 2.1-1 3.3a4 4 0 004 4"/><path d="M12 17v-7"/><line x1="9" y1="12" x2="15" y2="12"/></svg>);
Ico.HeartIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>);
Ico.PlusIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
Ico.CrossMark = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
Ico.DropIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>);
Ico.ActivityIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>);
Ico.VaccineIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M12 22a10 10 0 100-20 10 10 0 000 20z"/><path d="M12 6v6l4 2"/></svg>);
Ico.StoreIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>);
Ico.MicroscopeIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M2 22h12"/><path d="M8 22V8"/><path d="M8 8c-3.3 0-6 2.7-6 6v4"/><circle cx="16" cy="16" r="6"/><path d="M16 10v12"/></svg>);
Ico.PillIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><rect x="4" y="4" width="16" height="16" rx="8"/></svg>);
Ico.ToothIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M12 22c-6 0-7-3-7-6V6c0-2 1-4 4-4 2 0 3 1 3 1s1-1 3-1c3 0 4 2 4 4v10c0 3-1 6-7 6z"/></svg>);
Ico.WheelchairIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><circle cx="16" cy="20" r="3"/><circle cx="6" cy="14" r="3"/><path d="M6 14V4h6l4 4"/><path d="M9 14v6l6-2v3"/></svg>);
Ico.ScalpelIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 22"/></svg>);
Ico.RunIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><circle cx="13" cy="4" r="2"/><path d="M11 16l-1 5 3-3-1-5"/><path d="M7 11l3 4 2-2 4-8"/><path d="M5 22l2-4"/></svg>);
Ico.MoonIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>);
Ico.BroomIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M4 20l14-14"/><path d="M18 4l4 4"/><path d="M12 10l2 2"/><path d="M6 16l2 2"/></svg>);
Ico.StethoscopeIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M4.8 2.3A.3.3 0 105 2"/><path d="M2 8V5a3 3 0 013-3h1"/><path d="M6 2h5"/><path d="M6 6h5"/><circle cx="5" cy="13" r="3"/><path d="M5 16v0a4 4 0 004-4V8"/><path d="M5 10H2v2"/></svg>);
Ico.AppleIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M12 7.5C11.5 6.5 10.5 6 9.5 6s-2 .5-2.5 1.5"/><path d="M12 7.5c.5-1 1.5-1.5 2.5-1.5s2 .5 2.5 1.5"/><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
Ico.SwapIcon = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>);
Ico.NGFlag = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20}><rect width="8" height="24" x="0" fill="#008751"/><rect width="8" height="24" x="16" fill="#008751"/><rect width="8" height="24" x="8" fill="#fff"/></svg>);
Ico.ChatBubble = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>);
Ico.ExternalLink = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||20} height={size||20} fill="none" stroke={color||"currentColor"} strokeWidth={2}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>);
Ico.Bubbles = ({ size, color }) => (<svg viewBox="0 0 24 24" width={size||18} height={size||18} fill={color||"currentColor"}><circle cx="7" cy="7" r="3" opacity=".6"/><circle cx="17" cy="9" r="2.5" opacity=".35"/><circle cx="12" cy="4" r="2" opacity=".5"/><circle cx="5" cy="16" r="2.5" opacity=".4"/><circle cx="14" cy="18" r="2" opacity=".3"/></svg>);


const HOSPITALS = [
  { id: "UDUTH", full: "Usmanu Danfodiyo University Teaching Hospital", state: "Sokoto" },
  { id: "LUTH", full: "Lagos University Teaching Hospital", state: "Lagos" },
  { id: "UCH", full: "University College Hospital", state: "Oyo" },
  { id: "ABUTH", full: "Ahmadu Bello University Teaching Hospital", state: "Kaduna" },
  { id: "UNTH", full: "University of Nigeria Teaching Hospital", state: "Enugu" },
  { id: "OAUTH", full: "Obafemi Awolowo University Teaching Hospital", state: "Osun" },
  { id: "UATH", full: "University of Abuja Teaching Hospital", state: "FCT" },
  { id: "BMSH", full: "Benin Medical & Surgical Hospital", state: "Edo" },
  { id: "GESTH", full: "General Hospital Enugu (State)", state: "Enugu" },
  { id: "NKST", full: "NKST Hospital Mkar", state: "Benue" },
  { id: "FMCB", full: "Federal Medical Centre Birnin Kebbi", state: "Kebbi" },
  { id: "FMCA", full: "Federal Medical Centre Abeokuta", state: "Ogun" },
];

const CATS = {
  Surgery: { icon: <Ico.ScalpelIcon size={18} />, items: ["Brain Surgery", "Open Heart Surgery", "Kidney Transplant", "Liver Transplant", "Appendectomy", "Caesarean Section", "Spinal Surgery", "Hip Replacement", "Knee Replacement", "Eye Surgery (Cataract)", "Hernia Repair", "Thyroidectomy"], prices: [950000, 1200000, 2500000, 3800000, 180000, 250000, 750000, 900000, 850000, 320000, 150000, 420000] },
  Investigations: { icon: <Ico.MicroscopeIcon size={18} />, items: ["Full Blood Count", "Liver Function Test", "Kidney Function Test", "Malaria RDT", "HIV Screening", "Hepatitis B&C Panel", "Blood Culture", "Thyroid Function Test", "Widal Test", "Stool MCS", "Urinalysis", "Coagulation Profile"], prices: [3500, 5500, 6000, 2000, 4500, 9000, 15000, 12000, 2500, 3000, 1500, 18000] },
  Radiology: { icon: <Ico.ActivityIcon size={18} />, items: ["Chest X-Ray", "Abdominal Ultrasound", "CT Scan (Head)", "MRI Brain", "Echocardiogram", "Pelvic Ultrasound", "Mammogram", "Bone Density Scan", "Barium Meal", "Fluoroscopy", "Nuclear Medicine Scan", "PET Scan"], prices: [8000, 15000, 85000, 180000, 55000, 12000, 25000, 30000, 20000, 35000, 200000, 450000] },
  Medication: { icon: <Ico.PillIcon size={18} />, items: ["Antimalarial Course", "Antibiotic Course", "Antihypertensive (1mo)", "Diabetic Medication (1mo)", "Chemotherapy Round", "ARV (1 month)", "Painkillers", "IV Fluids (per bag)", "Insulin (per vial)", "Anticoagulants", "Immunosuppressants", "Vitamins"], prices: [4500, 6000, 8500, 12000, 350000, 18000, 3500, 2500, 15000, 25000, 45000, 4000] },
  Therapy: { icon: <Ico.BrainIcon size={18} />, items: ["Physiotherapy Session", "Occupational Therapy", "Speech Therapy", "Dialysis Session", "Chemotherapy Session", "Radiation Therapy", "Cardiac Rehab", "Wound Dressing", "Blood Transfusion", "IV Infusion Therapy", "Respiratory Therapy", "Hydrotherapy"], prices: [8000, 9500, 10000, 85000, 150000, 200000, 25000, 5000, 45000, 15000, 18000, 12000] },
  Pharmacy: { icon: <Ico.StoreIcon size={18} />, items: ["Prescription Dispensing", "Over-the-Counter Meds", "Medical Consumables", "Surgical Supplies", "Formulary Drugs", "Vaccination Package", "Nebulizer Medication", "Ophthalmic Drops", "Topical Creams", "Ear/Nasal Drops", "ORS", "Asthma Inhaler"], prices: [2000, 3500, 5000, 8000, 12000, 25000, 7000, 4500, 2500, 3000, 1500, 18000] },
  Rehabilitation: { icon: <Ico.WheelchairIcon size={18} />, items: ["Post-Stroke Rehab", "Post-Surgery Recovery", "Orthopedic Rehab", "Cardiac Rehab Program", "Pulmonary Rehab", "Substance Abuse Rehab", "TBI Rehab", "Spinal Cord Rehab", "Pediatric Rehab", "Geriatric Rehab", "Sports Injury Rehab", "Amputee Rehab"], prices: [45000, 35000, 40000, 55000, 50000, 80000, 120000, 100000, 30000, 35000, 25000, 65000] },
  Procedures: { icon: <Ico.HeartIcon size={18} />, items: ["Endoscopy", "Colonoscopy", "Bone Marrow Biopsy", "Lumbar Puncture", "Liver Biopsy", "Bronchoscopy", "Cystoscopy", "Circumcision", "Dental Extraction", "Vasectomy", "Colposcopy", "Hysteroscopy"], prices: [55000, 60000, 75000, 35000, 80000, 65000, 50000, 15000, 12000, 20000, 30000, 45000] },
};

const HEALTH_TIPS = [
  { icon: <Ico.DropIcon size={28} color="#3fb7a3" />, color: "#3fb7a3", title: "Stay Hydrated", body: "Drink 8-12 glasses of water daily. Dehydration is a leading cause of hospital visits in Nigeria's hot climate." },
  { icon: <Ico.DropIcon size={28} color="#ef6b73" />, color: "#ef6b73", title: "Know Your Genotype", body: "Confirm genotype before marriage. SS children suffer sickle cell disease — entirely preventable with proper planning." },
  { icon: <Ico.AppleIcon size={28} color="#55c9b6" />, color: "#55c9b6", title: "Eat Local Vegetables", body: "Ugwu, garden egg, and bitter leaf are rich in iron and vitamins. Include them in every meal." },
  { icon: <Ico.RunIcon size={28} color="#b17700" />, color: "#b17700", title: "Exercise Daily", body: "30 minutes of walking daily reduces diabetes and hypertension risk by up to 35%." },
  { icon: <Ico.StethoscopeIcon size={28} color="#5aa9e6" />, color: "#5aa9e6", title: "Annual Check-ups", body: "Silent killers — hypertension, diabetes, cancer — show no early symptoms. A yearly check saves lives." },
  { icon: <Ico.MoonIcon size={28} color="#8f93ea" />, color: "#8f93ea", title: "Sleep 7-9 Hours", body: "Poor sleep raises blood pressure and weakens immunity. Sleep at the same time each night." },
  { icon: <Ico.DropIcon size={28} color="#198f82" />, color: "#198f82", title: "Wash Your Hands", body: "20 seconds with soap prevents diarrhoea, typhoid, and cholera — top causes of illness in West Africa." },
  { icon: <Ico.VaccineIcon size={28} color="#f5c85b" />, color: "#f5c85b", title: "Vaccinate Children", body: "Routine vaccines protect against polio, measles, yellow fever. Visit your nearest PHC." },
];

const NEWS = [
  { tag: "Launch", tagColor: "#3fb7a3", title: "MediPay live across 12 hospitals", body: "Register once at any partnered hospital with a single Circle Programmable Wallet.", date: "May 2026" },
  { tag: "Feature", tagColor: "#5aa9e6", title: "Transfer records across states instantly", body: "Moving from Sokoto to Lagos? Your history travels with you. Just enter your file number at any MediPay hospital.", date: "May 2026" },
  { tag: "Technology", tagColor: "#8f93ea", title: "Powered by Circle on ARC Testnet", body: "Every payment settles in under 1 second using Circle Nanopayments. No bank delays, no transfer fees.", date: "May 2026" },
  { tag: "Vision", tagColor: "#f5c85b", title: "Expanding to Ghana and Kenya by Q4 2026", body: "After Nigeria pilot, MediPay partners with Korle-Bu Teaching Hospital Ghana and Kenyatta National Hospital Kenya.", date: "April 2026" },
];

const NGN_USDC = 1650;
const HOSP_ADDR = "0x742d35Cc6634C0532925a3b8D4C9b4AA12b5e6f4";
const fmt = n => "N" + Number(n).toLocaleString();
const genFN = id => id + "-" + Date.now().toString().slice(-6) + "-" + Math.floor(Math.random() * 9000 + 1000);
const genTx = () => "0x" + [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");


// ─── Receipt Image Generator (LATI light theme) ──────────────────────────────
function downloadReceiptImage(rec) {
  const canvas = document.createElement("canvas");
  canvas.width = 600; canvas.height = 820;
  const ctx = canvas.getContext("2d");
  // White background with brand accent top/bottom bars
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 600, 820);
  ctx.fillStyle = "#3fb7a3"; ctx.fillRect(0, 0, 600, 8);
  ctx.beginPath(); ctx.arc(300, 70, 36, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(300, 70, 0, 300, 70, 36);
  grad.addColorStop(0, "#55c9b6"); grad.addColorStop(1, "#2eaa99");
  ctx.fillStyle = grad; ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 28px 'Borgen', system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("M", 300, 80);
  ctx.fillStyle = "#25364b"; ctx.font = "bold 26px 'Borgen', system-ui, sans-serif"; ctx.fillText("MediPay", 300, 128);
  ctx.fillStyle = "#198f82"; ctx.font = "14px system-ui"; ctx.fillText("Payment Confirmed · ARC Testnet", 300, 152);
  ctx.setLineDash([6, 4]); ctx.strokeStyle = "#d8e5ee"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 172); ctx.lineTo(560, 172); ctx.stroke(); ctx.setLineDash([]);
  const rows = [
    ["Patient", rec.patient], ["File Number", rec.fileNo], ["Hospital", rec.hospital || ""],
    ["Category", rec.category], ["Service", rec.item], rec.note ? ["Note", rec.note] : null,
    ["Amount (NGN)", fmt(rec.amount)], ["Amount (USDC)", rec.usdc + " USDC"],
    ["Network", "ARC-TESTNET"], ["Settlement", "< 1 second (Circle MPC)"], ["Date", rec.date],
    ["Transaction ID", rec.id ? rec.id.slice(0, 28) + "..." : ""],
  ].filter(Boolean);
  let y = 200;
  rows.forEach(([k, v]) => {
    ctx.fillStyle = "#8da0b5"; ctx.font = "13px system-ui"; ctx.textAlign = "left"; ctx.fillText(k, 50, y);
    ctx.fillStyle = "#25364b"; ctx.font = "13px system-ui"; ctx.textAlign = "right";
    ctx.fillText(String(v).length > 38 ? String(v).slice(0, 38) + "..." : String(v), 550, y);
    ctx.strokeStyle = "#eef3f7"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(50, y + 10); ctx.lineTo(550, y + 10); ctx.stroke();
    y += 36;
  });
  y += 10;
  // Total amount card - light green background with border
  ctx.fillStyle = "#f0faf6";
  roundRect(ctx, 40, y, 520, 80, 12);
  ctx.strokeStyle = "rgba(63,183,163,0.20)"; ctx.lineWidth = 1;
  roundRectStroke(ctx, 40, y, 520, 80, 12);
  ctx.fillStyle = "#198f82"; ctx.font = "bold 32px system-ui"; ctx.textAlign = "center"; ctx.fillText(fmt(rec.amount), 300, y + 42);
  ctx.fillStyle = "#8da0b5"; ctx.font = "13px system-ui"; ctx.fillText(rec.usdc + " USDC · Circle ARC Testnet", 300, y + 64);
  y += 100; ctx.fillStyle = "#d8e5ee"; ctx.font = "8px monospace"; ctx.textAlign = "center";
  ctx.fillText("|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||", 300, y);
  ctx.fillStyle = "#8da0b5"; ctx.font = "11px system-ui"; ctx.fillText("Powered by Circle on ARC Testnet · medipay.circle.arc", 300, y + 20);
  ctx.fillStyle = "#3fb7a3"; ctx.fillRect(0, 812, 600, 8);
  const link = document.createElement("a");
  link.download = "medipay-receipt-" + (rec.fileNo || "receipt") + ".png";
  link.href = canvas.toDataURL("image/png"); link.click();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fill();
}

function roundRectStroke(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.stroke();
}

// ─── Main App ─────────────────────────────────────────────────────────────────


export default function MediPay() {
  const [screen, setScreen] = useState("landing");
  const [fbUser, setFbUser] = useState(undefined); // undefined=loading, null=logged out
  const [authEmail, setAuthEmail] = useState(""); const [authPw, setAuthPw] = useState(""); const [authErr, setAuthErr] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [hospital, setHospital] = useState(null);
  const [authMode, setAuthMode] = useState("signup");
  const [user, setUser] = useState(null);
  const [fname, setFname] = useState(""); const [fdob, setFdob] = useState(""); const [fgender, setFgender] = useState("");
  const [fphone, setFphone] = useState(""); const [femail, setFemail] = useState(""); const [faddress, setFaddress] = useState("");
  const [fstate, setFstate] = useState(""); const [fbloodGroup, setFbloodGroup] = useState(""); const [fgenotype, setFgenotype] = useState("");
  const form = { name:fname, dob:fdob, gender:fgender, phone:fphone, email:femail, address:faddress, state:fstate, bloodGroup:fbloodGroup, genotype:fgenotype };
  const resetForm = () => { setFname(""); setFdob(""); setFgender(""); setFphone(""); setFemail(""); setFaddress(""); setFstate(""); setFbloodGroup(""); setFgenotype(""); };
  const [fileNo, setFileNo] = useState(""); const [walletId, setWalletId] = useState(""); const [walletAddr, setWalletAddr] = useState("");
  const [usdcBal, setUsdcBal] = useState(null); const [balLoading, setBalLoading] = useState(false); const [faucetSent, setFaucetSent] = useState(false);
  const [linked, setLinked] = useState([]); const [tab, setTab] = useState("home");
  const [paycat, setPaycat] = useState(""); const [payitem, setPayitem] = useState(""); const [payprice, setPayprice] = useState(0); const [paynote, setPaynote] = useState("");
  const [receipt, setReceipt] = useState(null); const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false); const [step, setStep] = useState("");
  const [toast, setToast] = useState({ msg: "", type: "ok" });
  const [searchH, setSearchH] = useState(""); const [showCat, setShowCat] = useState(false); const [showItem, setShowItem] = useState(false);
  const [showTrf, setShowTrf] = useState(false); const [trfTarget, setTrfTarget] = useState(""); const [trfDrop, setTrfDrop] = useState(false); const [trfDone, setTrfDone] = useState(false);
  const [existFN, setExistFN] = useState(""); const [menuOpen, setMenuOpen] = useState(false); const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [showAboutPage, setShowAboutPage] = useState(false);
  const [showPayLink, setShowPayLink] = useState(false); const [payLink, setPayLink] = useState(""); const [payLinkCopied, setPayLinkCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); const [shareReceipt, setShareReceipt] = useState(null); const [rcpCopied, setRcpCopied] = useState(false);
  // eslint-disable-next-line
  const [, setPendingLinks] = useState([]);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── Firebase auth listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbU) => {
      setFbUser(fbU);
      if (!fbU) { setScreen("landing"); return; }
      try {
        const rec = await getPatientRecord(fbU.uid);
        if (rec) {
          setUser({ name: rec.name || "", dob: rec.dob || "", gender: rec.gender || "", phone: rec.phone || "", email: rec.email || "", address: rec.address || "", state: rec.state || "", bloodGroup: rec.bloodGroup || "", genotype: rec.genotype || "" });
          setFileNo(rec.fileNo || ""); setWalletId(rec.walletId || ""); setWalletAddr(rec.walletAddress || "");
          setLinked(rec.linkedHospitals?.map(id => ({ id, ...(HOSPITALS.find(h => h.id === id) || {}) })) || []);
          setFaucetSent(rec.faucetSent || false); setHistory(rec.history || []);
          const hosp = HOSPITALS.find(h => h.id === rec.hospitalId);
          if (hosp) setHospital(hosp);
          setTab("home"); setScreen("dashboard");
          if (rec.walletId) {
            const wid = rec.walletId;
            setBalLoading(true);
            setTimeout(() => {
              getWalletBalance(wid)
                .then(bal => { setUsdcBal(bal); setBalLoading(false); })
                .catch(() => { setUsdcBal("0.00"); setBalLoading(false); });
            }, 1500);
          }
        } else {
          if (fbU.email) setFemail(fbU.email);
          setScreen("hospitals");
        }
      } catch(e) {
        console.error("Firestore load error:", e);
        setScreen("hospitals");
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toast_ = (msg, type) => { setToast({ msg, type: type || "ok" }); setTimeout(() => setToast({ msg: "", type: "ok" }), 3200); };
  const filtered = HOSPITALS.filter(h => h.full.toLowerCase().includes(searchH.toLowerCase()) || h.state.toLowerCase().includes(searchH.toLowerCase()) || h.id.toLowerCase().includes(searchH.toLowerCase()));
  const availTrf = HOSPITALS.filter(h => !linked.find(l => l.id === h.id) && h.id !== hospital?.id);

  const refreshBalance = async (wId) => {
    const id = wId || walletId; if (!id) return;
    setBalLoading(true);
    try { setUsdcBal(await getWalletBalance(API_KEY, id)); } catch (e) { setUsdcBal("--"); }
    setBalLoading(false);
  };

  // Save the complete patient record to Firestore after wallet/profile changes.
  const cleanObj = (obj) => Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null));
  const persistRecord = async (overrides = {}) => {
    if (!fbUser) return;
    const rec = {
      uid: fbUser.uid,
      email: fbUser.email || femail || user?.email || "",
      name: form.name || user?.name || "",
      fileNo,
      walletId,
      walletAddress: walletAddr,
      hospitalId: hospital?.id || "",
      linkedHospitals: linked.map(h => h.id),
      faucetSent,
      history,
      dob: form.dob || user?.dob || "",
      phone: form.phone || user?.phone || "",
      gender: form.gender || user?.gender || "",
      bloodGroup: form.bloodGroup || user?.bloodGroup || "",
      genotype: form.genotype || user?.genotype || "",
      state: form.state || user?.state || "",
      address: form.address || user?.address || "",
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
    await savePatientRecord(fbUser.uid, cleanObj(rec));
  };

  const setupWallet = async (refId) => {
    setStep("Creating your Circle Programmable Wallet on ARC Testnet...");
    const cw = await createCircleWallet(API_KEY, "demo-set", refId);
    setWalletId(cw.id); setWalletAddr(cw.address);
    try {
      setStep("Requesting 10 USDC from Circle faucet...");
      await faucetDrip(API_KEY, cw.address);
      setFaucetSent(true);
    } catch(e) { console.warn("Faucet skipped:", e.message); setFaucetSent(false); }
    try {
      setStep("Loading balance...");
      setUsdcBal(await getWalletBalance(API_KEY, cw.id));
    } catch(e) { console.warn("Balance check skipped:", e.message); setUsdcBal("0.00"); }
    setStep(""); return cw;
  };

  const handleHospSelect = h => { setHospital(h); setScreen("auth"); };

  const requireAuth = () => {
    if (fbUser) { setScreen("hospitals"); }
    else { setShowAuth(true); }
  };

  const handleFirebaseAuth = async (mode) => {
    if (!authEmail || !authPw) { setAuthErr("Enter email and password"); return; }
    setAuthErr(""); setLoading(true);
    try {
      if (mode === "login") await signInEmail(authEmail, authPw);
      else await signUpEmail(authEmail, authPw);
      setShowAuth(false);
    } catch(e) { console.error('Auth error:', e); setAuthErr(e?.message?.replace('Firebase: ','')?.replace(/\(auth\/.*\)/,'')?.trim() || 'Login failed. Check your email and password.'); }
    setLoading(false);
  };

  const handleAuth = async () => {
    setLoading(true);
    if (authMode === "existing") {
      const fn = existFN.trim().toUpperCase();
      if (!fn) { toast_("Enter your file number", "err"); setLoading(false); return; }
      await setupWallet(fn);
      const prefix = fn.split("-")[0];
      const homeH = HOSPITALS.find(h => h.id === prefix) || hospital;
      setLinked([homeH, hospital].filter(Boolean).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i));
      setFileNo(fn); setUser({ name: "Returning Patient", email: "" });
      toast_("Records found — welcome back");
      setLoading(false); setTab("home"); setScreen("dashboard");
    } else { setLoading(false); setScreen("profile"); }
  };

  const handleProfileSubmit = async () => {
    if (!form.name || !form.dob || !form.phone) { toast_("Fill all required fields", "err"); return; }
    setLoading(true);
    const fn = genFN(hospital.id); setFileNo(fn);
    const cw = await setupWallet(fn);
    const profile = { ...form };
    setLinked([hospital]); setUser(profile);
    await persistRecord({
      ...profile,
      fileNo: fn,
      walletId: cw.id,
      walletAddress: cw.address,
      hospitalId: hospital.id,
      linkedHospitals: [hospital.id],
      faucetSent: true,
      history: [],
      createdAt: new Date().toISOString(),
    });
    setLoading(false); setScreen("fileno");
  };

  const handlePay = async () => {
    if (!paycat || !payitem) { toast_("Select category and item", "err"); return; }
    setLoading(true); setStep("Signing transaction via Circle MPC...");
    try {
      const idx = CATS[paycat].items.indexOf(payitem);
      const amount = CATS[paycat].prices[idx];
      const usdc = (amount / NGN_USDC).toFixed(4);
      const tx = await sendPayment(API_KEY, walletId, HOSP_ADDR, usdc);
      if (usdcBal && usdcBal !== "--") setUsdcBal(Math.max(0, parseFloat(usdcBal) - parseFloat(usdc)).toFixed(2));
      const rec = {
        id: tx?.txHash || tx?.id || genTx(), type: "payment",
        hospital: hospital?.full, hospitalId: hospital?.id,
        patient: user?.name || form.name, fileNo, walletAddr,
        category: paycat, item: payitem, amount, usdc, note: paynote,
        date: new Date().toLocaleString("en-NG", { dateStyle: "full", timeStyle: "short" }),
        status: "confirmed",
      };
      const newHistory = [rec, ...history];
      setReceipt(rec); setHistory(newHistory);
      setPendingLinks(pl => pl.map(p => p.item === payitem && p.hospitalId === hospital?.id ? { ...p, status: "confirmed" } : p));
      await savePatientRecord(fbUser.uid, { history: newHistory.map(r => cleanObj(r)) });
      setLoading(false); setStep(""); setScreen("receipt");
    } catch (e) { toast_("Payment failed: " + e.message, "err"); setLoading(false); setStep(""); }
  };

  const handleTransfer = async () => {
    if (!trfTarget) { toast_("Select a hospital", "err"); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 1400));
    const newH = HOSPITALS.find(h => h.id === trfTarget);
    const newLinked = [...linked, newH].filter(Boolean);
    setLinked(newLinked);
    await savePatientRecord(fbUser.uid, { linkedHospitals: newLinked.map(h => h.id) });
    setLoading(false); setTrfDone(true);
    toast_("Records linked to " + trfTarget);
  };

  const generatePayLink = () => {
    if (!paycat || !payitem) { toast_("Select category and item first", "err"); return; }
    const idx = CATS[paycat].items.indexOf(payitem);
    const amount = CATS[paycat].prices[idx];
    const payload = btoa(JSON.stringify({ fn: fileNo, h: hospital?.id, cat: paycat, item: payitem, amt: amount, note: paynote, ts: Date.now() }));
    const link = "https://medipay.app/pay?ref=" + payload;
    setPayLink(link);
    const pendingEntry = {
      id: genTx(), type: "payment_link", hospital: hospital?.full, hospitalId: hospital?.id,
      patient: user?.name || form.name, fileNo, category: paycat, item: payitem,
      amount, usdc: (amount / NGN_USDC).toFixed(4), note: paynote,
      date: new Date().toLocaleString("en-NG", { dateStyle: "full", timeStyle: "short" }),
      status: "pending", link,
    };
    const newHistory = [pendingEntry, ...history];
    setHistory(newHistory);
    setPendingLinks(p => [pendingEntry, ...p]);
    savePatientRecord(fbUser?.uid, { history: newHistory.map(r => cleanObj(r)) });
    setPayLinkCopied(false); setShowPayLink(true);
  };

  const copyPayLink = () => { navigator.clipboard.writeText(payLink).then(() => { setPayLinkCopied(true); setTimeout(() => setPayLinkCopied(false), 2000); }).catch(() => toast_("Clipboard not available", "err")); };
  const sharePayLink = () => {
    const idx = CATS[paycat]?.items.indexOf(payitem);
    const amount = idx >= 0 ? CATS[paycat].prices[idx] : payprice;
    const text = "Hi, please help pay my medical bill at " + hospital?.id + ".\n\nService: " + payitem + "\nAmount: " + fmt(amount) + "\n\nPay here: " + payLink;
    if (navigator.share) navigator.share({ title: "MediPay Payment Request", text, url: payLink });
    else { copyPayLink(); toast_("Link copied!"); }
  };

  const openShareReceipt = rec => { setShareReceipt(rec); setRcpCopied(false); setShowShareModal(true); };
  const copyReceiptText = rec => {
    const lines = ["== MEDIPAY RECEIPT ==", "Patient: " + rec.patient, "File No: " + rec.fileNo, "Hospital: " + (rec.hospital || ""), "Category: " + rec.category, "Service: " + rec.item, rec.note ? "Note: " + rec.note : null, "Amount: " + fmt(rec.amount), "USDC: " + rec.usdc + " USDC", "Network: ARC-TESTNET", "Date: " + rec.date, "Tx ID: " + rec.id, "Powered by Circle on ARC Testnet"].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines).then(() => { setRcpCopied(true); setTimeout(() => setRcpCopied(false), 2000); }).catch(() => toast_("Clipboard not available", "err"));
  };
  const nativeShare = async rec => {
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 820;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f0faf8"; ctx.fillRect(0, 0, 600, 820);
    ctx.fillStyle = "#20b2aa"; ctx.fillRect(0, 0, 600, 8);
    ctx.beginPath(); ctx.arc(300, 70, 36, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(300,70,0,300,70,36);
    g.addColorStop(0,"#20b2aa"); g.addColorStop(1,"#0d8c85");
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle="#fff"; ctx.font="bold 28px system-ui"; ctx.textAlign="center"; ctx.fillText("M",300,80);
    ctx.fillStyle="#1a1a2e"; ctx.font="bold 26px system-ui"; ctx.fillText("MediPay",300,128);
    ctx.fillStyle="#20b2aa"; ctx.font="14px system-ui"; ctx.fillText("Payment Confirmed  ARC Testnet",300,152);
    ctx.setLineDash([6,4]); ctx.strokeStyle="#d1d5db"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(40,172); ctx.lineTo(560,172); ctx.stroke(); ctx.setLineDash([]);
    const rows=[["Patient",rec.patient],["File Number",rec.fileNo],["Hospital",rec.hospital||""],["Category",rec.category],["Service",rec.item],rec.note?["Note",rec.note]:null,["Amount (NGN)",fmt(rec.amount)],["Amount (USDC)",rec.usdc+" USDC"],["Network","ARC-TESTNET"],["Settlement","< 1 second (Circle)"],["Date",rec.date],["Tx ID",rec.id?rec.id.slice(0,28)+"...":""]].filter(Boolean);
    let y=200; rows.forEach(([k,v])=>{ ctx.fillStyle="#6b7280"; ctx.font="13px system-ui"; ctx.textAlign="left"; ctx.fillText(k,50,y); ctx.fillStyle="#1a1a2e"; ctx.font="13px system-ui"; ctx.textAlign="right"; ctx.fillText(String(v).length>38?String(v).slice(0,38)+"...":String(v),550,y); ctx.strokeStyle="#e5e7eb"; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(50,y+10); ctx.lineTo(550,y+10); ctx.stroke(); y+=36; });
    y+=10; ctx.fillStyle="#e6f7f5"; ctx.beginPath(); ctx.roundRect(40,y,520,80,12); ctx.fill();
    ctx.fillStyle="#20b2aa"; ctx.font="bold 32px system-ui"; ctx.textAlign="center"; ctx.fillText(fmt(rec.amount),300,y+42);
    ctx.fillStyle="#6b7280"; ctx.font="13px system-ui"; ctx.fillText(rec.usdc+" USDC  Circle ARC Testnet",300,y+64);
    y+=100; ctx.fillStyle="#d1d5db"; ctx.font="8px monospace"; ctx.fillText("|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||",300,y);
    ctx.fillStyle="#9ca3af"; ctx.font="11px system-ui"; ctx.fillText("Powered by Circle on ARC Testnet",300,y+20);
    ctx.fillStyle="#20b2aa"; ctx.fillRect(0,812,600,8);
    try {
      const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
      const file = new File([blob], "medipay-receipt-"+(rec.fileNo||"receipt")+".png", { type:"image/png" });
      if (navigator.canShare && navigator.canShare({ files:[file] })) {
        await navigator.share({ title:"MediPay Receipt", files:[file] });
        return;
      }
    } catch(e) { console.log("File share failed:", e.message); }
    const link = document.createElement("a");
    link.download = "medipay-receipt-"+(rec.fileNo||"receipt")+".png";
    link.href = canvas.toDataURL("image/png"); link.click();
    setTimeout(() => {
      const text = encodeURIComponent("MediPay Receipt\nPatient: "+rec.patient+"\nService: "+rec.item+"\nAmount: "+fmt(rec.amount)+"\nDate: "+rec.date+"\n\n(See downloaded image for full receipt)");
      window.open("https://wa.me/?text="+text, "_blank");
    }, 800);
  };

  const NAV = [["home", <Ico.HomeIcon size={18} />, "Home"], ["pay", <Ico.CardIcon size={18} />, "Pay"], ["history", <Ico.ClockIcon size={18} />, "History"], ["profile", <Ico.UserIcon size={18} />, "Profile"]];
  const switchTab = t => { setTab(t); setMenuOpen(false); };
  const shellProps = { isMobile, menuOpen, setMenuOpen, NAV, tab, switchTab, walletAddr, fileNo, balLoading, usdcBal, toast, setScreen, onRequireAuth: requireAuth, setShowAboutPage };


  if (showAboutPage) return (
    <div style={{ minHeight:"100vh", background:"#f7fbff", fontFamily:"system-ui,-apple-system,sans-serif" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", height:64, borderBottom:"1px solid rgba(63,183,163,0.15)", background:"#fff", position:"sticky", top:0, zIndex:30 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#20b2aa,#0d8c85)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff",fontSize:16 }}>M</div>
          <span style={{ fontSize:18,fontWeight:800,color:"#1a2e35" }}>MediPay</span>
        </div>
        <button onClick={() => setShowAboutPage(false)} style={{ background:"none",border:"1px solid rgba(63,183,163,0.4)",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600,color:"#20b2aa",cursor:"pointer" }}>← Back</button>
      </div>
      <div style={{ maxWidth:800, margin:"0 auto", padding:"40px 24px 80px" }}>
        <div style={{ fontSize:11,fontWeight:700,letterSpacing:".18em",textTransform:"uppercase",color:"#20b2aa",marginBottom:12 }}>About MediPay</div>
        <h1 style={{ fontSize:"clamp(28px,5vw,42px)",fontWeight:800,color:"#1a2e35",lineHeight:1.1,marginBottom:16,letterSpacing:"-1px" }}>Healthcare payments,<br/><span style={{ color:"#20b2aa" }}>built for the world.</span></h1>
        <p style={{ fontSize:15,color:"#5a7a8a",lineHeight:1.9,marginBottom:32 }}>MediPay is a borderless healthcare payment platform that gives every patient a portable digital wallet and a permanent medical identity — one that works across any partnered hospital, in any city, in any country. We started in Nigeria because the need is most urgent here. But the infrastructure we are building has no borders.</p>
        <div style={{ background:"#fff",border:"1px solid rgba(63,183,163,0.18)",borderRadius:16,padding:"24px",marginBottom:16 }}>
          <div style={{ fontSize:15,fontWeight:800,color:"#1a2e35",marginBottom:16 }}>Why MediPay exists</div>
          {[["The problem","Patients lose records when they move cities. Families cannot send money urgently for medical emergencies. Hospital cashier systems are cash-dependent and disconnected. People miss treatment because of payment friction."],["The solution","One registration. One file number. One Circle Programmable Wallet. Pay for any medical service from anywhere in the world. Your records and wallet travel with you forever."],["The technology","Built on Circle Programmable Wallets and USDC on ARC Testnet. Every payment settles in under one second. No bank delays. No transfer fees. MPC-secured — no seed phrase to lose."]].map(([title,body]) => (
            <div key={title} style={{ marginBottom:16,paddingBottom:16,borderBottom:"1px solid rgba(63,183,163,0.12)" }}>
              <div style={{ fontSize:13,fontWeight:700,color:"#20b2aa",marginBottom:6 }}>{title}</div>
              <p style={{ fontSize:13,color:"#5a7a8a",lineHeight:1.8,margin:0 }}>{body}</p>
            </div>
          ))}
        </div>
        <div style={{ background:"#fff",border:"1px solid rgba(63,183,163,0.18)",borderRadius:16,padding:"24px",marginBottom:16 }}>
          <div style={{ fontSize:15,fontWeight:800,color:"#1a2e35",marginBottom:16 }}>Global expansion</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10 }}>
            {[{flag:"🇳🇬",country:"Nigeria",status:"Live — Pilot",note:"12 hospitals"},{flag:"🇬🇭",country:"Ghana",status:"Coming Soon",note:"Korle-Bu Hospital"},{flag:"🇰🇪",country:"Kenya",status:"Coming Soon",note:"Kenyatta Hospital"},{flag:"🇿🇦",country:"South Africa",status:"Coming Soon",note:"Expanding"},{flag:"🇬🇧",country:"UK",status:"Coming Soon",note:"Diaspora payments"},{flag:"🌍",country:"Global",status:"Vision",note:"Any hospital, anywhere"}].map(({flag,country,status,note}) => (
              <div key={country} style={{ background:"#f7fbff",border:"1px solid rgba(63,183,163,0.15)",borderRadius:10,padding:"12px" }}>
                <div style={{ fontSize:22,marginBottom:4 }}>{flag}</div>
                <div style={{ fontSize:12,fontWeight:700,color:"#1a2e35" }}>{country}</div>
                <div style={{ fontSize:11,color:"#20b2aa",fontWeight:600,marginTop:2 }}>{status}</div>
                <div style={{ fontSize:11,color:"#9aa5b1",marginTop:2 }}>{note}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background:"#fff",border:"1px solid rgba(63,183,163,0.18)",borderRadius:16,padding:"24px",marginBottom:16 }}>
          <div style={{ fontSize:15,fontWeight:800,color:"#1a2e35",marginBottom:16 }}>Hospital network</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8 }}>
            {HOSPITALS.map(h => (
              <div key={h.id} style={{ background:"#f7fbff",border:"1px solid rgba(63,183,163,0.15)",borderRadius:8,padding:"10px" }}>
                <div style={{ fontSize:12,fontWeight:700,color:"#20b2aa" }}>{h.id}</div>
                <div style={{ fontSize:10,color:"#5a7a8a",marginTop:2,lineHeight:1.4 }}>{h.full}</div>
                <div style={{ fontSize:10,color:"#9aa5b1",marginTop:2 }}>📍 {h.state}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background:"linear-gradient(135deg,#f0fdfb,#e6f7f5)",border:"1px solid rgba(63,183,163,0.2)",borderRadius:16,padding:"24px" }}>
          <div style={{ fontSize:15,fontWeight:800,color:"#1a2e35",marginBottom:12 }}>Built by</div>
          <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:20 }}>
            <div style={{ width:50,height:50,borderRadius:"50%",background:"linear-gradient(135deg,#20b2aa,#0d8c85)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#fff",flexShrink:0 }}>E</div>
            <div>
              <div style={{ fontSize:14,fontWeight:700,color:"#1a2e35" }}>Esther Daka</div>
              <div style={{ fontSize:12,color:"#5a7a8a",marginTop:2 }}>Product vision and domain knowledge — healthcare payment infrastructure for underserved markets.</div>
              <a href="https://github.com/Florabeeh/MediPay" target="_blank" rel="noreferrer" style={{ fontSize:12,color:"#20b2aa",marginTop:4,display:"inline-block",textDecoration:"none",fontWeight:600 }}>GitHub: Florabeeh/MediPay →</a>
            </div>
          </div>
          <button onClick={() => { setShowAboutPage(false); }} style={{ background:"linear-gradient(135deg,#20b2aa,#0d8c85)",color:"#fff",border:"none",borderRadius:12,padding:"13px 28px",fontSize:14,fontWeight:700,cursor:"pointer" }}>← Back to MediPay</button>
        </div>
      </div>
    </div>
  );

  if (screen === "landing") return (
    <Shell {...shellProps} isLanding={true}>
      <div style={s.landWrap}>
        <div style={s.landGlow1} /><div style={s.landGlow2} /><div style={s.landGridPat} />

        <div style={s.landingGrid}>
          <div style={{ ...s.heroCopy, position: "relative", zIndex: 1 }}>
            <div style={s.heroPills}>
              <span style={s.heroPill}><Ico.Bolt size={14} /> Instant settlements</span>
              <span style={s.heroPill}><Ico.HeartIcon size={14} /> 12 hospitals</span>
              <span style={s.heroPill}><Ico.LinkIcon size={14} /> Share a payment link</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-1.5px", color: palette.text }}>MediPay</span>
              {DEMO_MODE && <span style={s.demoBadge}>Demo</span>}
            </div>
            <p style={{ fontSize: 13, color: palette.muted, marginBottom: 18 }}>Powered by Circle USDC on ARC Testnet</p>
            <h1 style={s.landH1}>Healthcare payments,<br /><span style={{ color: palette.brandDeep }}>finally simple.</span></h1>
            <p style={s.landSub}>Register once. Pay anywhere in the world.<br />Your Circle Programmable Wallet goes with you.</p>
            <button style={s.landCTA} onClick={requireAuth}><span>Get Started</span><Ico.ArrowRight size={18} /></button>
            <div style={s.landFeatures}>
              {[[<Ico.Shield size={20} />, "MPC Secured"], [<Ico.Bolt size={20} />, "< 1s Settlement"], [<Ico.NGFlag size={20} />, "12 Hospitals"], [<Ico.ActivityIcon size={20} />, "USDC Native"]].map(([ic, lb]) => (
                <div key={lb} style={s.landFeat}>{ic}<span style={{ fontSize: 12, color: palette.textSoft, marginTop: 4 }}>{lb}</span></div>
              ))}
            </div>
            <div style={s.landStats}>
              {[["12", "Hospitals"], ["< 1s", "Finality"], ["N0", "Fees"], ["36", "States"]].map(([v, l]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: palette.brandDeep }}>{v}</div>
                  <div style={{ fontSize: 11, color: palette.muted }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={s.heroVisual}>

            <div style={s.phoneMockupWrap}>
              <img src="/phone%20mockup.png" alt="MediPay app" style={s.phoneMockupImg} />
            </div>
          </div>
        </div>

        <div style={{ ...s.landSection, textAlign:"center", padding:"60px 24px" }}>
          <div style={{ fontSize:11,fontWeight:700,letterSpacing:".18em",textTransform:"uppercase",color:"#20b2aa",marginBottom:14 }}>How it works</div>
          <div style={{ fontSize:"clamp(24px,4vw,36px)",fontWeight:800,color:"#1a2e35",marginBottom:12,letterSpacing:"-0.5px" }}>Three steps to your first payment</div>
          <div style={{ fontSize:14,color:"#5a7a8a",marginBottom:40,maxWidth:560,margin:"0 auto 40px" }}>No bank account needed. No crypto knowledge required. Just sign up and pay.</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:24,maxWidth:800,margin:"0 auto",textAlign:"left" }}>
            {[
              { step:"01", title:"Register at any hospital", body:"Sign up with your Google account or email. Choose your hospital. Done in under 2 minutes.", icon:"🏥" },
              { step:"02", title:"Get your Circle Wallet", body:"A Circle Programmable Wallet is created instantly — MPC-secured, no seed phrase. You get 10 USDC testnet to start.", icon:"💳" },
              { step:"03", title:"Pay from anywhere", body:"Use your wallet to pay for any medical service. Share a payment link so family can pay on your behalf from anywhere.", icon:"⚡" },
            ].map(({ step, title, body, icon }) => (
              <div key={step} style={{ background:"#fff",border:"1px solid rgba(63,183,163,0.18)",borderRadius:16,padding:"24px",position:"relative" }}>
                <div style={{ fontSize:11,fontWeight:800,color:"#20b2aa",letterSpacing:".12em",marginBottom:12 }}>{step}</div>
                <div style={{ fontSize:28,marginBottom:12 }}>{icon}</div>
                <div style={{ fontSize:15,fontWeight:700,color:"#1a2e35",marginBottom:8 }}>{title}</div>
                <div style={{ fontSize:13,color:"#5a7a8a",lineHeight:1.7 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={s.landSection}>
          <div id="features-section"></div><div style={s.sectionTitle}>What MediPay does</div>
          <div style={s.sectionH2}>Medical payments across the World, powered by Circle USDC.</div>
          <div style={s.sectionLead}>MediPay replaces cash and bank transfers at hospitals with instant USDC settlement through a Circle Programmable Wallet — created automatically for every patient, no crypto knowledge needed.</div>
          <div style={{ height: 8 }} />
          <div style={s.sectionGrid}>
            {[
              [<Ico.LinkIcon size={22} />, "Share a payment link", "Generate a one-tap payment link and send via WhatsApp or SMS. The payer clicks and settles in seconds — no app download required."],
              [<Ico.CardIcon size={22} />, "Instant Circle Wallet", "A Circle Programmable Wallet is created on registration. MPC-secured, no seed phrase, and auto-funded with 10 USDC testnet on signup."],
              [<Ico.FolderIcon size={22} />, "File number travels with you", "Register once at any MediPay hospital. Your file number, records, and wallet follow you across all partnered hospitals."]
            ].map(([ic, t, d]) => (
              <div key={t} style={s.stepCard}>
                <div style={{ ...s.stepNo, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.65)", width: 52, height: 52, borderRadius: 18 }}>{ic}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: palette.text, marginBottom: 6 }}>{t}</div>
                <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.8 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        
        <div style={s.landSection}>
          <div style={s.sectionTitle}>Hospital network</div>
          <div style={s.sectionH2}>Built for real hospitals, not just a demo screen.</div>
          <div style={s.newsGrid}>
            {NEWS.map(n => (
              <div key={n.title} style={s.newsCard}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                  <span style={{ ...s.newsTagBadge, background: "rgba(63,183,163,0.10)", color: palette.brandDeep, border: "1px solid rgba(63,183,163,0.18)" }}>{n.tag}</span>
                  <span style={{ fontSize: 11, color: palette.muted }}>{n.date}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: palette.text, lineHeight: 1.4, marginBottom: 8 }}>{n.title}</div>
                <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.8 }}>{n.body}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={s.landSection}>
          <div style={s.ctaPanel}>
            <div style={{ maxWidth: 600 }}>
              <div style={s.sectionTitle}>Ready to get started?</div>
              <div style={s.sectionH2}>Choose your hospital and register in under 2 minutes.</div>
              <div style={s.sectionLead}>A Circle wallet is created automatically. You get 10 USDC testnet, a portable file number, and access to instant medical payments anywhere in the world.</div>
            </div>
            <button style={{ ...s.landCTA, marginBottom: 0 }} onClick={requireAuth}><span>Find your hospital</span><Ico.ArrowRight size={18} /></button>
          </div>
        </div>

        <div style={s.landingFooter}>
          <div style={s.footerGrid}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={s.logoMk}><span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>M</span></div>
                <span style={{ fontSize: 15, fontWeight: 700, color: palette.text }}>MediPay</span>
              </div>
              <p style={{ fontSize: 12, color: palette.muted, lineHeight: 1.7, maxWidth: 280 }}>Nigeria&#39;s blockchain-powered medical payment platform. Powered by Circle USDC on ARC Testnet.</p>
            </div>
            <div>
              <div style={s.footerTitle}>Product</div>
              <button style={s.footerLink} onClick={requireAuth}>Find a Hospital</button>
              <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 2.2, background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left", display: "block" }}>How it Works</div>
              <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 2.2, background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left", display: "block" }}>Pricing</div>
            </div>
            <div>
              <div style={s.footerTitle}>Network</div>
              <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 2.2, background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left", display: "block" }}>12 Hospitals</div>
              <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 2.2, background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left", display: "block" }}>36 States</div>
              <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 2.2, background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left", display: "block" }}>Circle Network</div>
            </div>
            <div>
              <div style={s.footerTitle}>Company</div>
              <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 2.2, background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left", display: "block" }}>About</div>
              <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 2.2, background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left", display: "block" }}>Blog</div>
              <div style={{ fontSize: 13, color: palette.textSoft, lineHeight: 2.2, background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left", display: "block" }}>Contact</div>
            </div>
          </div>
          <div style={s.footerBottom}>
            <span style={{ fontSize: 11, color: palette.muted }}>&copy; 2026 MediPay. All rights reserved.</span>
            <span style={{ fontSize: 11, color: palette.muted }}>Powered by Circle</span>
          </div>
        </div>
      </div>

      {/* ── Auth Modal (LATI glassmorphism) ──────────────────────── */}
      {showAuth && (
        <AuthModal
          authMode={authMode} setAuthMode={setAuthMode}
          authEmail={authEmail} setAuthEmail={setAuthEmail}
          authPw={authPw} setAuthPw={setAuthPw}
          authErr={authErr} loading={loading}
          onGoogle={() => { setAuthErr(""); signInWithGoogle().then(() => setShowAuth(false)).catch(e => setAuthErr(e.message)); }}
          onSubmit={() => handleFirebaseAuth(authMode)}
          onClose={() => { setShowAuth(false); setAuthErr(""); }}
        />
      )}
    </Shell>
  );

  if (screen === "hospitals") return (
    <Shell {...shellProps}>
      <PBar title="Select Hospital" onBack={() => setScreen("landing")} />
      <div style={s.pg}>
        <p style={s.sub}>Choose the hospital you are currently visiting.</p>
        <div style={s.searchWrap}>
          <Ico.SearchIcon size={16} color={palette.muted} />
          <input style={s.searchInp} placeholder="Search hospital or state..." value={searchH} onChange={e => setSearchH(e.target.value)} autoComplete="off" />
        </div>
        <div style={s.hGrid}>
          {filtered.map(h => (
            <button key={h.id} style={s.hCard} onClick={() => handleHospSelect(h)}>
              <div style={s.hIdBadge}>{h.id}</div>
              <div style={{ fontSize: 12, color: palette.textSoft, lineHeight: 1.4, margin: "8px 0 4px" }}>{h.full}</div>
              <div style={{ fontSize: 11, color: palette.muted, display: "flex", alignItems: "center", gap: 4 }}><Ico.MapPin size={12} color={palette.muted} /> {h.state} State</div>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );

  if (screen === "auth") return (
    <Shell {...shellProps}>
      <PBar title={hospital?.id} onBack={() => setScreen("hospitals")} />
      <div style={s.pg}>
        <div style={s.hospBanner}>
          <div style={{ fontSize: 26, fontWeight: 800, color: palette.brandDeep }}>{hospital?.id}</div>
          <div style={{ fontSize: 13, color: palette.textSoft }}>{hospital?.full}</div>
          <div style={{ fontSize: 11, color: palette.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><Ico.MapPin size={12} color={palette.muted} /> {hospital?.state} State</div>
        </div>
        <p style={s.sub}>No crypto experience needed. A Circle Programmable Wallet is created for you automatically — secured by MPC, no seed phrase.</p>
        <div style={s.authTabs}>
          {[["signup", "New Patient"], ["existing", "I Have a File Number"]].map(([m, l]) => (
            <button key={m} style={{ ...s.authTab, ...(authMode === m ? s.authTabOn : {}) }} onClick={() => setAuthMode(m)}>{l}</button>
          ))}
        </div>
        {authMode === "existing" ? (
          <div>
            <L t="Your MediPay file number" />
            <input style={s.inp} placeholder="e.g. UDUTH-123456-4521" value={existFN} onChange={e => setExistFN(e.target.value)} autoComplete="off" spellCheck={false} />
            <p style={s.hint}>This retrieves your records and links your wallet to <strong style={{ color: palette.text }}>{hospital?.id}</strong>.</p>
            {loading && <Stp s={step} />}
            <GBtn disabled={loading} onClick={handleAuth}>{loading ? "Retrieving..." : "Retrieve My Records"}</GBtn>
          </div>
        ) : (
          <div>
            <p style={s.hint}>Register at {hospital?.id} and get a Circle Programmable Wallet + 10 USDC testnet instantly.</p>
            <L t="Email address" />
            <input style={s.inp} placeholder="you@example.com" type="email" value={femail} onChange={e => setFemail(e.target.value)} autoComplete="off" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              <button style={s.socialBtn} onClick={handleAuth}><Ico.MailIcon size={16} />  Continue with Email</button>
              <button style={s.socialBtn} onClick={handleAuth}><Ico.Globe size={16} />  Continue with Google</button>
            </div>
            <p style={{ fontSize: 11, color: palette.muted, textAlign: "center" }}>Circle MPC-secured — no seed phrase exposed.</p>
          </div>
        )}
      </div>
    </Shell>
  );

  if (screen === "profile") return (
    <Shell {...shellProps}>
      <PBar title="Create Profile" onBack={() => setScreen("auth")} />
      <div style={s.pg}>
        <p style={s.sub}>Fill your details to register at {hospital?.id}.</p>
        <L t="Full name *" /><input style={s.inp} placeholder="First Middle Last" value={fname} onChange={e => setFname(e.target.value)} autoComplete="off" />
        <L t="Date of birth *" /><input style={s.inp} type="date" value={fdob} onChange={e => setFdob(e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><L t="Gender" /><select style={s.inp} value={fgender} onChange={e => setFgender(e.target.value)}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div><L t="Blood Group" /><select style={s.inp} value={fbloodGroup} onChange={e => setFbloodGroup(e.target.value)}><option value="">Select</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <option key={g}>{g}</option>)}</select></div>
        </div>
        <L t="Phone *" /><input style={s.inp} placeholder="+234..." type="tel" value={fphone} onChange={e => setFphone(e.target.value)} autoComplete="off" />
        <L t="State of residence" />
        <select style={s.inp} value={fstate} onChange={e => setFstate(e.target.value)}>
          <option value="">Select state</option>
          {["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"].map(st => <option key={st}>{st}</option>)}
        </select>
        <L t="Home address" /><input style={s.inp} placeholder="Street, LGA, State" value={faddress} onChange={e => setFaddress(e.target.value)} autoComplete="off" />
        <L t="Genotype" />
        <select style={s.inp} value={fgenotype} onChange={e => setFgenotype(e.target.value)}>
          <option value="">Select</option>{["AA","AS","SS","AC","SC"].map(g => <option key={g}>{g}</option>)}
        </select>
        {loading && <Stp s={step} />}
        <GBtn disabled={loading} onClick={handleProfileSubmit}>{loading ? "Setting up your account..." : "Submit & Register"}</GBtn>
      </div>
    </Shell>
  );

  if (screen === "fileno") return (
    <Shell {...shellProps}>
      <div style={s.pg}>
        <div style={s.fileCard}>
          <div style={s.fileCheck}><Ico.CheckIcon size={28} color="#25364b" /></div>
          <div style={{ fontSize: 13, color: palette.textSoft, marginBottom: 8 }}>Registration Successful</div>
          <div style={{ fontSize: 10, color: palette.muted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Your MediPay File Number</div>
          <div style={s.fileNo}>{fileNo}</div>
          <div style={{ fontSize: 12, color: palette.textSoft, marginBottom: 20 }}>{hospital?.full}</div>
          <div style={s.walletReveal}>
            <div style={{ fontSize: 10, color: palette.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Circle Programmable Wallet · ARC Testnet</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: palette.brandDeep, wordBreak: "break-all", marginBottom: 8 }}>{walletAddr}</div>
            {faucetSent && (
              <div style={s.faucetBadge}>
                <Ico.CheckIcon size={14} color={palette.brandDeep} /> 10 USDC auto-sent from Circle faucet!
                <a href={"https://faucet.circle.com"} target="_blank" rel="noreferrer"
                  style={{ display: "block", fontSize: 11, color: palette.brandDeep, marginTop: 4, textDecoration: "underline" }}>
                  Balance not showing? Claim manually here →
                </a>
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: palette.textSoft, lineHeight: 1.7, marginBottom: 20 }}>
            <strong style={{ color: palette.text }}>Save this number.</strong> Quote it at any MediPay hospital — your records and wallet follow you across Nigeria.
          </p>
          <GBtn onClick={() => { setTab("home"); setScreen("dashboard"); }}>Go to Dashboard →</GBtn>
        </div>
      </div>
    </Shell>
  );

  if (screen === "receipt") return (
    <Shell {...shellProps}>
      <PBar title="Payment Receipt" onBack={() => { setPaycat(""); setPayitem(""); setPaynote(""); setPayprice(0); setTab("pay"); setScreen("dashboard"); }} />
      <div style={s.pg}>
        <div style={{ textAlign:"center", padding:"24px 0 16px" }}>
          <div style={{ width:68,height:68,borderRadius:"50%",background:"linear-gradient(135deg,#20b2aa,#0d8c85)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:"0 0 40px rgba(32,178,170,0.35)",fontSize:30,animation:"popIn 0.5s ease" }}>✓</div>
          <div style={{ fontSize:20,fontWeight:800,color:"#1a2e35",marginBottom:4 }}>Payment Confirmed!</div>
          <div style={{ fontSize:13,color:"#5a7a8a" }}>Settled on ARC Testnet in under 1 second</div>
        </div>
        <div style={s.rcpCard}>
          <div style={s.rcpHeader}>
            <div style={s.logoMk}><span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>M</span></div>
            <div style={{ fontSize: 18, fontWeight: 800, color: palette.text }}>MediPay</div>
            <div style={{ fontSize: 13, color: palette.brandDeep, marginTop: 2 }}><Ico.CheckIcon size={14} color={palette.brandDeep} /> Payment Confirmed · ARC Testnet</div>
          </div>
          <div style={s.rcpDash} />
          {[["Patient", receipt?.patient], ["File Number", receipt?.fileNo], ["Hospital", receipt?.hospital], ["Category", receipt?.category], ["Service", receipt?.item], ["Note", receipt?.note || "--"], ["Amount (NGN)", fmt(receipt?.amount)], ["Amount (USDC)", receipt?.usdc + " USDC"], ["Network", "ARC-TESTNET"], ["Settlement", "< 1 second (Circle MPC)"], ["Date", receipt?.date]].map(([k, v]) => v && (
            <div key={k} style={s.rcpRow}><span style={{ fontSize: 12, color: palette.textSoft }}>{k}</span><span style={{ fontSize: 12, color: palette.text, fontWeight: 500, textAlign: "right", wordBreak: "break-word", maxWidth: "55%" }}>{v}</span></div>
          ))}
          <div style={s.rcpDash} />
          <div style={s.rcpTotal}>{fmt(receipt?.amount)}</div>
          <div style={{ fontSize: 12, color: palette.muted, textAlign: "center", marginTop: 4 }}>{receipt?.usdc} USDC · Circle ARC Testnet</div>
          <div style={{ fontSize: 9, color: "#d9e5ed", textAlign: "center", margin: "12px 0 4px", letterSpacing: 1 }}>|||||||||||||||||||||||||||||||||||||||||||||||||||||</div>
          <p style={{ fontSize: 10, color: palette.muted, textAlign: "center", wordBreak: "break-all" }}>Tx: {receipt?.id}</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={s.outlineBtn} onClick={() => openShareReceipt(receipt)}><Ico.ShareIcon size={14} /> Share</button>
          <button style={s.outlineBtn} onClick={() => downloadReceiptImage(receipt)}><Ico.DownloadIcon size={14} /> Save as Image</button>
          <GBtn xstyle={{ flex: 2 }} onClick={() => { setPaycat(""); setPayitem(""); setPaynote(""); setPayprice(0); setTab("pay"); setScreen("dashboard"); }}>New Payment →</GBtn>
        </div>
      </div>
      {showShareModal && shareReceipt && <ShareModal rec={shareReceipt} copied={rcpCopied} onCopy={copyReceiptText} onNative={nativeShare} onDownload={downloadReceiptImage} onClose={() => setShowShareModal(false)} />}
    </Shell>
  );

  if (screen === "dashboard") return (
    <Shell showNav {...shellProps}>
      {tab === "home" && (
        <div style={s.pg}>
          <div style={s.welcomeBanner}>
            <div style={s.welcomeGlow} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 13, color: palette.textSoft, marginBottom: 4 }}>Welcome back</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: palette.text }}>{user?.name || "Patient"}</div>
              <div style={{ fontSize: 12, color: palette.brandDeep, marginTop: 4, fontFamily: "monospace" }}>{fileNo}</div>
            </div>
            <div style={s.welcomeBalance}>
              <div style={{ fontSize: 10, color: palette.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>USDC Balance</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: palette.brandDeep }}>{usdcBal !== null ? usdcBal : "--"}</div>
              <div style={{ fontSize: 11, color: palette.muted }}>ARC Testnet</div>
            </div>
          </div>
          <div style={s.statsRow}>
            {[["12","Hospitals"],["< 1s","Settlement"],["N0","Transfer Fees"],["36","States"]].map(([v,l]) => (
              <div key={l} style={s.statBox}><div style={s.statV}>{v}</div><div style={s.statL}>{l}</div></div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <button style={s.qaCard} onClick={() => switchTab("pay")}>
              <div style={{ ...s.qaIcon, background: "linear-gradient(135deg,#dff7ef,#ecfbf6)", border: "1px solid rgba(63,183,163,0.22)" }}><Ico.CardIcon size={20} /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: palette.text }}>Make Payment</div>
              <div style={{ fontSize: 12, color: palette.textSoft }}>Tests, drugs, surgery</div>
            </button>
            <button style={s.qaCard} onClick={() => switchTab("history")}>
              <div style={{ ...s.qaIcon, background: "linear-gradient(135deg,#e8f5ff,#f0f1ff)", border: "1px solid #cde9ff" }}><Ico.ClockIcon size={20} /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: palette.text }}>History</div>
              <div style={{ fontSize: 12, color: palette.textSoft }}>{history.length} transaction{history.length !== 1 ? "s" : ""}</div>
            </button>
          </div>
          <SL t="Your Linked Hospitals" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {linked.map(h => (
              <div key={h.id} style={s.linkedCard}>
                <div style={s.linkedIcon}>{h.id.slice(0, 4)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>{h.id}</div>
                  <div style={{ fontSize: 11, color: palette.textSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.full}</div>
                  <div style={{ fontSize: 10, color: palette.muted, display: "flex", alignItems: "center", gap: 4 }}><Ico.MapPin size={10} color={palette.muted} />{h.state} State</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: palette.brand }} />
                  <span style={{ fontSize: 11, color: palette.brandDeep, fontWeight: 600 }}>Active</span>
                </div>
              </div>
            ))}
          </div>
          <div style={s.globalCard}>
            <div style={s.globalGlow} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Ico.Globe size={22} color={palette.text} /><span style={{ fontSize: 16, fontWeight: 800, color: palette.text }}>Global MediPay</span>
                  <span style={s.comingSoonBadge}>Coming Soon</span>
                </div>
                <p style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.6, maxWidth: 400 }}>Once registered in Nigeria, use MediPay in Ghana, Kenya, South Africa, UK and beyond.</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {["GH Ghana","KE Kenya","ZA South Africa","GB UK"].map(c => (
                  <div key={c} style={{ fontSize: 12, color: palette.textSoft, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: palette.lineStrong }} />{c} <span style={{ fontSize: 10, color: palette.muted }}>Q4 2026</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <SL t="MediPay Updates" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12, marginBottom: 24 }}>
            {NEWS.map((n, i) => (
              <div key={i} style={s.newsCard}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ ...s.newsTagBadge, background: "rgba(63,183,163,0.10)", color: palette.brandDeep, border: "1px solid rgba(63,183,163,0.18)" }}>{n.tag}</span>
                  <span style={{ fontSize: 10, color: palette.muted }}>{n.date}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: palette.text, marginBottom: 6, lineHeight: 1.4 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: palette.textSoft, lineHeight: 1.6 }}>{n.body}</div>
              </div>
            ))}
          </div>
          <SL t="Health Tips" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12, marginBottom: 24 }}>
            {HEALTH_TIPS.map((t, i) => (
              <div key={i} style={{ ...s.tipCard, borderTop: "3px solid " + t.color }}>
                <div style={{ marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: palette.text, marginBottom: 6 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: palette.textSoft, lineHeight: 1.6 }}>{t.body}</div>
              </div>
            ))}
          </div>
          <SL t="About MediPay" />
          <div style={{ ...s.card, marginBottom: 30, padding: "22px", background: "linear-gradient(135deg,#ffffff,#eefbf6)", border: "1px solid rgba(63,183,163,0.18)" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: palette.text, marginBottom: 10 }}>What is MediPay?</div>
            <p style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.9, marginBottom: 10 }}>Nigeria's first blockchain-powered medical payment platform. Register once, pay anywhere — tests, surgery, medication, therapy — without cash, without queues.</p>
            <p style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.9, marginBottom: 16 }}>Powered by <strong style={{ color: palette.brandDeep }}>Circle Programmable Wallets</strong> and <strong style={{ color: palette.brandDeep }}>Circle Nanopayments on ARC Testnet</strong>.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Circle Programmable Wallet","Nanopayments","ARC Testnet","x402 Protocol","USDC","Auto Faucet"].map(t => (
                <span key={t} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 100, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", color: palette.brandDeep, fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "pay" && (
        <div style={s.pg}>
          <div style={s.payHdr}>
            <div><div style={{ fontSize: 18, fontWeight: 800, color: palette.text }}>Make a Payment</div><div style={{ fontSize: 12, color: palette.textSoft, marginTop: 2 }}>at {hospital?.id}</div></div>
            {usdcBal !== null && usdcBal !== "--" && (
              <div style={s.payBal}>
                <span style={{ fontSize: 10, color: palette.muted }}>Balance</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: palette.brandDeep }}>{usdcBal} USDC</span>
                <button style={{ background: "none", border: "none", color: palette.brandDeep, cursor: "pointer", fontSize: 14 }} onClick={() => refreshBalance()}><Ico.RefreshIcon size={14} /></button>
              </div>
            )}
          </div>
          <L t="Payment category" />
          <div style={{ position: "relative", marginBottom: 14 }}>
            <button style={s.dropBtn} onClick={() => { setShowCat(!showCat); setShowItem(false); }}>
              <span style={{ flex: 1, textAlign: "left" }}>{paycat ? (typeof CATS[paycat].icon === "string" ? CATS[paycat].icon : "") + "  " + paycat : "Select category..."}</span>
              <Ico.ChevronDown size={14} color={palette.muted} />
            </button>
            {showCat && (
              <div style={s.dropMenu}>
                {Object.keys(CATS).map(cat => (
                  <button key={cat} style={s.dropItem} onClick={() => { setPaycat(cat); setPayitem(""); setPayprice(0); setShowCat(false); }}>
                    <span style={{ fontSize: 18 }}>{CATS[cat].icon}</span><span style={{ flex: 1, fontWeight: 500 }}>{cat}</span>
                    <span style={{ fontSize: 11, color: palette.muted }}>{CATS[cat].items.length} services</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {paycat && (
            <div>
              <L t={"Select " + paycat + " type"} />
              <div style={{ position: "relative", marginBottom: 14 }}>
                <button style={s.dropBtn} onClick={() => { setShowItem(!showItem); setShowCat(false); }}>
                  <span style={{ flex: 1, textAlign: "left" }}>{payitem || "Choose " + paycat + "..."}</span><Ico.ChevronDown size={14} color={palette.muted} />
                </button>
                {showItem && (
                  <div style={s.dropMenu}>
                    {CATS[paycat].items.map((it, i) => (
                      <button key={it} style={s.dropItem} onClick={() => { setPayitem(it); setPayprice(CATS[paycat].prices[i]); setShowItem(false); }}>
                        <span style={{ flex: 1 }}>{it}</span><span style={{ color: palette.brandDeep, fontWeight: 700, fontSize: 13 }}>{fmt(CATS[paycat].prices[i])}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {payitem && (
            <div style={s.priceBox}>
              <div style={{ fontSize: 12, color: palette.textSoft }}>Total to pay</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: palette.brandDeep, letterSpacing: "-1px" }}>{fmt(payprice)}</div>
              <div style={{ fontSize: 12, color: palette.muted }}>≈ {(payprice / NGN_USDC).toFixed(4)} USDC · ARC Testnet</div>
            </div>
          )}
          <L t="Note for hospital (optional)" />
          <input style={s.inp} placeholder="e.g. Prescribed by Dr. Musa Aliyu" value={paynote} onChange={e => setPaynote(e.target.value)} autoComplete="off" />
          {loading && <Stp s={step} />}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 8 }}>
            <GBtn disabled={!payitem || loading} onClick={handlePay}>{loading ? "Processing on ARC..." : payitem ? "Pay " + fmt(payprice) : "Pay"}</GBtn>
            <button style={{ ...s.outlineBtn, flexDirection: "column", gap: 2, padding: "14px 10px", opacity: !payitem ? 0.5 : 1 }} disabled={!payitem} onClick={generatePayLink}>
              <Ico.LinkIcon size={18} /><span style={{ fontSize: 11, fontWeight: 600 }}>Share Link</span>
            </button>
          </div>
          <p style={{ fontSize: 11, color: palette.muted, textAlign: "center", lineHeight: 1.6 }}>Use Share Link to send a payment request to a family member.</p>
        </div>
      )}

      {tab === "history" && (
        <div style={s.pg}>
          <div style={{ fontSize: 18, fontWeight: 800, color: palette.text, marginBottom: 4 }}>Transaction History</div>
          <div style={{ fontSize: 12, color: palette.textSoft, marginBottom: 20 }}>{history.length} total · {history.filter(h => h.status === "pending").length} pending</div>
          {history.length === 0 ? (
            <div style={s.empty}><Ico.ClockIcon size={36} color={palette.muted} /><div style={{ marginBottom: 6 }}></div><div style={{ fontSize: 15, fontWeight: 600, color: palette.textSoft, marginBottom: 6 }}>No transactions yet</div><div style={{ fontSize: 13, color: palette.muted }}>Make your first payment from the Pay tab</div></div>
          ) : history.map(r => (
            <div key={r.id} style={{ ...s.histCard, ...(r.status === "pending" ? { borderLeft: "4px solid #f5c85b" } : { borderLeft: "4px solid #3fb7a3" }) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>{CATS[r.category]?.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>{r.category}</span>
                    <span style={{ ...s.statusBadge, ...(r.status === "pending" ? s.statusPending : s.statusDone) }}>{r.status === "pending" ? "Pending" : <span><Ico.CheckIcon size={11} /> Confirmed</span>}</span>
                    {r.type === "payment_link" && <span style={s.linkBadge}><Ico.LinkIcon size={11} /> Link</span>}
                  </div>
                  <div style={{ fontSize: 12, color: palette.textSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.item}</div>
                  <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>{r.date}</div>
                  {r.status === "pending" && r.link && (
                    <button style={{ fontSize: 11, color: "#2872b2", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4, textDecoration: "underline" }} onClick={() => { setPayLink(r.link); setShowPayLink(true); }}>View payment link</button>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: r.status === "pending" ? "#b17700" : palette.brandDeep }}>{fmt(r.amount)}</div>
                  <div style={{ fontSize: 11, color: palette.muted }}>{r.usdc} USDC</div>
                  {r.status === "confirmed" && (
                    <button style={{ fontSize: 11, color: palette.textSoft, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 6, textDecoration: "underline" }} onClick={() => openShareReceipt(r)}><Ico.ShareIcon size={14} /> Share</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "profile" && (
        <div style={s.pg}>
          <div style={s.profileHero}>
            <div style={s.profileGlow} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={s.avatar}>{(user?.name || "P")[0]}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: palette.text }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: palette.brandDeep, fontFamily: "monospace", marginTop: 4 }}>{fileNo}</div>
                <div style={{ fontSize: 12, color: palette.textSoft, marginTop: 2 }}>{hospital?.id} · {hospital?.state}</div>
              </div>
            </div>
          </div>
          <div style={s.walletCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div><div style={{ fontSize: 11, color: palette.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Circle Programmable Wallet</div><div style={{ fontSize: 11, color: palette.textSoft }}>ARC Testnet · SCA Account</div></div>
              <div style={{ width: 34, height: 34, borderRadius: 12, background: "linear-gradient(135deg,#55c9b6,#2eaa99)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: 15, boxShadow: "0 10px 22px rgba(63,183,163,0.20)" }}>C</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: palette.brandDeep, wordBreak: "break-all", flex: 1, padding: "8px 10px", background: "#f5fbfd", borderRadius: 8 }}>{walletAddr || "--"}</div>
              <CopyBtn text={walletAddr} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 11, color: palette.muted, marginBottom: 3 }}>USDC Balance</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: palette.brandDeep }}>{balLoading ? "..." : usdcBal !== null ? usdcBal : "--"}</span>
                  <span style={{ fontSize: 13, color: palette.muted }}>USDC</span>
                </div>
              </div>
              <button style={s.refBtn} onClick={() => refreshBalance()}><Ico.RefreshIcon size={14} /> Refresh</button>
            </div>
            {faucetSent && (
              <div style={s.faucetBadge}>
                <Ico.CheckIcon size={14} color={palette.brandDeep} /> 10 USDC auto-sent from Circle faucet on registration
                <a href={"https://faucet.circle.com"} target="_blank" rel="noreferrer"
                  style={{ display: "block", fontSize: 11, color: palette.brandDeep, marginTop: 4, textDecoration: "underline" }}>
                  Balance still 0? Claim manually here →
                </a>
              </div>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700,
                  color: palette.brandDeep, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)",
                  borderRadius: 8, padding: "7px 14px", textDecoration: "none" }}>
                <Ico.DropIcon size={14} /> Get Free Test USDC (Public Faucet)
              </a>
              <span style={{ fontSize: 11, color: palette.muted }}>Paste your wallet address above at the faucet</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: palette.muted }}>Wallet ID: {walletId || "--"}</div>
          </div>
          <SL t="Profile Details" />
          <div style={s.card}>
            {[["Home Hospital", hospital?.id + " · " + hospital?.state], ["Email", user?.email || form.email || "--"], ["Phone", user?.phone || form.phone || "--"], ["Date of Birth", user?.dob || form.dob || "--"], ["Blood Group", user?.bloodGroup || form.bloodGroup || "--"], ["Genotype", user?.genotype || form.genotype || "--"], ["State", user?.state || form.state || "--"], ["Network", "ARC-TESTNET (Circle)"]].map(([k, v]) => v && (
              <div key={k} style={s.profRow}><span style={{ fontSize: 13, color: palette.textSoft }}>{k}</span><span style={{ fontSize: 13, color: palette.text, fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>{v}</span></div>
            ))}
          </div>
          <div style={{ marginTop: 22 }}>
            <SL t="Hospital Access" />
            <p style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.6, marginBottom: 14 }}>Moved to a new state? Link your records to another hospital. Your file number and Circle wallet remain unchanged.</p>
            <button style={s.transferBtn} onClick={() => { setShowTrf(true); setTrfDone(false); setTrfTarget(""); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico.LinkIcon size={18} /></div>
                <div><div style={{ fontSize: 15, fontWeight: 700, color: palette.text }}>Link to Another Hospital</div><div style={{ fontSize: 12, color: palette.textSoft, marginTop: 2 }}>Currently linked to {linked.length} hospital{linked.length !== 1 ? "s" : ""}</div></div>
              </div>
              <span style={{ color: palette.brandDeep, fontSize: 22 }}>›</span>
            </button>
          </div>
          <div style={{ ...s.globalCard, marginTop: 20 }}>
            <div style={s.globalGlow} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Ico.Globe size={22} color={palette.text} /><span style={{ fontSize: 15, fontWeight: 700, color: palette.text }}>International Use</span><span style={s.comingSoonBadge}>Coming Soon</span>
              </div>
              <p style={{ fontSize: 12, color: palette.textSoft, lineHeight: 1.6 }}>Your MediPay wallet will work in Ghana, Kenya, South Africa and beyond.</p>
            </div>
          </div>
          <button style={s.signOutBtn} onClick={() => { logOut().catch(() => {}); setUser(null); resetForm(); setFileNo(""); setWalletId(""); setWalletAddr(""); setUsdcBal(null); setFaucetSent(false); setHistory([]); setLinked([]); setScreen("landing"); }}>Sign Out</button>
        </div>
      )}

      {showTrf && (
        <Mdl onClose={() => setShowTrf(false)}>
          {!trfDone ? (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: palette.text, marginBottom: 6 }}>Link Records to New Hospital</div>
              <p style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.6, marginBottom: 14 }}>Your file <strong style={{ color: palette.brandDeep }}>{fileNo}</strong> and payment history will be accessible at the new hospital.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {linked.map(h => <span key={h.id} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", color: palette.brandDeep, fontWeight: 600 }}><Ico.CheckIcon size={10} color={palette.brandDeep} /> {h.id}</span>)}
              </div>
              <L t="Select hospital to link" />
              <div style={{ position: "relative", marginBottom: 16 }}>
                <button style={s.dropBtn} onClick={() => setTrfDrop(!trfDrop)}>
                  <span style={{ flex: 1, textAlign: "left" }}>{trfTarget ? HOSPITALS.find(h => h.id === trfTarget)?.full : "Choose hospital..."}</span><Ico.ChevronDown size={14} />
                </button>
                {trfDrop && (
                  <div style={s.dropMenu}>
                    {availTrf.length === 0 ? <div style={{ padding: 14, color: palette.muted, textAlign: "center", fontSize: 13 }}>All hospitals already linked</div> : availTrf.map(h => (
                      <button key={h.id} style={s.dropItem} onClick={() => { setTrfTarget(h.id); setTrfDrop(false); }}>
                        <strong style={{ color: palette.brandDeep, minWidth: 56 }}>{h.id}</strong><span style={{ flex: 1, fontSize: 12 }}>{h.full}</span><span style={{ fontSize: 11, color: palette.muted }}>{h.state}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {loading && <Stp s="Linking records on ARC Testnet..." />}
              <div style={{ display: "flex", gap: 10 }}>
                <button style={s.outlineBtn} onClick={() => setShowTrf(false)}>Cancel</button>
                <GBtn disabled={!trfTarget || loading} xstyle={{ flex: 1 }} onClick={handleTransfer}>{loading ? "Linking..." : "Link Records"}</GBtn>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}><Ico.CheckIcon size={40} color={palette.brandDeep} /></div>
              <div style={{ fontSize: 18, fontWeight: 800, color: palette.text, marginBottom: 8 }}>Records Linked!</div>
              <p style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.6, marginBottom: 20 }}>Records now accessible at <strong style={{ color: palette.brandDeep }}>{HOSPITALS.find(h => h.id === trfTarget)?.id}</strong>. Quote file <strong style={{ color: palette.brandDeep }}>{fileNo}</strong>.</p>
              <GBtn onClick={() => setShowTrf(false)}><Ico.CheckIcon size={14} /> Done</GBtn>
            </div>
          )}
        </Mdl>
      )}

      {showPayLink && (
        <Mdl onClose={() => setShowPayLink(false)}>
          <div style={{ fontSize: 18, fontWeight: 800, color: palette.text, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}><Ico.LinkIcon size={20} /> Payment Link Created</div>
          <p style={{ fontSize: 13, color: palette.textSoft, lineHeight: 1.6, marginBottom: 16 }}>Share this with a family member. It appears in your History as Pending until payment is completed.</p>
          <div style={{ background: "#f5fbfd", border: "1px solid rgba(63,183,163,0.22)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: palette.muted, marginBottom: 6 }}>Payment details</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: palette.text, marginBottom: 4 }}>{payitem}</div>
            <div style={{ fontSize: 12, color: palette.textSoft, marginBottom: 2 }}>Hospital: {hospital?.id}</div>
            <div style={{ fontSize: 12, color: palette.textSoft, marginBottom: 8 }}>File No: {fileNo}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: palette.brandDeep }}>{fmt(payprice)}</div>
          </div>
          <div style={{ background: "#f5fbfd", border: "1px solid " + palette.lineStrong, borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: palette.textSoft, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{payLink}</span>
            <button style={s.refBtn} onClick={copyPayLink}>{payLinkCopied ? "Copied" : "Copy"}</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={{ ...s.greenBtn }} onClick={sharePayLink}><Ico.ChatBubble size={16} /> Share via WhatsApp / SMS</button>
            <button style={s.outlineBtn} onClick={() => setShowPayLink(false)}>Close</button>
          </div>
        </Mdl>
      )}

      {showShareModal && shareReceipt && <ShareModal rec={shareReceipt} copied={rcpCopied} onCopy={copyReceiptText} onNative={nativeShare} onDownload={downloadReceiptImage} onClose={() => setShowShareModal(false)} />}
    </Shell>
  );

  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Shell({ children, showNav, isMobile, menuOpen, setMenuOpen, NAV, tab, switchTab, walletAddr, fileNo, balLoading, usdcBal, toast, isLanding, onRequireAuth, setShowAboutPage }) {
  return (
    <div style={s.shell}>
      <HealthObjects dense={showNav} />
      <div style={s.topbar}>
        <div style={s.tbL}>
          {showNav && isMobile && <button style={s.burger} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <Ico.CloseIcon size={16} /> : <Ico.MenuIcon size={16} />}</button>}
          <div style={s.logoMk}><span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>M</span></div>
          <div><span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", color: palette.text }}>MediPay</span>{DEMO_MODE && <span style={s.demoBadge}>Demo</span>}</div>
        </div>
        {isLanding && !isMobile && (
          <div style={s.tbC}>
            {["Features", "Hospitals", "About"].map((lb) => (
              <button key={lb} style={s.topBtn} onClick={() => {
                if (lb === "Hospitals") { onRequireAuth(); return; }
                if (lb === "About") { setShowAboutPage(true); window.scrollTo({top:0}); return; }
                if (lb === "Features") { const el = document.getElementById("features-section"); if(el) el.scrollIntoView({behavior:"smooth"}); }
              }}>{lb}</button>
            ))}
          </div>
        )}
        {isLanding ? (
          <div style={s.tbR}>
            {!isMobile && <button style={s.landNavCta} onClick={onRequireAuth}>Get Started <Ico.ArrowRight size={14} /></button>}
          </div>
        ) : showNav && (
          <div style={s.tbR}>
            {!isMobile && NAV.map(([k, ic, lb]) => (
              <button key={k} style={{ ...s.topBtn, ...(tab === k ? s.topBtnOn : {}) }} onClick={() => switchTab(k)}><span>{ic}</span><span>{lb}</span></button>
            ))}
            <div style={s.balChip}>
              <span style={{ fontSize: 10, color: palette.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Balance</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: palette.brandDeep }}>{balLoading ? "..." : usdcBal !== null ? usdcBal + " USDC" : "--"}</span>
            </div>
          </div>
        )}
      </div>
      {showNav && isMobile && menuOpen && (
        <div style={s.drawer}>
          {NAV.map(([k, ic, lb]) => (
            <button key={k} style={{ ...s.dItem, ...(tab === k ? s.dItemOn : {}) }} onClick={() => switchTab(k)}>
              <span style={{ fontSize: 22 }}>{ic}</span><span style={{ fontSize: 15, fontWeight: tab === k ? 700 : 400 }}>{lb}</span>
              {tab === k && <div style={s.dItemDot} />}
            </button>
          ))}
          <div style={{ padding: "14px 20px", borderTop: "1px solid " + palette.line, marginTop: 4 }}>
            <div style={{ fontSize: 11, color: palette.muted, marginBottom: 3 }}>File Number</div>
            <div style={{ fontSize: 13, fontFamily: "monospace", color: palette.brandDeep, fontWeight: 600 }}>{fileNo || "--"}</div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", minHeight: "calc(100vh - 66px)", position: "relative", zIndex: 1 }}>
        {showNav && !isMobile && (
          <div style={s.sidebar}>
            <div style={{ padding: "20px 12px 12px" }}>
              <div style={{ fontSize: 10, color: palette.muted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12, paddingLeft: 6 }}>Navigation</div>
              {NAV.map(([k, ic, lb]) => (
                <button key={k} style={{ ...s.sideBtn, ...(tab === k ? s.sideBtnOn : {}) }} onClick={() => switchTab(k)}>
                  <span style={{ fontSize: 18 }}>{ic}</span><span style={{ fontSize: 14, fontWeight: tab === k ? 700 : 400 }}>{lb}</span>
                  {tab === k && <div style={{ marginLeft: "auto", width: 4, height: 20, borderRadius: 2, background: palette.brand }} />}
                </button>
              ))}
            </div>
            <div style={s.sidefoot}>
              <div style={{ fontSize: 10, color: palette.muted, marginBottom: 4, fontWeight: 600 }}>Circle Wallet</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: palette.brandDeep, wordBreak: "break-all", marginBottom: 4 }}>{walletAddr ? walletAddr.slice(0, 22) + "..." : "--"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: palette.brand }} /><span style={{ fontSize: 10, color: palette.muted }}>ARC-TESTNET</span></div>
            </div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, marginLeft: showNav && !isMobile ? 220 : 0 }}>{children}</div>
      </div>
      {toast.msg && <div style={{ ...s.toast, ...(toast.type === "err" ? { background: palette.danger } : {}) }}>{toast.msg}</div>}
    </div>
  );
}

const HealthObjects = ({ dense }) => (
  <div style={s.bioLayer} aria-hidden="true">
    <div style={{ ...s.bioBlob, ...s.bioBlobMint, top: dense ? 96 : 122, left: dense ? 250 : "8%", transform: "rotate(-18deg)", filter: dense ? "blur(1.5px)" : "blur(.4px)", opacity: dense ? 0.28 : 0.58 }}><Ico.PlusIcon size={24} /></div>
    <div style={{ ...s.bioBlob, ...s.bioBlobBlue, top: dense ? 168 : "18%", right: dense ? "7%" : "10%", transform: "rotate(22deg)", filter: dense ? "blur(6px)" : "blur(1px)", opacity: dense ? 0.22 : 0.46 }}><Ico.Bubbles size={22} /></div>
    <div style={{ ...s.bioBlob, ...s.bioBlobPeach, bottom: dense ? "18%" : "13%", left: dense ? "7%" : "16%", transform: "rotate(14deg)", filter: dense ? "blur(7px)" : "blur(2px)", opacity: dense ? 0.20 : 0.42 }}><Ico.PillIcon size={24} /></div>
    <div style={{ ...s.bioBlob, ...s.bioBlobLav, bottom: dense ? "10%" : "18%", right: dense ? "14%" : "18%", transform: "rotate(-28deg)", filter: dense ? "blur(9px)" : "blur(3px)", opacity: dense ? 0.18 : 0.34 }}><Ico.BrainIcon size={24} /></div>
    <div style={{ ...s.bioOrb, top: dense ? "44%" : "36%", left: dense ? "78%" : "72%", background: "linear-gradient(145deg,#ffffff,#dff7ef 52%,#93e0d0)" }} />
    <div style={{ ...s.bioOrb, width: 42, height: 42, bottom: dense ? "30%" : "26%", left: dense ? "28%" : "10%", background: "linear-gradient(145deg,#ffffff,#e8f5ff 55%,#9acdf3)", filter: "blur(1.5px)", opacity: dense ? .22 : .36 }} />
  </div>
);

const CopyBtn = ({ text }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = () => { if (!text) return; navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); };
  return (
    <button onClick={copy} style={{ flexShrink: 0, background: copied ? palette.mint : "#fff", border: "1px solid " + (copied ? "rgba(63,183,163,0.30)" : palette.lineStrong), borderRadius: 12, padding: "8px 12px", fontSize: 12, color: copied ? palette.brandDeep : palette.textSoft, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap", transition: "all .2s" }}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
};
const PBar = ({ title, onBack }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid " + palette.line, position: "sticky", top: 0, background: "#f5fbfd", zIndex: 20 }}>
    <button style={{ background: "none", color: palette.textSoft, fontSize: 13, cursor: "pointer", padding: "6px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, border: "1px solid " + palette.lineStrong }} onClick={onBack}><Ico.ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Back</button>
    <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: palette.text }}>{title}</span>
  </div>
);
const GBtn = ({ children, onClick, disabled, xstyle }) => (
  <button style={{ background: disabled ? palette.lineStrong : "linear-gradient(135deg,#55c9b6,#2eaa99)", color: "#fff", border: "none", borderRadius: 18, padding: "14px 20px", fontSize: 14, fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", width: "100%", marginBottom: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: disabled ? "none" : btnShadow, ...(xstyle || {}) }} disabled={disabled} onClick={onClick}>{children}</button>
);
const ShareModal = ({ rec, copied, onCopy, onNative, onDownload, onClose }) => (
  <Mdl onClose={onClose}>
    <div style={{ fontSize: 18, fontWeight: 800, color: palette.text, marginBottom: 10 }}>Share Receipt</div>
    <div style={{ background: "#f5fbfd", border: "1px solid " + palette.lineStrong, borderRadius: 10, padding: 14, fontFamily: "monospace", fontSize: 11, lineHeight: 1.9, color: palette.textSoft, marginBottom: 16, maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap" }}>
      {/* eslint-disable-next-line no-useless-concat */}
      {["== MEDIPAY RECEIPT ==","Patient:  "+rec.patient,"File No:  "+rec.fileNo,"Hospital: "+(rec.hospital||""),"Category: "+rec.category,"Service:  "+rec.item,rec.note?"Note:     "+rec.note:null,"Amount:   "+("N"+Number(rec.amount).toLocaleString()),"USDC:     "+rec.usdc+" USDC","Network:  ARC-TESTNET","Date:     "+rec.date,"Tx ID:    "+rec.id,"========================","Powered by Circle on ARC Testnet"].filter(Boolean).join("\n")}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button style={{ background: "linear-gradient(135deg,#55c9b6,#2eaa99)", color: "#fff", border: "none", borderRadius: 18, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" }} onClick={() => onCopy(rec)}>{copied ? <span><Ico.CheckIcon size={14} /> Copied to clipboard!</span> : <span><Ico.FolderIcon size={16} /> Copy Receipt Text</span>}</button>
      <button style={{ background: "linear-gradient(135deg,#78bff0," + palette.blue + ")", color: "#fff", border: "none", borderRadius: 18, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" }} onClick={() => onNative(rec)}><Ico.ExternalLink size={16} /> Share via WhatsApp / SMS</button>
      <button style={{ background: "linear-gradient(135deg,#b6b9ff," + palette.lavender + ")", color: "#fff", border: "none", borderRadius: 18, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" }} onClick={() => onDownload(rec)}><Ico.DownloadIcon size={14} /> Save as Image (PNG)</button>
      <button style={{ background: "none", border: "1px solid " + palette.lineStrong, color: palette.textSoft, borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer" }} onClick={onClose}>Close</button>
    </div>
  </Mdl>
);
const L = ({ t }) => <div style={{ fontSize: 12, color: palette.textSoft, fontWeight: 600, marginBottom: 6, marginTop: 6 }}>{t}</div>;
const SL = ({ t }) => <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: palette.muted, marginBottom: 12 }}>{t}</div>;
const Stp = ({ s: st }) => st ? <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: palette.brandDeep, padding: "10px 0", lineHeight: 1.5 }}><span style={{ animation: "spin .8s linear infinite", display: "inline-block" }}>◌</span>{st}</div> : null;
const Mdl = ({ children, onClose }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(37,54,75,0.28)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", padding: "20px" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ background: palette.surfaceSoft, borderRadius: "20px", padding: "28px 24px 36px", width: "100%", maxWidth: 540, maxHeight: "85vh", overflowY: "auto", border: "1px solid " + palette.lineStrong, boxShadow: "0 24px 64px rgba(80,110,140,0.22)" }}>{children}</div>
  </div>
);

// ─── Auth Modal (LATI glassmorphism) ──────────────────────────────────────────
const AuthModal = ({ authMode, setAuthMode, authEmail, setAuthEmail, authPw, setAuthPw, authErr, loading, onGoogle, onSubmit, onClose }) => (
  <div style={{
    position: "fixed", inset: 0, zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(37,54,75,0.32)",
    backdropFilter: "blur(10px) saturate(150%)",
    WebkitBackdropFilter: "blur(10px) saturate(150%)",
    padding: 20,
  }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{
      background: "rgba(255,255,255,0.88)",
      backdropFilter: "blur(24px) saturate(150%)",
      WebkitBackdropFilter: "blur(24px) saturate(150%)",
      borderRadius: 28,
      padding: "34px 30px 30px",
      maxWidth: 420,
      width: "100%",
      border: "1px solid rgba(255,255,255,0.80)",
      boxShadow: "inset 0 1px rgba(255,255,255,.9), 0 0 0 1px rgba(63,183,163,.08), 0 8px 32px rgba(80,110,140,.08), 0 24px 64px rgba(80,110,140,.12)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Glass highlight */}
      <div style={{
        position: "absolute", top: "-20%", right: "-20%", width: 200, height: 200,
        borderRadius: "50%",
        background: "radial-gradient(circle,rgba(63,183,163,0.10),transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Brand icon */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            width: 58, height: 58, borderRadius: 18,
            background: "linear-gradient(135deg,#79dbc7,#3fb7a3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px",
            boxShadow: "0 12px 28px rgba(63,183,163,0.30)",
          }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: -1 }}>M</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: palette.text, margin: 0, letterSpacing: "-0.3px" }}>
            {authMode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p style={{ fontSize: 13, color: palette.textSoft, marginTop: 5, lineHeight: 1.5 }}>
            {authMode === "login" ? "Sign in to your MediPay account" : "Join MediPay and get your Circle wallet instantly"}
          </p>
        </div>

        {/* Tab toggle */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 22,
          background: "rgba(228,237,243,0.50)", borderRadius: 14, padding: 4,
          border: "1px solid rgba(255,255,255,0.65)",
        }}>
          {[["login", "Sign In"], ["signup", "Create Account"]].map(([m, l]) => (
            <button key={m} style={{
              flex: 1, padding: "10px 8px", fontSize: 13, fontWeight: 700, border: "none", borderRadius: 11,
              background: authMode === m
                ? "linear-gradient(135deg,#55c9b6,#2eaa99)"
                : "transparent",
              color: authMode === m ? "#fff" : palette.textSoft,
              cursor: "pointer", fontFamily: "inherit", transition: "all .2s ease",
              boxShadow: authMode === m ? "inset 0 1px rgba(255,255,255,.5), 0 8px 18px rgba(63,183,163,0.18)" : "none",
            }} onClick={() => { setAuthMode(m); }}>{l}</button>
          ))}
        </div>

        {/* Google button */}
        <button onClick={onGoogle} style={{
          width: "100%",
          background: "rgba(255,255,255,0.96)",
          border: "1px solid " + palette.lineStrong,
          borderRadius: 16, padding: "14px",
          fontSize: 14, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          marginBottom: 18, color: palette.text, fontFamily: "inherit",
          boxShadow: "inset 0 1px rgba(255,255,255,.8), 0 8px 18px rgba(89,118,148,0.07)",
          transition: "all .2s ease",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent," + palette.lineStrong + ")" }} />
          <span style={{ fontSize: 12, color: palette.muted, fontWeight: 500 }}>or with email</span>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(270deg,transparent," + palette.lineStrong + ")" }} />
        </div>

        {/* Email input */}
        <input style={{
          width: "100%", padding: "14px 16px",
          border: "1.5px solid " + palette.lineStrong,
          borderRadius: 16, fontSize: 14, outline: "none",
          marginBottom: 12, color: palette.text,
          background: "rgba(255,255,255,0.92)",
          fontFamily: "inherit", caretColor: palette.brand,
          boxSizing: "border-box", transition: "border-color .2s",
        }} placeholder="Email address" type="email" value={authEmail}
          onChange={e => setAuthEmail(e.target.value)} autoComplete="email" />

        {/* Password input */}
        <input style={{
          width: "100%", padding: "14px 16px",
          border: "1.5px solid " + palette.lineStrong,
          borderRadius: 16, fontSize: 14, outline: "none",
          marginBottom: 10, color: palette.text,
          background: "rgba(255,255,255,0.92)",
          fontFamily: "inherit", caretColor: palette.brand,
          boxSizing: "border-box",
        }} placeholder="Password" type="password" value={authPw}
          onChange={e => setAuthPw(e.target.value)} autoComplete={authMode === "login" ? "current-password" : "new-password"} />

        {/* Error */}
        <div id="auth-reset-msg" style={{ display:"none", fontSize:12, color:"#20b2aa", marginBottom:12, padding:"10px 14px", background:"rgba(32,178,170,0.08)", borderRadius:12, border:"1px solid rgba(32,178,170,0.2)" }}>
          ✓ Password reset email sent! Check your inbox.
        </div>
        {authMode === "login" && (
          <div style={{ textAlign:"right", marginBottom:8, marginTop:-8 }}>
            <button onClick={async () => {
              if (!authEmail) { setAuthErr("Enter your email address first"); return; }
              try {
                await resetPassword(authEmail);
                setAuthErr("");
                setAuthPw("");
                // Show success in error box styled green
                const el = document.getElementById("auth-reset-msg");
                if (el) { el.style.display="block"; setTimeout(() => { el.style.display="none"; }, 4000); }
              }
              catch(e) { setAuthErr(e.message?.replace("Firebase: ","")?.replace(/\(auth\/.*\)/,"")?.trim()); }
            }} style={{ background:"none", border:"none", color:"#20b2aa", fontSize:12, cursor:"pointer", textDecoration:"underline" }}>
              Forgot password?
            </button>
          </div>
        )}
        {authErr && (
          <div style={{
            fontSize: 12, color: "#ef6b73", marginBottom: 12,
            padding: "10px 14px", background: "rgba(239,107,115,0.08)",
            borderRadius: 12, lineHeight: 1.5, border: "1px solid rgba(239,107,115,0.16)",
          }}>
            {authErr.replace("Firebase: ", "").replace(/\(auth\/.*\)/, "")}
          </div>
        )}

        {/* Loading spinner */}
        {loading && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 13, color: palette.brandDeep, marginBottom: 10,
            padding: "8px 14px", background: palette.mint,
            borderRadius: 12, border: "1px solid rgba(63,183,163,0.16)",
          }}>
            <span style={{ animation: "spin .8s linear infinite", display: "inline-block", fontSize: 16 }}>◌</span>
            Processing...
          </div>
        )}

        {/* Submit button */}
        <button onClick={onSubmit} style={{
          width: "100%",
          background: "linear-gradient(135deg,#55c9b6,#2eaa99)",
          color: "#fff", border: "none", borderRadius: 18,
          padding: "15px", fontSize: 15, fontWeight: 800, cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: "inset 0 1px rgba(255,255,255,.7), 0 0 0 1px rgba(63,183,163,.18), 0 12px 34px rgba(63,183,163,0.22)",
          transition: "all .2s ease",
          opacity: loading ? 0.6 : 1,
        }}>
          {authMode === "login" ? "Sign In" : "Create Account"}
        </button>
      </div>
    </div>
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const palette = {
  bg: "#f7fbff",
  bg2: "#eef8f5",
  surface: "rgba(255,255,255,0.92)",
  surfaceSoft: "#ffffff",
  card: "rgba(255,255,255,0.86)",
  line: "#e4edf3",
  lineStrong: "#d8e5ee",
  text: "#25364b",
  textSoft: "#5f7188",
  muted: "#8da0b5",
  brand: "#3fb7a3",
  brandDeep: "#198f82",
  mint: "#dff7ef",
  blue: "#5aa9e6",
  blueSoft: "#e8f5ff",
  lavender: "#8f93ea",
  lavenderSoft: "#f0f1ff",
  peach: "#ffb59d",
  peachSoft: "#fff0e9",
  yellow: "#f5c85b",
  yellowSoft: "#fff8df",
  danger: "#ef6b73",
};

const btnShadow = "inset 0 1px rgba(255,255,255,.7), 0 0 0 1px rgba(63,183,163,.18), 0 12px 34px rgba(63,183,163,0.22)";
const cardShadow = "inset 0 1px rgba(255,255,255,.85), 0 0 0 1px rgba(63,183,163,.06), 0 8px 32px rgba(80,110,140,.08), 0 24px 60px rgba(80,110,140,.06)";
const softShadow = "inset 0 1px rgba(255,255,255,.85), 0 0 0 1px rgba(63,183,163,.06), 0 8px 28px rgba(80,110,140,.08)";
const fontStack = "'Borgen', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const s = {
  shell: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 12% 6%, rgba(117,213,194,0.30), transparent 28%), radial-gradient(circle at 92% 12%, rgba(152,183,255,0.28), transparent 30%), linear-gradient(180deg,#f8fcff 0%,#eef8f5 48%,#f8fbff 100%)",
    color: palette.text,
    fontFamily: fontStack,
    position: "relative",
    overflowX: "hidden",
  },
  bioLayer: { position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 },
  bioBlob: { position: "absolute", width: 92, height: 92, borderRadius: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, boxShadow: "inset 10px 12px 22px rgba(255,255,255,.72), inset -12px -16px 26px rgba(89,118,148,.12), 0 24px 55px rgba(89,118,148,.12)", border: "1px solid rgba(255,255,255,.72)" },
  bioBlobMint: { background: "linear-gradient(145deg,#ffffff,#dff7ef 58%,#9ae4d5)", color: "#3fb7a3" },
  bioBlobBlue: { background: "linear-gradient(145deg,#ffffff,#e8f5ff 58%,#9ccff4)", color: "#5aa9e6" },
  bioBlobPeach: { background: "linear-gradient(145deg,#ffffff,#fff0e9 58%,#ffc3ad)", color: "#e98f70" },
  bioBlobLav: { background: "linear-gradient(145deg,#ffffff,#f0f1ff 58%,#b6b9ff)", color: "#8f93ea" },
  bioOrb: { position: "absolute", width: 58, height: 58, borderRadius: "50%", boxShadow: "inset 8px 10px 18px rgba(255,255,255,.85), inset -10px -12px 18px rgba(89,118,148,.13), 0 20px 42px rgba(89,118,148,.10)", opacity: .32 },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 64, borderBottom: "1px solid rgba(0,0,0,0.06)", position: "sticky", top: 0, background: "rgba(255,255,255,0.75)", backdropFilter: "blur(22px) saturate(150%)", WebkitBackdropFilter: "blur(22px) saturate(150%)", zIndex: 30, gap: 12 },
  tbL: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 }, tbC: { display: "flex", alignItems: "center", gap: 6, position: "absolute", left: "50%", transform: "translateX(-50%)" }, tbR: { display: "flex", alignItems: "center", gap: 8 },
  burger: { background: palette.surfaceSoft, border: "1px solid " + palette.line, color: palette.textSoft, fontSize: 19, cursor: "pointer", padding: "6px 10px", lineHeight: 1, borderRadius: 12, boxShadow: "0 6px 16px rgba(89,118,148,0.10)" },
  logoMk: { width: 40, height: 40, borderRadius: 14, background: "linear-gradient(135deg,#79dbc7,#3fb7a3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 12px 26px rgba(63,183,163,0.30)", color: palette.text },
  demoBadge: { fontSize: 10, padding: "3px 9px", borderRadius: 100, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", color: palette.brandDeep, marginLeft: 6, fontWeight: 800 },
  topBtn: { background: "transparent", border: "none", color: palette.textSoft, fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "8px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, transition: "all .2s ease" },
  topBtnOn: { background: palette.mint, color: palette.brandDeep, fontWeight: 800, border: "1px solid rgba(63,183,163,0.22)", boxShadow: "0 8px 18px rgba(63,183,163,0.12)" },
  balChip: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, background: "rgba(255,255,255,0.92)", padding: "8px 14px", borderRadius: 16, border: "1px solid " + palette.line, flexShrink: 0, boxShadow: softShadow },
  drawer: { position: "fixed", top: 66, left: 10, right: 10, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(22px)", zIndex: 25, border: "1px solid rgba(255,255,255,0.65)", borderRadius: "0 0 26px 26px", boxShadow: "0 22px 50px rgba(80,110,140,0.10)", overflow: "hidden" },
  dItem: { width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", background: "none", border: "none", borderBottom: "1px solid #eef3f7", color: palette.textSoft, cursor: "pointer", textAlign: "left", fontFamily: "inherit" },
  dItemOn: { color: palette.brandDeep, background: "linear-gradient(90deg,rgba(223,247,239,0.95),rgba(255,255,255,0.5))" }, dItemDot: { marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: palette.brand },
  sidebar: { width: 220, background: "rgba(255,255,255,0.45)", backdropFilter: "blur(22px)", borderRight: "1px solid rgba(255,255,255,0.65)", position: "fixed", top: 66, bottom: 0, left: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", overflowY: "auto", zIndex: 20 },
  sideBtn: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "none", border: "none", color: palette.textSoft, cursor: "pointer", borderRadius: 14, textAlign: "left", fontFamily: "inherit", fontSize: 13, margin: "2px 0", transition: "all .2s ease" },
  sideBtnOn: { background: palette.mint, color: palette.brandDeep, boxShadow: "0 10px 22px rgba(63,183,163,0.13)" }, sidefoot: { padding: "16px 14px", borderTop: "1px solid " + palette.line },
  pg: { padding: "22px 24px 80px", maxWidth: 900, margin: "0 auto" },
  landGridPat: { position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "radial-gradient(circle, rgba(63,183,163,0.08) 1px, transparent 1px)", backgroundSize: "48px 48px", maskImage: "radial-gradient(ellipse at 50% 30%, black 20%, transparent 70%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 20%, transparent 70%)", zIndex: 0 },
  landWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 66px)", padding: "80px 22px 120px", textAlign: "center", position: "relative", overflow: "hidden" },
  landGlow1: { position: "absolute", top: "4%", left: "2%", width: 560, height: 480, borderRadius: "50%", background: "radial-gradient(circle,rgba(122,219,199,0.25),transparent 68%)", pointerEvents: "none", filter: "blur(40px)" },
  landGlow2: { position: "absolute", bottom: "6%", right: "2%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle,rgba(90,169,230,0.20),transparent 70%)", pointerEvents: "none", filter: "blur(40px)" },
  landH1: { fontFamily: "'Borgen', system-ui, -apple-system, sans-serif", fontSize: "clamp(34px,6vw,64px)", fontWeight: 700, lineHeight: 1.04, marginBottom: 18, letterSpacing: "-1.2px", color: palette.text },
  landSub: { fontSize: 16, color: palette.textSoft, lineHeight: 1.8, marginBottom: 34, maxWidth: 520 },
  landCTA: { background: "linear-gradient(135deg,#55c9b6,#2eaa99)", color: "#fff", border: "none", borderRadius: 999, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 34, boxShadow: btnShadow, transition: "all .2s ease", lineHeight: 1.33 },
  landFeatures: { display: "flex", gap: 14, marginBottom: 30, flexWrap: "wrap", justifyContent: "center" },
  landFeat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px) saturate(150%)", border: "1px solid rgba(63,183,163,0.12)", borderRadius: 18, padding: "14px 16px", minWidth: 96, boxShadow: "inset 0 1px rgba(255,255,255,.8), 0 0 0 1px rgba(63,183,163,.06), 0 8px 24px rgba(80,110,140,.06)" },
  landStats: { display: "flex", gap: 24, padding: "18px 26px", background: "rgba(255,255,255,0.5)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 28, flexWrap: "wrap", justifyContent: "center", boxShadow: "0 18px 40px rgba(80,110,140,0.08)" },
  

  phoneMockupWrap: {
    position: "relative", zIndex: 2,
    width: "100%", maxWidth: 340,
    display: "flex", alignItems: "center", justifyContent: "center",
    filter: "drop-shadow(0 32px 72px rgba(80,110,140,0.20))",
  },
  phoneMockupImg: {
    width: "100%", height: "auto",
  },

  landingFooter: {
    width: "100%", maxWidth: 1120, margin: "0 auto", padding: "64px 0 24px",
    borderTop: "1px solid " + palette.line,
    position: "relative",
  },
  footerGrid: {
    display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
    gap: 32, marginBottom: 40,
  },
  footerTitle: {
    fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em",
    color: palette.text, marginBottom: 14,
  },
  footerLink: {
    fontSize: 13, color: palette.textSoft, lineHeight: 2.2, cursor: "pointer",
    background: "none", border: "none", padding: 0, fontFamily: "inherit",
    textAlign: "left", display: "block",
  },
  footerBottom: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    paddingTop: 20, borderTop: "1px solid " + palette.line,
    flexWrap: "wrap", gap: 10,
  },
  landNavCta: {
    background: "linear-gradient(135deg,#55c9b6,#2eaa99)", color: "#fff",
    border: "none", borderRadius: 999, padding: "8px 18px",
    fontSize: 13, fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
    fontFamily: "inherit", whiteSpace: "nowrap",
    boxShadow: "0 8px 20px rgba(63,183,163,0.22)",
  },
  landSection: { width: "100%", maxWidth: 1120, margin: "0 auto", padding: "0 0 96px" },
  sectionTitle: { fontSize: 12, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: palette.brandDeep, marginBottom: 14 },
  sectionH2: { fontFamily: "'Borgen', system-ui, -apple-system, sans-serif", fontSize: "clamp(26px, 4vw, 40px)", lineHeight: 1.1, color: palette.text, marginBottom: 12, fontWeight: 700, letterSpacing: "-0.6px" },
  sectionLead: { fontSize: 15, color: palette.textSoft, lineHeight: 1.8, maxWidth: 720, margin: "0 auto" },
  landingGrid: { width: "100%", maxWidth: 1120, margin: "0 auto 80px", display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 72, alignItems: "center", position: "relative", zIndex: 1 },
  heroCopy: { textAlign: "left", alignItems: "flex-start" },
  heroPills: { display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-start", margin: "0 0 18px" },
  heroPill: { fontSize: 12, fontWeight: 600, color: palette.brandDeep, background: "rgba(63,183,163,0.08)", border: "1px solid rgba(63,183,163,0.18)", borderRadius: 999, padding: "8px 14px", boxShadow: "none" },
  heroVisual: { width: "100%", display: "flex", justifyContent: "center" },
  sectionGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 32, marginTop: 40 },
  stepCard: { background: "linear-gradient(145deg,#ffffff 0%,#eefbf6 100%)", border: "1px solid rgba(63,183,163,0.14)", borderRadius: 28, padding: 32, boxShadow: "inset 0 1px rgba(255,255,255,.85), 0 0 0 1px rgba(63,183,163,.06), 0 8px 32px rgba(80,110,140,.08), 0 24px 60px rgba(80,110,140,.06)" },
  stepNo: { width: 36, height: 36, borderRadius: 14, background: palette.mint, color: palette.brandDeep, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginBottom: 12, border: "1px solid rgba(63,183,163,0.18)" },
  trustGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 32, marginTop: 40 },
  trustCard: { background: "linear-gradient(145deg,#ffffff 0%,#eefbf6 100%)", border: "1px solid rgba(63,183,163,0.14)", borderRadius: 28, padding: 32, textAlign: "center", boxShadow: "inset 0 1px rgba(255,255,255,.85), 0 0 0 1px rgba(63,183,163,.06), 0 8px 32px rgba(80,110,140,.08), 0 24px 60px rgba(80,110,140,.06)" },
  newsGrid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 28, marginTop: 40 },
  ctaPanel: { background: "linear-gradient(135deg,rgba(255,255,255,0.55),rgba(223,247,239,0.35))", backdropFilter: "blur(18px) saturate(150%)", border: "1px solid rgba(63,183,163,0.14)", borderRadius: 32, padding: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", boxShadow: "inset 0 1px rgba(255,255,255,.8), 0 0 0 1px rgba(63,183,163,.06), 0 8px 32px rgba(80,110,140,.08), 0 24px 60px rgba(80,110,140,.06)" },
  sub: { fontSize: 14, color: palette.textSoft, lineHeight: 1.7, margin: "8px 0 18px" }, hint: { fontSize: 13, color: palette.muted, lineHeight: 1.7, marginBottom: 16 },
  searchWrap: { display: "flex", alignItems: "center", gap: 10, background: palette.surface, border: "1px solid " + palette.line, borderRadius: 18, padding: "0 16px", marginBottom: 18, boxShadow: softShadow },
  searchInp: { flex: 1, background: "none", border: "none", outline: "none", padding: "14px 0", fontSize: 16, color: palette.text, fontFamily: "inherit", minWidth: 0 },
  hGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 14, paddingBottom: 20 },
  hCard: { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 24, padding: "18px 16px", cursor: "pointer", textAlign: "left", boxShadow: "0 14px 30px rgba(80,110,140,0.08)", transition: "all .2s ease" },
  hIdBadge: { display: "inline-block", fontSize: 14, fontWeight: 900, color: palette.brandDeep, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", padding: "5px 11px", borderRadius: 12 },
  hospBanner: { background: "linear-gradient(135deg,#ffffff,#e9fbf5)", border: "1px solid rgba(63,183,163,0.20)", borderRadius: 24, padding: "20px 22px", margin: "10px 0 18px", boxShadow: cardShadow },
  authTabs: { display: "flex", gap: 6, marginBottom: 20, background: "#eef6f8", borderRadius: 18, padding: 5, border: "1px solid " + palette.line },
  authTab: { flex: 1, padding: "11px 8px", fontSize: 13, fontWeight: 800, border: "none", borderRadius: 14, background: "none", color: palette.textSoft, cursor: "pointer" },
  authTabOn: { background: "#fff", color: palette.brandDeep, boxShadow: "0 8px 18px rgba(89,118,148,0.10)" },
  inp: { width: "100%", background: "rgba(255,255,255,0.96)", border: "1px solid " + palette.lineStrong, borderRadius: 16, padding: "14px 15px", fontSize: 16, color: palette.text, marginBottom: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box", caretColor: palette.brand },
  socialBtn: { width: "100%", background: "#fff", border: "1px solid " + palette.line, borderRadius: 18, padding: "15px", fontSize: 14, color: palette.text, cursor: "pointer", fontFamily: "inherit", textAlign: "center", fontWeight: 800, boxShadow: softShadow },
  fileCard: { background: "rgba(255,255,255,0.92)", border: "1px solid rgba(63,183,163,0.18)", borderRadius: 30, padding: "34px 24px", maxWidth: 500, margin: "24px auto", textAlign: "center", boxShadow: cardShadow },
  fileCheck: { width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#8ce4d2,#3fb7a3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, color: palette.text, margin: "0 auto 16px", boxShadow: "0 16px 32px rgba(63,183,163,0.26)" },
  fileNo: { fontSize: 27, fontWeight: 900, color: palette.brandDeep, letterSpacing: 1, marginBottom: 8, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", wordBreak: "break-word" },
  walletReveal: { background: "#f5fbfd", border: "1px solid rgba(63,183,163,0.22)", borderRadius: 18, padding: "15px", marginBottom: 16, textAlign: "left" },
  faucetBadge: { fontSize: 12, color: palette.brandDeep, background: palette.mint, borderRadius: 14, padding: "9px 11px", marginTop: 8, border: "1px solid rgba(63,183,163,0.16)" },
  rcpCard: { background: "#fff", border: "1px solid " + palette.line, borderRadius: 26, padding: "25px 20px", maxWidth: 530, margin: "0 auto 16px", boxShadow: cardShadow },
  rcpHeader: { textAlign: "center", marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 },
  rcpDash: { borderTop: "1.5px dashed #dce8ef", margin: "14px 0" },
  rcpRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f0f5f8", gap: 10 },
  rcpTotal: { fontSize: 31, fontWeight: 900, color: palette.brandDeep, textAlign: "center", marginTop: 14, letterSpacing: "0" },
  welcomeBanner: { background: "linear-gradient(135deg,#ffffff 0%,#e6fbf4 62%,#edf4ff 100%)", border: "1px solid rgba(63,183,163,0.18)", borderRadius: 28, padding: "24px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", position: "relative", overflow: "hidden", boxShadow: cardShadow },
  welcomeGlow: { position: "absolute", top: "-50%", right: "-10%", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle,rgba(90,169,230,0.20),transparent 70%)", pointerEvents: "none" },
  welcomeBalance: { textAlign: "right", background: "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.8)", padding: "12px 16px", borderRadius: 22 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 },
  statBox: { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 22, padding: "15px 8px", textAlign: "center", boxShadow: "0 10px 24px rgba(80,110,140,0.08)" },
  statV: { fontSize: 21, fontWeight: 900, color: palette.brandDeep }, statL: { fontSize: 11, color: palette.textSoft, marginTop: 4, fontWeight: 700 },
  qaCard: { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 26, padding: "20px 16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 7, textAlign: "left", boxShadow: "0 14px 30px rgba(80,110,140,0.08)" },
  qaIcon: { width: 48, height: 48, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 4 },
  linkedCard: { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 24, padding: "15px 16px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 14px 30px rgba(80,110,140,0.08)" },
  linkedIcon: { width: 44, height: 44, borderRadius: 16, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: palette.brandDeep, fontSize: 11, flexShrink: 0 },
  globalCard: { background: "linear-gradient(135deg,#ffffff,#e8f5ff)", border: "1px solid rgba(90,169,230,0.20)", borderRadius: 28, padding: "22px 24px", marginBottom: 28, position: "relative", overflow: "hidden", boxShadow: cardShadow },
  globalGlow: { position: "absolute", top: "-30%", right: "-10%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle,rgba(90,169,230,0.20),transparent 70%)", pointerEvents: "none" },
  comingSoonBadge: { fontSize: 10, padding: "4px 10px", borderRadius: 100, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", color: palette.brandDeep, fontWeight: 800 },
  newsCard: { background: "rgba(255,255,255,0.9)", border: "1px solid " + palette.line, borderRadius: 22, padding: "16px", boxShadow: softShadow },
  newsTagBadge: { fontSize: 10, padding: "4px 10px", borderRadius: 100, fontWeight: 700 },
  tipCard: { background: "rgba(255,255,255,0.9)", border: "1px solid " + palette.line, borderRadius: 22, padding: "16px", boxShadow: softShadow },
  card: { background: "rgba(255,255,255,0.9)", border: "1px solid " + palette.line, borderRadius: 22, padding: "16px", boxShadow: softShadow },
  payHdr: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 },
  payBal: { display: "flex", alignItems: "center", gap: 10, background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", borderRadius: 18, padding: "9px 14px" },
  dropBtn: { width: "100%", background: "#fff", border: "1px solid " + palette.lineStrong, borderRadius: 18, padding: "14px 16px", fontSize: 16, color: palette.text, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10, fontFamily: "inherit", boxShadow: "0 8px 18px rgba(89,118,148,0.06)" },
  dropMenu: { position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: "1px solid " + palette.lineStrong, borderRadius: 20, zIndex: 200, maxHeight: 290, overflowY: "auto", boxShadow: "0 22px 50px rgba(80,110,140,0.18)" },
  dropItem: { width: "100%", padding: "13px 16px", background: "none", border: "none", borderBottom: "1px solid #eef3f7", color: palette.text, cursor: "pointer", textAlign: "left", fontSize: 14, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10 },
  priceBox: { background: "linear-gradient(135deg,#ffffff,#e9fbf5)", border: "1px solid rgba(63,183,163,0.22)", borderRadius: 24, padding: "22px", marginBottom: 16, textAlign: "center", boxShadow: cardShadow },
  histCard: { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 26, padding: "16px", marginBottom: 10, boxShadow: "0 14px 30px rgba(80,110,140,0.08)" },
  statusBadge: { fontSize: 10, padding: "3px 8px", borderRadius: 100, fontWeight: 800, whiteSpace: "nowrap" },
  statusDone: { background: palette.mint, color: palette.brandDeep, border: "1px solid rgba(63,183,163,0.22)" },
  statusPending: { background: palette.yellowSoft, color: "#b17700", border: "1px solid #f4dda0" },
  linkBadge: { fontSize: 10, padding: "3px 8px", borderRadius: 100, background: palette.blueSoft, color: "#2872b2", border: "1px solid #cde9ff", fontWeight: 800 },
  profileHero: { background: "linear-gradient(135deg,#ffffff,#e6fbf4,#edf4ff)", border: "1px solid rgba(63,183,163,0.18)", borderRadius: 28, padding: "24px", marginBottom: 18, position: "relative", overflow: "hidden", boxShadow: cardShadow },
  profileGlow: { position: "absolute", top: "-50%", right: "-10%", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle,rgba(63,183,163,0.20),transparent 70%)", pointerEvents: "none" },
  avatar: { width: 66, height: 66, borderRadius: "50%", background: "linear-gradient(135deg,#8ce4d2,#3fb7a3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 29, fontWeight: 900, color: palette.text, flexShrink: 0, boxShadow: "0 15px 30px rgba(63,183,163,0.26)" },
  walletCard: { background: "linear-gradient(135deg,#ffffff,#edf9f5)", border: "1px solid rgba(63,183,163,0.22)", borderRadius: 26, padding: "20px", marginBottom: 20, boxShadow: cardShadow },
  profRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid #eef3f7", gap: 10 },
  transferBtn: { width: "100%", background: "rgba(255,255,255,0.92)", border: "1px solid rgba(63,183,163,0.22)", borderRadius: 22, padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", fontFamily: "inherit", boxShadow: softShadow },
  refBtn: { background: palette.mint, border: "1px solid rgba(63,183,163,0.22)", borderRadius: 12, padding: "8px 14px", fontSize: 12, color: palette.brandDeep, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, flexShrink: 0 },
  greenBtn: { background: "linear-gradient(135deg,#55c9b6,#2eaa99)", color: palette.text, border: "none", borderRadius: 18, padding: "15px", fontSize: 14, fontWeight: 900, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: btnShadow },
  outlineBtn: { background: "#fff", color: palette.textSoft, border: "1px solid " + palette.lineStrong, borderRadius: 18, padding: "13px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 8px 18px rgba(89,118,148,0.07)" },
  signOutBtn: { width: "100%", marginTop: 22, padding: "14px", background: "#fff", border: "1px solid #ffd4d8", color: palette.danger, borderRadius: 18, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: softShadow },
  empty: { textAlign: "center", color: palette.muted, padding: "60px 0", lineHeight: 1.8 },
  toast: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: palette.brand, color: "#fff", padding: "12px 24px", borderRadius: 100, fontSize: 13, fontWeight: 800, zIndex: 600, whiteSpace: "nowrap", boxShadow: "0 12px 32px rgba(63,183,163,0.28)" },
};
