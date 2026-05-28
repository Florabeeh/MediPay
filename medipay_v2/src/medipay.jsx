import React, { useState, useEffect } from "react";
import { auth, signInWithGoogle, signInEmail, signUpEmail, logOut, getPatientRecord, savePatientRecord } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";

// ─── Circle API ───────────────────────────────────────────────────────────────
const DEMO_MODE = process.env.REACT_APP_DEMO_MODE !== "false";
const API_KEY   = process.env.REACT_APP_CIRCLE_API_KEY || "";
const CIRCLE_API = "/circle-api";

async function circleGet(path, apiKey) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 800)); return null; }
  const res = await fetch(CIRCLE_API + path, { headers: { "Authorization": "Bearer " + apiKey } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Circle API " + res.status);
  return data;
}
async function createCircleWallet(refId) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 1400)); return { id: "wlt_" + Math.random().toString(36).slice(2, 14), address: "0x" + [...Array(20)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(""), blockchain: "ARC-TESTNET", state: "LIVE", accountType: "SCA" }; }
  const res = await fetch("/create-wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refId }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || "Wallet creation failed " + res.status);
  return data.wallet;
}
async function faucetDrip(address) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 1000)); return { amount: "10.00", status: "ok" }; }
  try {
    const res = await fetch("/fund-wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Faucet " + res.status);
    return data;
  } catch(e) { console.warn("Faucet skipped:", e.message); return { status: "skipped" }; }
}
async function getWalletBalance(walletId) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 600)); return (Math.random() * 18 + 2).toFixed(2); }
  const data = await circleGet("/v1/w3s/wallets/" + walletId + "/balances", API_KEY);
  return data?.data?.tokenBalances?.find(t => t.token?.symbol === "USDC")?.amount || "0.00";
}
async function sendPayment(fromWalletId, toAddress, amount) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 2000)); return { id: "txn_" + Math.random().toString(36).slice(2, 14), txHash: "0x" + [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join(""), state: "COMPLETE" }; }
  // Server-side payment — avoids proxy timeout issues
  const res = await fetch("/send-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromWalletId, toAddress, amount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || "Payment failed " + res.status);
  return data?.data?.transaction;
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const HOSPITALS = [
  { id: "UDUTH", full: "Usmanu Danfodiyo University Teaching Hospital", state: "Sokoto" },
  { id: "LUTH",  full: "Lagos University Teaching Hospital",            state: "Lagos" },
  { id: "UCH",   full: "University College Hospital",                   state: "Oyo" },
  { id: "ABUTH", full: "Ahmadu Bello University Teaching Hospital",     state: "Kaduna" },
  { id: "UNTH",  full: "University of Nigeria Teaching Hospital",       state: "Enugu" },
  { id: "OAUTH", full: "Obafemi Awolowo University Teaching Hospital",  state: "Osun" },
  { id: "UATH",  full: "University of Abuja Teaching Hospital",         state: "FCT" },
  { id: "BMSH",  full: "Benin Medical & Surgical Hospital",             state: "Edo" },
  { id: "GESTH", full: "General Hospital Enugu (State)",                state: "Enugu" },
  { id: "NKST",  full: "NKST Hospital Mkar",                           state: "Benue" },
  { id: "FMCB",  full: "Federal Medical Centre Birnin Kebbi",          state: "Kebbi" },
  { id: "FMCA",  full: "Federal Medical Centre Abeokuta",              state: "Ogun" },
];
const CATS = {
  Surgery:        { icon: "🔪", items: ["Brain Surgery","Open Heart Surgery","Kidney Transplant","Liver Transplant","Appendectomy","Caesarean Section","Spinal Surgery","Hip Replacement","Knee Replacement","Eye Surgery (Cataract)","Hernia Repair","Thyroidectomy"], prices: [950000,1200000,2500000,3800000,180000,250000,750000,900000,850000,320000,150000,420000] },
  Investigations: { icon: "🧪", items: ["Full Blood Count","Liver Function Test","Kidney Function Test","Malaria RDT","HIV Screening","Hepatitis B&C Panel","Blood Culture","Thyroid Function Test","Widal Test","Stool MCS","Urinalysis","Coagulation Profile"], prices: [3500,5500,6000,2000,4500,9000,15000,12000,2500,3000,1500,18000] },
  Radiology:      { icon: "🩻", items: ["Chest X-Ray","Abdominal Ultrasound","CT Scan (Head)","MRI Brain","Echocardiogram","Pelvic Ultrasound","Mammogram","Bone Density Scan","Barium Meal","Fluoroscopy","Nuclear Medicine Scan","PET Scan"], prices: [8000,15000,85000,180000,55000,12000,25000,30000,20000,35000,200000,450000] },
  Medication:     { icon: "💊", items: ["Antimalarial Course","Antibiotic Course","Antihypertensive (1mo)","Diabetic Medication (1mo)","Chemotherapy Round","ARV (1 month)","Painkillers","IV Fluids (per bag)","Insulin (per vial)","Anticoagulants","Immunosuppressants","Vitamins"], prices: [4500,6000,8500,12000,350000,18000,3500,2500,15000,25000,45000,4000] },
  Therapy:        { icon: "🧠", items: ["Physiotherapy Session","Occupational Therapy","Speech Therapy","Dialysis Session","Chemotherapy Session","Radiation Therapy","Cardiac Rehab","Wound Dressing","Blood Transfusion","IV Infusion Therapy","Respiratory Therapy","Hydrotherapy"], prices: [8000,9500,10000,85000,150000,200000,25000,5000,45000,15000,18000,12000] },
  Pharmacy:       { icon: "🏪", items: ["Prescription Dispensing","Over-the-Counter Meds","Medical Consumables","Surgical Supplies","Formulary Drugs","Vaccination Package","Nebulizer Medication","Ophthalmic Drops","Topical Creams","Ear/Nasal Drops","ORS","Asthma Inhaler"], prices: [2000,3500,5000,8000,12000,25000,7000,4500,2500,3000,1500,18000] },
  Rehabilitation: { icon: "🦽", items: ["Post-Stroke Rehab","Post-Surgery Recovery","Orthopedic Rehab","Cardiac Rehab Program","Pulmonary Rehab","Substance Abuse Rehab","TBI Rehab","Spinal Cord Rehab","Pediatric Rehab","Geriatric Rehab","Sports Injury Rehab","Amputee Rehab"], prices: [45000,35000,40000,55000,50000,80000,120000,100000,30000,35000,25000,65000] },
  Procedures:     { icon: "⚕️", items: ["Endoscopy","Colonoscopy","Bone Marrow Biopsy","Lumbar Puncture","Liver Biopsy","Bronchoscopy","Cystoscopy","Circumcision","Dental Extraction","Vasectomy","Colposcopy","Hysteroscopy"], prices: [55000,60000,75000,35000,80000,65000,50000,15000,12000,20000,30000,45000] },
};
const HEALTH_TIPS = [
  { icon: "💧", color: "#0ea5e9", title: "Stay Hydrated",       body: "Drink 8-12 glasses of water daily. Dehydration is a leading cause of hospital visits in Nigeria's hot climate." },
  { icon: "🩸", color: "#ef4444", title: "Know Your Genotype",  body: "Confirm genotype before marriage. SS children suffer sickle cell disease — entirely preventable with proper planning." },
  { icon: "🍎", color: "#22c55e", title: "Eat Local Vegetables",body: "Ugwu, garden egg, and bitter leaf are rich in iron and vitamins. Include them in every meal." },
  { icon: "🏃", color: "#f59e0b", title: "Exercise Daily",      body: "30 minutes of walking daily reduces diabetes and hypertension risk by up to 35%." },
  { icon: "🩺", color: "#8b5cf6", title: "Annual Check-ups",    body: "Silent killers — hypertension, diabetes, cancer — show no early symptoms. A yearly check saves lives." },
  { icon: "🌙", color: "#6366f1", title: "Sleep 7-9 Hours",     body: "Poor sleep raises blood pressure and weakens immunity. Sleep at the same time each night." },
  { icon: "🧴", color: "#14b8a6", title: "Wash Your Hands",     body: "20 seconds with soap prevents diarrhoea, typhoid, and cholera — top causes of illness in West Africa." },
  { icon: "💉", color: "#f97316", title: "Vaccinate Children",  body: "Routine vaccines protect against polio, measles, yellow fever. Visit your nearest PHC." },
];
const NGN_USDC  = 1650;
const HOSP_ADDR = "0x742d35Cc6634C0532925a3b8D4C9b4AA12b5e6f4";
const fmt   = n  => "N" + Number(n).toLocaleString();
const genFN = id => id + "-" + Date.now().toString().slice(-6) + "-" + Math.floor(Math.random() * 9000 + 1000);
const genTx = () => "0x" + [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");

// ─── Receipt canvas ───────────────────────────────────────────────────────────
function downloadReceiptImage(rec) {
  const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 820;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, 600, 820);
  ctx.fillStyle = "#1a9e5f"; ctx.fillRect(0, 0, 600, 8);
  ctx.beginPath(); ctx.arc(300, 70, 36, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(300,70,0,300,70,36); g.addColorStop(0,"#1a9e5f"); g.addColorStop(1,"#0d7a47");
  ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle="#fff"; ctx.font="bold 28px system-ui"; ctx.textAlign="center"; ctx.fillText("M",300,80);
  ctx.fillStyle="#e6edf3"; ctx.font="bold 26px system-ui"; ctx.fillText("MediPay",300,128);
  ctx.fillStyle="#1a9e5f"; ctx.font="14px system-ui"; ctx.fillText("Payment Confirmed  ARC Testnet",300,152);
  ctx.setLineDash([6,4]); ctx.strokeStyle="#30363d"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(40,172); ctx.lineTo(560,172); ctx.stroke(); ctx.setLineDash([]);
  const rows=[["Patient",rec.patient],["File Number",rec.fileNo],["Hospital",rec.hospital||""],["Category",rec.category],["Service",rec.item],rec.note?["Note",rec.note]:null,["Amount (NGN)",fmt(rec.amount)],["Amount (USDC)",rec.usdc+" USDC"],["Network","ARC-TESTNET"],["Settlement","< 1 second (Circle MPC)"],["Date",rec.date],["Tx ID",rec.id?rec.id.slice(0,28)+"...":""]].filter(Boolean);
  let y=200; rows.forEach(([k,v])=>{ ctx.fillStyle="#8b949e"; ctx.font="13px system-ui"; ctx.textAlign="left"; ctx.fillText(k,50,y); ctx.fillStyle="#e6edf3"; ctx.font="13px system-ui"; ctx.textAlign="right"; ctx.fillText(String(v).length>38?String(v).slice(0,38)+"...":String(v),550,y); ctx.strokeStyle="#21262d"; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(50,y+10); ctx.lineTo(550,y+10); ctx.stroke(); y+=36; });
  y+=10; ctx.fillStyle="#0d2b1a"; roundRect(ctx,40,y,520,80,12); ctx.fillStyle="#1a9e5f"; ctx.font="bold 32px system-ui"; ctx.textAlign="center"; ctx.fillText(fmt(rec.amount),300,y+42); ctx.fillStyle="#484f58"; ctx.font="13px system-ui"; ctx.fillText(rec.usdc+" USDC  Circle ARC Testnet",300,y+64);
  y+=100; ctx.fillStyle="#21262d"; ctx.font="8px monospace"; ctx.fillText("|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||",300,y); ctx.fillStyle="#484f58"; ctx.font="11px system-ui"; ctx.fillText("Powered by Circle on ARC Testnet  medipay.circle.arc",300,y+20);
  ctx.fillStyle="#1a9e5f"; ctx.fillRect(0,812,600,8);
  const link=document.createElement("a"); link.download="medipay-receipt-"+(rec.fileNo||"receipt")+".png"; link.href=canvas.toDataURL("image/png"); link.click();
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fill();}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function MediPay() {
  const [fbUser,  setFbUser]  = useState(undefined); // undefined = loading, null = logged out
  const [screen,  setScreen]  = useState("landing");
  const [hospital,setHospital]= useState(null);
  const [user,    setUser]    = useState(null);
  const [fname, setFname] = useState(""); const [fdob, setFdob] = useState(""); const [fgender, setFgender] = useState("");
  const [fphone, setFphone] = useState(""); const [femail, setFemail] = useState(""); const [faddress, setFaddress] = useState("");
  const [fstate, setFstate] = useState(""); const [fbloodGroup, setFbloodGroup] = useState(""); const [fgenotype, setFgenotype] = useState("");
  const form = { name:fname,dob:fdob,gender:fgender,phone:fphone,email:femail,address:faddress,state:fstate,bloodGroup:fbloodGroup,genotype:fgenotype };
  const resetForm = () => { setFname("");setFdob("");setFgender("");setFphone("");setFemail("");setFaddress("");setFstate("");setFbloodGroup("");setFgenotype(""); };
  const [fileNo,    setFileNo]    = useState("");
  const [walletId,  setWalletId]  = useState("");
  const [walletAddr,setWalletAddr]= useState("");
  const [usdcBal,   setUsdcBal]   = useState(null);
  const [balLoading,setBalLoading]= useState(false);
  const [faucetSent,setFaucetSent]= useState(false);
  const [linked,    setLinked]    = useState([]);
  const [tab,       setTab]       = useState("home");
  const [paycat,    setPaycat]    = useState(""); const [payitem, setPayitem] = useState(""); const [payprice, setPayprice] = useState(0); const [paynote, setPaynote] = useState("");
  const [receipt,   setReceipt]   = useState(null);
  const [history,   setHistory]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [step,      setStep]      = useState("");
  const [toast,     setToast]     = useState({ msg: "", type: "ok" });
  const [searchH,   setSearchH]   = useState("");
  const [showCat,   setShowCat]   = useState(false); const [showItem, setShowItem] = useState(false);
  const [showTrf,   setShowTrf]   = useState(false); const [trfTarget, setTrfTarget] = useState(""); const [trfDrop, setTrfDrop] = useState(false); const [trfDone, setTrfDone] = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [isMobile,  setIsMobile]  = useState(window.innerWidth < 900);
  const [showPayLink,   setShowPayLink]   = useState(false); const [payLink, setPayLink] = useState(""); const [payLinkCopied, setPayLinkCopied] = useState(false);
  const [showShareModal,setShowShareModal]= useState(false); const [shareReceipt, setShareReceipt] = useState(null); const [rcpCopied, setRcpCopied] = useState(false);
  const [,           setPendingLinks]      = useState([]);
  // Email auth form
  const [authEmail, setAuthEmail] = useState(""); const [authPw, setAuthPw] = useState(""); const [authMode, setAuthMode] = useState("login"); const [authErr, setAuthErr] = useState("");

  useEffect(() => { const h = () => setIsMobile(window.innerWidth < 900); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);

  // ── Firebase auth listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbU) => {
      setFbUser(fbU);
      if (!fbU) { setScreen("landing"); return; }
      // Logged in — try to load existing record
      try {
        const rec = await getPatientRecord(fbU.uid);
        if (rec && rec.walletId) {
          // Returning patient — restore state
          setFileNo(rec.fileNo || "");
          setWalletId(rec.walletId);
          setWalletAddr(rec.walletAddress || "");
          setUser({ name: rec.name, email: rec.email || fbU.email, ...rec });
          setLinked((rec.linkedHospitals || []).map(id => HOSPITALS.find(h => h.id === id)).filter(Boolean));
          const hosp = HOSPITALS.find(h => h.id === rec.hospitalId);
          if (hosp) setHospital(hosp);
          setHistory(rec.history || []);
          setFaucetSent(rec.faucetSent || false);
          setTab("home"); setScreen("dashboard");
          // Auto-load balance on login
          if (rec.walletId) {
            setBalLoading(true);
            getWalletBalance(rec.walletId).then(bal => { setUsdcBal(bal); setBalLoading(false); }).catch(() => setBalLoading(false));
          }
        } else {
          // New user — go to onboarding
          if (fbU.email) setFemail(fbU.email);
          if (fbU.displayName) setFname(fbU.displayName);
          setScreen("hospitals");
        }
      } catch(e) {
        console.error("Firestore load error:", e);
        setScreen("hospitals");
      }
    });
    return unsub;
  }, []);

  const toast_ = (msg, type) => { setToast({ msg, type: type || "ok" }); setTimeout(() => setToast({ msg: "", type: "ok" }), 3200); };
  const filtered = HOSPITALS.filter(h => h.full.toLowerCase().includes(searchH.toLowerCase()) || h.state.toLowerCase().includes(searchH.toLowerCase()) || h.id.toLowerCase().includes(searchH.toLowerCase()));
  const availTrf = HOSPITALS.filter(h => !linked.find(l => l.id === h.id) && h.id !== hospital?.id);

  const refreshBalance = async (wId) => {
    const id = wId || walletId; if (!id) return;
    setBalLoading(true);
    try { setUsdcBal(await getWalletBalance(id)); } catch(e) { setUsdcBal("--"); }
    setBalLoading(false);
  };


  const setupWallet = async (refId) => {
    setStep("Creating your Circle Programmable Wallet on ARC Testnet...");
    const w = await createCircleWallet(refId);
    setWalletId(w.id); setWalletAddr(w.address);
    try {
      setStep("Requesting 10 USDC from Circle faucet...");
      await faucetDrip(w.address);
      setFaucetSent(true);
    } catch(e) { console.warn("Faucet skipped:", e.message); setFaucetSent(false); }
    try {
      setStep("Loading balance...");
      setUsdcBal(await getWalletBalance(w.id));
    } catch(e) { setUsdcBal("0.00"); }
    setStep(""); return w;
  };

  const handleHospSelect = h => { setHospital(h); setScreen("profile"); };

  const handleProfileSubmit = async () => {
    if (!form.name || !form.dob || !form.phone) { toast_("Fill all required fields", "err"); return; }
    setLoading(true);
    const fn = genFN(hospital.id); setFileNo(fn);
    const w = await setupWallet(fbUser?.uid || fn);
    setLinked([hospital]); setUser({ ...form });
    // Save to Firestore
    await savePatientRecord(fbUser.uid, {
      uid: fbUser.uid, email: fbUser.email || form.email,
      name: form.name, fileNo: fn,
      walletId: w.id, walletAddress: w.address,
      hospitalId: hospital.id,
      linkedHospitals: [hospital.id],
      faucetSent: true, history: [],
      dob: form.dob, phone: form.phone,
      gender: form.gender, bloodGroup: form.bloodGroup,
      genotype: form.genotype, state: form.state, address: form.address,
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
      const tx = await sendPayment(walletId, HOSP_ADDR, usdc);
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
      // Persist updated history
      await savePatientRecord(fbUser.uid, { history: newHistory });
      setLoading(false); setStep(""); setScreen("receipt");
    } catch(e) { toast_("Payment failed: " + e.message, "err"); setLoading(false); setStep(""); }
  };

  const handleTransfer = async () => {
    if (!trfTarget) { toast_("Select a hospital", "err"); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 1400));
    const newH = HOSPITALS.find(h => h.id === trfTarget);
    const newLinked = [...linked, newH];
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
    const pendingEntry = { id: genTx(), type: "payment_link", hospital: hospital?.full, hospitalId: hospital?.id, patient: user?.name || form.name, fileNo, category: paycat, item: payitem, amount, usdc: (amount / NGN_USDC).toFixed(4), note: paynote, date: new Date().toLocaleString("en-NG", { dateStyle: "full", timeStyle: "short" }), status: "pending", link };
    const newHistory = [pendingEntry, ...history];
    setHistory(newHistory);
    setPendingLinks(p => [pendingEntry, ...p]);
    savePatientRecord(fbUser?.uid, { history: newHistory });
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
    const lines = ["== MEDIPAY RECEIPT ==","Patient: "+rec.patient,"File No: "+rec.fileNo,"Hospital: "+(rec.hospital||""),"Category: "+rec.category,"Service: "+rec.item,rec.note?"Note: "+rec.note:null,"Amount: "+fmt(rec.amount),"USDC: "+rec.usdc+" USDC","Network: ARC-TESTNET","Date: "+rec.date,"Tx ID: "+rec.id,"Powered by Circle on ARC Testnet"].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines).then(() => { setRcpCopied(true); setTimeout(() => setRcpCopied(false), 2000); }).catch(() => toast_("Clipboard not available", "err"));
  };
  const nativeShare = async (rec) => {
    // Generate the same canvas image as downloadReceiptImage, then share via WhatsApp
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 820;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, 600, 820);
    ctx.fillStyle = "#1a9e5f"; ctx.fillRect(0, 0, 600, 8);
    ctx.beginPath(); ctx.arc(300, 70, 36, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(300,70,0,300,70,36);
    g.addColorStop(0,"#1a9e5f"); g.addColorStop(1,"#0d7a47");
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle="#fff"; ctx.font="bold 28px system-ui"; ctx.textAlign="center"; ctx.fillText("M",300,80);
    ctx.fillStyle="#e6edf3"; ctx.font="bold 26px system-ui"; ctx.fillText("MediPay",300,128);
    ctx.fillStyle="#1a9e5f"; ctx.font="14px system-ui"; ctx.fillText("Payment Confirmed  ARC Testnet",300,152);
    ctx.setLineDash([6,4]); ctx.strokeStyle="#30363d"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(40,172); ctx.lineTo(560,172); ctx.stroke(); ctx.setLineDash([]);
    const rows=[["Patient",rec.patient],["File Number",rec.fileNo],["Hospital",rec.hospital||""],["Category",rec.category],["Service",rec.item],rec.note?["Note",rec.note]:null,["Amount (NGN)",fmt(rec.amount)],["Amount (USDC)",rec.usdc+" USDC"],["Network","ARC-TESTNET"],["Settlement","< 1 second (Circle MPC)"],["Date",rec.date],["Transaction ID",rec.id?rec.id.slice(0,28)+"...":""]].filter(Boolean);
    let y=200; rows.forEach(([k,v])=>{ ctx.fillStyle="#8b949e"; ctx.font="13px system-ui"; ctx.textAlign="left"; ctx.fillText(k,50,y); ctx.fillStyle="#e6edf3"; ctx.font="13px system-ui"; ctx.textAlign="right"; ctx.fillText(String(v).length>38?String(v).slice(0,38)+"...":String(v),550,y); ctx.strokeStyle="#21262d"; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(50,y+10); ctx.lineTo(550,y+10); ctx.stroke(); y+=36; });
    y+=10; ctx.fillStyle="#0d2b1a"; roundRect(ctx,40,y,520,80,12);
    ctx.fillStyle="#1a9e5f"; ctx.font="bold 32px system-ui"; ctx.textAlign="center"; ctx.fillText(fmt(rec.amount),300,y+42);
    ctx.fillStyle="#484f58"; ctx.font="13px system-ui"; ctx.fillText(rec.usdc+" USDC  Circle ARC Testnet",300,y+64);
    y+=100; ctx.fillStyle="#21262d"; ctx.font="8px monospace"; ctx.fillText("|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||",300,y);
    ctx.fillStyle="#484f58"; ctx.font="11px system-ui"; ctx.fillText("Powered by Circle on ARC Testnet  medipay.circle.arc",300,y+20);
    ctx.fillStyle="#1a9e5f"; ctx.fillRect(0,812,600,8);

    try {
      const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
      const file = new File([blob], "medipay-receipt-"+(rec.fileNo||"receipt")+".png", { type:"image/png" });
      if (navigator.canShare && navigator.canShare({ files:[file] })) {
        // Mobile: share image directly (opens WhatsApp, etc.)
        await navigator.share({ title:"MediPay Receipt", files:[file] });
        return;
      }
    } catch(e) { console.log("File share failed:", e.message); }

    // Desktop fallback: download image + open WhatsApp web
    const link = document.createElement("a");
    link.download = "medipay-receipt-"+(rec.fileNo||"receipt")+".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    // Open WhatsApp after short delay so image downloads first
    setTimeout(() => {
      const text = encodeURIComponent("MediPay Receipt\nPatient: "+rec.patient+"\nService: "+rec.item+"\nAmount: "+fmt(rec.amount)+"\nDate: "+rec.date+"\n\n(See downloaded image for full receipt)");
      window.open("https://wa.me/?text="+text, "_blank");
    }, 800);
  };

  const handleSignOut = async () => {
    await logOut();
    setUser(null); resetForm(); setFileNo(""); setWalletId(""); setWalletAddr("");
    setUsdcBal(null); setFaucetSent(false); setHistory([]); setLinked([]);
    setHospital(null); setFbUser(null); setScreen("landing");
  };

  const NAV = [["home","🏠","Home"],["pay","💳","Pay"],["history","📋","History"],["profile","👤","Profile"]];
  const switchTab = t => { setTab(t); setMenuOpen(false); };
  const shellProps = { isMobile, menuOpen, setMenuOpen, NAV, tab, switchTab, walletAddr, fileNo, balLoading, usdcBal, toast };

  // ── Loading spinner ─────────────────────────────────────────────────────────
  if (fbUser === undefined) return (
    <div style={{ minHeight:"100vh", background:"#0d1117", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:48,height:48,borderRadius:"50%",border:"3px solid #1a9e5f33",borderTop:"3px solid #1a9e5f",animation:"spin .8s linear infinite" }} />
      <div style={{ color:"#6b7280", fontSize:13 }}>Loading MediPay...</div>
    </div>
  );

  // ── Landing ─────────────────────────────────────────────────────────────────
  if (screen === "landing") return (
    <div style={{ minHeight:"100vh", background:"#0d1117", color:"#e5e7eb", fontFamily:"system-ui,-apple-system,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:72,height:72,borderRadius:20,background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:"0 0 40px rgba(26,158,95,0.4)" }}>
            <span style={{ fontSize:32,fontWeight:800,color:"#fff" }}>M</span>
          </div>
          <h1 style={{ fontSize:32,fontWeight:900,color:"#fff",margin:"0 0 6px",letterSpacing:"-1px" }}>MediPay</h1>
          <p style={{ fontSize:13,color:"#6b7280",margin:0 }}>Healthcare payments, finally simple.</p>
          <p style={{ fontSize:11,color:"#374151",marginTop:4 }}>Powered by Circle USDC · ARC Testnet</p>
        </div>

        {/* Auth Card */}
        <div style={{ background:"#111827",border:"0.5px solid #1f2937",borderRadius:20,padding:"28px 24px" }}>
          {/* Tabs */}
          <div style={{ display:"flex",gap:4,marginBottom:24,background:"#0d1117",borderRadius:10,padding:4 }}>
            {[["login","Sign In"],["signup","Create Account"]].map(([m,l]) => (
              <button key={m} style={{ flex:1,padding:"9px 8px",fontSize:13,fontWeight:600,border:"none",borderRadius:7,background:authMode===m?"#1a9e5f":"none",color:authMode===m?"#fff":"#9ca3af",cursor:"pointer" }} onClick={() => { setAuthMode(m); setAuthErr(""); }}>{l}</button>
            ))}
          </div>

          {/* Google button */}
          <button onClick={async () => { setAuthErr(""); try { await signInWithGoogle(); } catch(e) { setAuthErr(e.message); } }}
            style={{ width:"100%",background:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:14,color:"#111827" }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:14 }}>
            <div style={{ flex:1,height:1,background:"#1f2937" }} />
            <span style={{ fontSize:12,color:"#6b7280" }}>or</span>
            <div style={{ flex:1,height:1,background:"#1f2937" }} />
          </div>

          {/* Email/Password */}
          <input style={s.inp} placeholder="Email address" type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} autoComplete="email" />
          <input style={s.inp} placeholder="Password" type="password" value={authPw} onChange={e => setAuthPw(e.target.value)} autoComplete={authMode==="login"?"current-password":"new-password"} />

          {authErr && <div style={{ fontSize:12,color:"#ef4444",marginBottom:12,padding:"8px 12px",background:"#ef444418",borderRadius:8 }}>{authErr.replace("Firebase: ","").replace(/\(auth\/.*\)/,"")}</div>}

          {loading && <Stp s={step} />}

          <button onClick={async () => {
            if (!authEmail || !authPw) { setAuthErr("Enter email and password"); return; }
            setAuthErr(""); setLoading(true);
            try {
              if (authMode === "login") await signInEmail(authEmail, authPw);
              else await signUpEmail(authEmail, authPw);
            } catch(e) { setAuthErr(e.message); }
            setLoading(false);
          }} style={{ width:"100%",background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer" }}>
            {authMode === "login" ? "Sign In" : "Create Account"}
          </button>
        </div>

        <p style={{ textAlign:"center",fontSize:11,color:"#374151",marginTop:16 }}>
          Circle MPC-secured · No seed phrase · ARC Testnet
        </p>
      </div>
    </div>
  );

  // ── Hospitals ───────────────────────────────────────────────────────────────
  if (screen === "hospitals") return (
    <Shell {...shellProps}>
      <PBar title="Select Your Hospital" onBack={null} />
      <div style={s.pg}>
        <p style={s.sub}>Welcome! Choose the hospital you are currently visiting to get started.</p>
        <div style={s.searchWrap}>
          <span style={{ fontSize:16,color:"#6b7280" }}>🔍</span>
          <input style={s.searchInp} placeholder="Search hospital or state..." value={searchH} onChange={e => setSearchH(e.target.value)} />
        </div>
        <div style={s.hGrid}>
          {filtered.map(h => (
            <button key={h.id} style={s.hCard} onClick={() => handleHospSelect(h)}>
              <div style={s.hIdBadge}>{h.id}</div>
              <div style={{ fontSize:12,color:"#d1d5db",lineHeight:1.4,margin:"8px 0 4px" }}>{h.full}</div>
              <div style={{ fontSize:11,color:"#6b7280" }}>📍 {h.state} State</div>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );

  // ── Profile Form ────────────────────────────────────────────────────────────
  if (screen === "profile") return (
    <Shell {...shellProps}>
      <PBar title="Create Your Profile" onBack={() => setScreen("hospitals")} />
      <div style={s.pg}>
        <p style={s.sub}>Fill your details to register at {hospital?.id}. Signed in as <strong style={{ color:"#1a9e5f" }}>{fbUser?.email}</strong></p>
        <L t="Full name *" /><input style={s.inp} placeholder="First Middle Last" value={fname} onChange={e => setFname(e.target.value)} />
        <L t="Date of birth *" /><input style={s.inp} type="date" value={fdob} onChange={e => setFdob(e.target.value)} />
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
          <div><L t="Gender" /><select style={s.inp} value={fgender} onChange={e => setFgender(e.target.value)}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div><L t="Blood Group" /><select style={s.inp} value={fbloodGroup} onChange={e => setFbloodGroup(e.target.value)}><option value="">Select</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g=><option key={g}>{g}</option>)}</select></div>
        </div>
        <L t="Phone *" /><input style={s.inp} placeholder="+234..." type="tel" value={fphone} onChange={e => setFphone(e.target.value)} />
        <L t="State of residence" />
        <select style={s.inp} value={fstate} onChange={e => setFstate(e.target.value)}>
          <option value="">Select state</option>
          {["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"].map(st=><option key={st}>{st}</option>)}
        </select>
        <L t="Home address" /><input style={s.inp} placeholder="Street, LGA, State" value={faddress} onChange={e => setFaddress(e.target.value)} />
        <L t="Genotype" />
        <select style={s.inp} value={fgenotype} onChange={e => setFgenotype(e.target.value)}>
          <option value="">Select</option>{["AA","AS","SS","AC","SC"].map(g=><option key={g}>{g}</option>)}
        </select>
        {loading && <Stp s={step} />}
        <GBtn disabled={loading} onClick={handleProfileSubmit}>{loading ? "Setting up your account..." : "Submit & Register"}</GBtn>
      </div>
    </Shell>
  );

  // ── File Number Reveal ──────────────────────────────────────────────────────
  if (screen === "fileno") return (
    <Shell {...shellProps}>
      <div style={s.pg}>
        <div style={s.fileCard}>
          <div style={s.fileCheck}>✓</div>
          <div style={{ fontSize:13,color:"#9ca3af",marginBottom:8 }}>Registration Successful</div>
          <div style={{ fontSize:10,color:"#6b7280",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6 }}>Your MediPay File Number</div>
          <div style={s.fileNo}>{fileNo}</div>
          <div style={{ fontSize:12,color:"#9ca3af",marginBottom:20 }}>{hospital?.full}</div>
          <div style={s.walletReveal}>
            <div style={{ fontSize:10,color:"#6b7280",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6 }}>Circle Programmable Wallet · ARC Testnet</div>
            <div style={{ fontSize:11,fontFamily:"monospace",color:"#1a9e5f",wordBreak:"break-all",marginBottom:8 }}>{walletAddr}</div>
            {faucetSent && (
              <div style={s.faucetBadge}>
                🎉 10 USDC auto-sent from Circle faucet!
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{ display:"block",fontSize:11,color:"#1a9e5f",marginTop:4,textDecoration:"underline" }}>Balance not showing? Claim manually here →</a>
              </div>
            )}
          </div>
          <p style={{ fontSize:12,color:"#9ca3af",lineHeight:1.7,marginBottom:20 }}>
            <strong style={{ color:"#e5e7eb" }}>Your account is linked to your Google/email login.</strong> Sign in from any device to access your records and wallet.
          </p>
          <GBtn onClick={() => { setTab("home"); setScreen("dashboard"); }}>Go to Dashboard →</GBtn>
        </div>
      </div>
    </Shell>
  );

  // ── Receipt ─────────────────────────────────────────────────────────────────
  if (screen === "receipt") return (
    <Shell {...shellProps}>
      <PBar title="Payment Receipt" onBack={() => { setPaycat("");setPayitem("");setPaynote("");setPayprice(0);setTab("pay");setScreen("dashboard"); }} />
      <div style={s.pg}>
        <div style={s.rcpCard}>
          <div style={s.rcpHeader}>
            <div style={s.logoMk}><span style={{ fontSize:18,fontWeight:800,color:"#fff" }}>M</span></div>
            <div style={{ fontSize:18,fontWeight:800,color:"#fff" }}>MediPay</div>
            <div style={{ fontSize:13,color:"#1a9e5f",marginTop:2 }}>✓ Payment Confirmed · ARC Testnet</div>
          </div>
          <div style={s.rcpDash} />
          {[["Patient",receipt?.patient],["File Number",receipt?.fileNo],["Hospital",receipt?.hospital],["Category",receipt?.category],["Service",receipt?.item],["Note",receipt?.note||"--"],["Amount (NGN)",fmt(receipt?.amount)],["Amount (USDC)",receipt?.usdc+" USDC"],["Network","ARC-TESTNET"],["Settlement","< 1 second (Circle MPC)"],["Date",receipt?.date]].map(([k,v])=>v&&(
            <div key={k} style={s.rcpRow}><span style={{ fontSize:12,color:"#9ca3af" }}>{k}</span><span style={{ fontSize:12,color:"#e5e7eb",fontWeight:500,textAlign:"right",wordBreak:"break-word",maxWidth:"55%" }}>{v}</span></div>
          ))}
          <div style={s.rcpDash} />
          <div style={s.rcpTotal}>{fmt(receipt?.amount)}</div>
          <div style={{ fontSize:12,color:"#6b7280",textAlign:"center",marginTop:4 }}>{receipt?.usdc} USDC · Circle ARC Testnet</div>
          <p style={{ fontSize:10,color:"#6b7280",textAlign:"center",wordBreak:"break-all",marginTop:8 }}>Tx: {receipt?.id}</p>
        </div>
        <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
          <button style={s.outlineBtn} onClick={() => openShareReceipt(receipt)}>⬆ Share</button>
          <button style={s.outlineBtn} onClick={() => downloadReceiptImage(receipt)}>⬇ Save Image</button>
          <GBtn xstyle={{ flex:2 }} onClick={() => { setPaycat("");setPayitem("");setPaynote("");setPayprice(0);setTab("pay");setScreen("dashboard"); }}>New Payment →</GBtn>
        </div>
      </div>
      {showShareModal && shareReceipt && <ShareModal rec={shareReceipt} copied={rcpCopied} onCopy={copyReceiptText} onNative={nativeShare} onDownload={downloadReceiptImage} onClose={() => setShowShareModal(false)} />}
    </Shell>
  );

  // ── Dashboard ───────────────────────────────────────────────────────────────
  if (screen === "dashboard") return (
    <Shell showNav {...shellProps}>
      {/* HOME */}
      {tab === "home" && (
        <div style={s.pg}>
          <div style={s.welcomeBanner}>
            <div style={s.welcomeGlow} />
            <div style={{ position:"relative",zIndex:1 }}>
              <div style={{ fontSize:13,color:"#9ca3af",marginBottom:4 }}>Welcome back</div>
              <div style={{ fontSize:22,fontWeight:800,color:"#fff" }}>{user?.name || "Patient"}</div>
              <div style={{ fontSize:12,color:"#1a9e5f",marginTop:4,fontFamily:"monospace" }}>{fileNo}</div>
              <div style={{ fontSize:11,color:"#6b7280",marginTop:2 }}>{fbUser?.email}</div>
            </div>
            <div style={s.welcomeBalance}>
              <div style={{ fontSize:10,color:"#6b7280",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em" }}>USDC Balance</div>
              <div style={{ fontSize:26,fontWeight:900,color:"#1a9e5f" }}>{usdcBal !== null ? usdcBal : "--"}</div>
              <div style={{ fontSize:11,color:"#6b7280" }}>ARC Testnet</div>
            </div>
          </div>
          <div style={s.statsRow}>
            {[["12","Hospitals"],["< 1s","Settlement"],["N0","Transfer Fees"],["36","States"]].map(([v,l])=>(
              <div key={l} style={s.statBox}><div style={s.statV}>{v}</div><div style={s.statL}>{l}</div></div>
            ))}
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24 }}>
            <button style={s.qaCard} onClick={()=>switchTab("pay")}>
              <div style={{ ...s.qaIcon,background:"linear-gradient(135deg,#1a9e5f22,#0d7a4722)",border:"1px solid #1a9e5f44" }}>💳</div>
              <div style={{ fontSize:14,fontWeight:700,color:"#e5e7eb" }}>Make Payment</div>
              <div style={{ fontSize:12,color:"#9ca3af" }}>Tests, drugs, surgery</div>
            </button>
            <button style={s.qaCard} onClick={()=>switchTab("history")}>
              <div style={{ ...s.qaIcon,background:"linear-gradient(135deg,#3b82f622,#1d4ed822)",border:"1px solid #3b82f644" }}>📋</div>
              <div style={{ fontSize:14,fontWeight:700,color:"#e5e7eb" }}>History</div>
              <div style={{ fontSize:12,color:"#9ca3af" }}>{history.length} transaction{history.length!==1?"s":""}</div>
            </button>
          </div>
          <SL t="Your Linked Hospitals" />
          <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:24 }}>
            {linked.map(h=>(
              <div key={h.id} style={s.linkedCard}>
                <div style={s.linkedIcon}>{h.id.slice(0,4)}</div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:700,color:"#e5e7eb" }}>{h.id}</div>
                  <div style={{ fontSize:11,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{h.full}</div>
                  <div style={{ fontSize:10,color:"#6b7280" }}>📍 {h.state} State</div>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:5,flexShrink:0 }}>
                  <div style={{ width:7,height:7,borderRadius:"50%",background:"#1a9e5f" }} />
                  <span style={{ fontSize:11,color:"#1a9e5f",fontWeight:600 }}>Active</span>
                </div>
              </div>
            ))}
          </div>
          <SL t="Health Tips" />
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12,marginBottom:24 }}>
            {HEALTH_TIPS.map((t,i)=>(
              <div key={i} style={{ ...s.tipCard,borderTop:"3px solid "+t.color }}>
                <div style={{ fontSize:28,marginBottom:8 }}>{t.icon}</div>
                <div style={{ fontSize:14,fontWeight:700,color:"#e5e7eb",marginBottom:6 }}>{t.title}</div>
                <div style={{ fontSize:12,color:"#9ca3af",lineHeight:1.6 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PAY */}
      {tab === "pay" && (
        <div style={s.pg}>
          <div style={s.payHdr}>
            <div><div style={{ fontSize:18,fontWeight:800,color:"#fff" }}>Make a Payment</div><div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>at {hospital?.id}</div></div>
            {usdcBal !== null && usdcBal !== "--" && (
              <div style={s.payBal}>
                <span style={{ fontSize:10,color:"#6b7280" }}>Balance</span>
                <span style={{ fontSize:15,fontWeight:800,color:"#1a9e5f" }}>{usdcBal} USDC</span>
                <button style={{ background:"none",border:"none",color:"#1a9e5f",cursor:"pointer",fontSize:14 }} onClick={()=>refreshBalance()}>↻</button>
              </div>
            )}
          </div>
          <L t="Payment category" />
          <div style={{ position:"relative",marginBottom:14 }}>
            <button style={s.dropBtn} onClick={()=>{setShowCat(!showCat);setShowItem(false);}}>
              <span style={{ flex:1,textAlign:"left" }}>{paycat?CATS[paycat].icon+"  "+paycat:"Select category..."}</span><span style={{ color:"#6b7280" }}>▾</span>
            </button>
            {showCat && (
              <div style={s.dropMenu}>
                {Object.keys(CATS).map(cat=>(
                  <button key={cat} style={s.dropItem} onClick={()=>{setPaycat(cat);setPayitem("");setPayprice(0);setShowCat(false);}}>
                    <span style={{ fontSize:18 }}>{CATS[cat].icon}</span><span style={{ flex:1,fontWeight:500 }}>{cat}</span><span style={{ fontSize:11,color:"#6b7280" }}>{CATS[cat].items.length} services</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {paycat && (
            <div>
              <L t={"Select "+paycat+" type"} />
              <div style={{ position:"relative",marginBottom:14 }}>
                <button style={s.dropBtn} onClick={()=>{setShowItem(!showItem);setShowCat(false);}}>
                  <span style={{ flex:1,textAlign:"left" }}>{payitem||"Choose "+paycat+"..."}</span><span style={{ color:"#6b7280" }}>▾</span>
                </button>
                {showItem && (
                  <div style={s.dropMenu}>
                    {CATS[paycat].items.map((it,i)=>(
                      <button key={it} style={s.dropItem} onClick={()=>{setPayitem(it);setPayprice(CATS[paycat].prices[i]);setShowItem(false);}}>
                        <span style={{ flex:1 }}>{it}</span><span style={{ color:"#1a9e5f",fontWeight:700,fontSize:13 }}>{fmt(CATS[paycat].prices[i])}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {payitem && (
            <div style={s.priceBox}>
              <div style={{ fontSize:12,color:"#9ca3af" }}>Total to pay</div>
              <div style={{ fontSize:36,fontWeight:900,color:"#1a9e5f",letterSpacing:"-1px" }}>{fmt(payprice)}</div>
              <div style={{ fontSize:12,color:"#6b7280" }}>≈ {(payprice/NGN_USDC).toFixed(4)} USDC · ARC Testnet</div>
            </div>
          )}
          <L t="Note for hospital (optional)" />
          <input style={s.inp} placeholder="e.g. Prescribed by Dr. Musa Aliyu" value={paynote} onChange={e=>setPaynote(e.target.value)} />
          {loading && <Stp s={step} />}
          <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,marginBottom:8 }}>
            <GBtn disabled={!payitem||loading} onClick={handlePay}>{loading?"Processing on ARC...":payitem?"Pay "+fmt(payprice):"Pay"}</GBtn>
            <button style={{ ...s.outlineBtn,flexDirection:"column",gap:2,padding:"14px 10px",opacity:!payitem?0.5:1 }} disabled={!payitem} onClick={generatePayLink}>
              <span style={{ fontSize:18 }}>🔗</span><span style={{ fontSize:11,fontWeight:600 }}>Share Link</span>
            </button>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {tab === "history" && (
        <div style={s.pg}>
          <div style={{ fontSize:18,fontWeight:800,color:"#fff",marginBottom:4 }}>Transaction History</div>
          <div style={{ fontSize:12,color:"#9ca3af",marginBottom:20 }}>{history.length} total</div>
          {history.length === 0 ? (
            <div style={s.empty}><div style={{ fontSize:40,marginBottom:12 }}>📋</div><div style={{ fontSize:15,fontWeight:600,color:"#9ca3af",marginBottom:6 }}>No transactions yet</div><div style={{ fontSize:13,color:"#6b7280" }}>Make your first payment from the Pay tab</div></div>
          ) : history.map(r=>(
            <div key={r.id} style={{ ...s.histCard,borderLeft:"3px solid "+(r.status==="pending"?"#f59e0b":"#1a9e5f") }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10 }}>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                    <span style={{ fontSize:16 }}>{CATS[r.category]?.icon}</span>
                    <span style={{ fontSize:13,fontWeight:700,color:"#e5e7eb" }}>{r.category}</span>
                    <span style={{ ...s.statusBadge,...(r.status==="pending"?s.statusPending:s.statusDone) }}>{r.status==="pending"?"⏳ Pending":"✓ Confirmed"}</span>
                  </div>
                  <div style={{ fontSize:12,color:"#9ca3af" }}>{r.item}</div>
                  <div style={{ fontSize:11,color:"#6b7280",marginTop:4 }}>{r.date}</div>
                </div>
                <div style={{ textAlign:"right",flexShrink:0 }}>
                  <div style={{ fontSize:15,fontWeight:800,color:r.status==="pending"?"#f59e0b":"#1a9e5f" }}>{fmt(r.amount)}</div>
                  <div style={{ fontSize:11,color:"#6b7280" }}>{r.usdc} USDC</div>
                  {r.status==="confirmed" && <button style={{ fontSize:11,color:"#9ca3af",background:"none",border:"none",cursor:"pointer",padding:0,marginTop:6,textDecoration:"underline" }} onClick={()=>openShareReceipt(r)}>Share ⬆</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PROFILE */}
      {tab === "profile" && (
        <div style={s.pg}>
          <div style={s.profileHero}>
            <div style={s.profileGlow} />
            <div style={{ position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap" }}>
              <div style={s.avatar}>{(user?.name||"P")[0]}</div>
              <div>
                <div style={{ fontSize:20,fontWeight:800,color:"#fff" }}>{user?.name}</div>
                <div style={{ fontSize:12,color:"#1a9e5f",fontFamily:"monospace",marginTop:4 }}>{fileNo}</div>
                <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>{fbUser?.email}</div>
                <div style={{ fontSize:11,color:"#6b7280",marginTop:2 }}>{hospital?.id} · {hospital?.state}</div>
              </div>
            </div>
          </div>
          <div style={s.walletCard}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
              <div><div style={{ fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3 }}>Circle Programmable Wallet</div><div style={{ fontSize:11,color:"#9ca3af" }}>ARC Testnet · SCA Account</div></div>
              <div style={{ width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff",fontSize:15 }}>C</div>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
              <div style={{ fontSize:11,fontFamily:"monospace",color:"#1a9e5f",wordBreak:"break-all",flex:1,padding:"8px 10px",background:"#0d1117",borderRadius:8 }}>{walletAddr||"--"}</div>
              <CopyBtn text={walletAddr} />
            </div>
            <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:11,color:"#6b7280",marginBottom:3 }}>USDC Balance</div>
                <div style={{ display:"flex",alignItems:"baseline",gap:6 }}>
                  <span style={{ fontSize:28,fontWeight:900,color:"#1a9e5f" }}>{balLoading?"...":usdcBal!==null?usdcBal:"--"}</span>
                  <span style={{ fontSize:13,color:"#6b7280" }}>USDC</span>
                </div>
              </div>
              <button style={s.refBtn} onClick={()=>refreshBalance()}>↻ Refresh</button>
            </div>
            {faucetSent && (
              <div style={s.faucetBadge}>
                🎉 10 USDC auto-sent from Circle faucet on registration
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{ display:"block",fontSize:11,color:"#1a9e5f",marginTop:4,textDecoration:"underline" }}>Balance still 0? Claim manually here →</a>
              </div>
            )}
            <div style={{ marginTop:12,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{ display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700,color:"#1a9e5f",background:"#1a9e5f18",border:"0.5px solid #1a9e5f44",borderRadius:8,padding:"7px 14px",textDecoration:"none" }}>💧 Get Free Test USDC</a>
              <span style={{ fontSize:11,color:"#6b7280" }}>Paste your wallet address at the faucet</span>
            </div>
            <div style={{ marginTop:8,fontSize:10,color:"#6b7280" }}>Wallet ID: {walletId||"--"}</div>
          </div>
          <SL t="Profile Details" />
          <div style={s.card}>
            {[["Home Hospital",hospital?.id+" · "+hospital?.state],["Email",fbUser?.email||"--"],["Phone",user?.phone||form.phone||"--"],["Date of Birth",user?.dob||form.dob||"--"],["Blood Group",user?.bloodGroup||form.bloodGroup||"--"],["Genotype",user?.genotype||form.genotype||"--"],["State",user?.state||form.state||"--"],["Network","ARC-TESTNET (Circle)"]].map(([k,v])=>v&&(
              <div key={k} style={s.profRow}><span style={{ fontSize:13,color:"#9ca3af" }}>{k}</span><span style={{ fontSize:13,color:"#e5e7eb",fontWeight:500,textAlign:"right",wordBreak:"break-word" }}>{v}</span></div>
            ))}
          </div>
          <div style={{ marginTop:22 }}>
            <SL t="Hospital Access" />
            <button style={s.transferBtn} onClick={()=>{setShowTrf(true);setTrfDone(false);setTrfTarget("");}}>
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <div style={{ width:40,height:40,borderRadius:10,background:"#1a9e5f22",border:"1px solid #1a9e5f44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>🔗</div>
                <div><div style={{ fontSize:15,fontWeight:700,color:"#e5e7eb" }}>Link to Another Hospital</div><div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>Currently linked to {linked.length} hospital{linked.length!==1?"s":""}</div></div>
              </div>
              <span style={{ color:"#1a9e5f",fontSize:22 }}>›</span>
            </button>
          </div>
          <button style={s.signOutBtn} onClick={handleSignOut}>Sign Out</button>
        </div>
      )}

      {/* Transfer Modal */}
      {showTrf && (
        <Mdl onClose={()=>setShowTrf(false)}>
          {!trfDone ? (
            <div>
              <div style={{ fontSize:18,fontWeight:800,color:"#fff",marginBottom:6 }}>Link Records to New Hospital</div>
              <p style={{ fontSize:13,color:"#9ca3af",lineHeight:1.6,marginBottom:14 }}>Your file <strong style={{ color:"#1a9e5f" }}>{fileNo}</strong> and history will be accessible at the new hospital.</p>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:16 }}>
                {linked.map(h=><span key={h.id} style={{ fontSize:11,padding:"3px 10px",borderRadius:100,background:"#1a9e5f22",border:"0.5px solid #1a9e5f44",color:"#1a9e5f",fontWeight:600 }}>✓ {h.id}</span>)}
              </div>
              <L t="Select hospital to link" />
              <div style={{ position:"relative",marginBottom:16 }}>
                <button style={s.dropBtn} onClick={()=>setTrfDrop(!trfDrop)}>
                  <span style={{ flex:1,textAlign:"left" }}>{trfTarget?HOSPITALS.find(h=>h.id===trfTarget)?.full:"Choose hospital..."}</span><span>▾</span>
                </button>
                {trfDrop && (
                  <div style={s.dropMenu}>
                    {availTrf.length===0?<div style={{ padding:14,color:"#6b7280",textAlign:"center",fontSize:13 }}>All hospitals already linked</div>:availTrf.map(h=>(
                      <button key={h.id} style={s.dropItem} onClick={()=>{setTrfTarget(h.id);setTrfDrop(false);}}>
                        <strong style={{ color:"#1a9e5f",minWidth:56 }}>{h.id}</strong><span style={{ flex:1,fontSize:12 }}>{h.full}</span><span style={{ fontSize:11,color:"#6b7280" }}>{h.state}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {loading && <Stp s="Linking records on ARC Testnet..." />}
              <div style={{ display:"flex",gap:10 }}>
                <button style={s.outlineBtn} onClick={()=>setShowTrf(false)}>Cancel</button>
                <GBtn disabled={!trfTarget||loading} xstyle={{ flex:1 }} onClick={handleTransfer}>{loading?"Linking...":"Link Records"}</GBtn>
              </div>
            </div>
          ) : (
            <div style={{ textAlign:"center",padding:"12px 0" }}>
              <div style={{ fontSize:48,marginBottom:12 }}>✅</div>
              <div style={{ fontSize:18,fontWeight:800,color:"#fff",marginBottom:8 }}>Records Linked!</div>
              <GBtn onClick={()=>setShowTrf(false)}>Done ✓</GBtn>
            </div>
          )}
        </Mdl>
      )}

      {/* Pay Link Modal */}
      {showPayLink && (
        <Mdl onClose={()=>setShowPayLink(false)}>
          <div style={{ fontSize:18,fontWeight:800,color:"#fff",marginBottom:6 }}>🔗 Payment Link Created</div>
          <p style={{ fontSize:13,color:"#9ca3af",lineHeight:1.6,marginBottom:16 }}>Share this with a family member paying on your behalf.</p>
          <div style={{ background:"#0d1117",border:"0.5px solid #374151",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:11,fontFamily:"monospace",color:"#9ca3af",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{payLink}</span>
            <button style={s.refBtn} onClick={copyPayLink}>{payLinkCopied?"✓ Copied":"Copy"}</button>
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            <button style={s.greenBtn} onClick={sharePayLink}>💬 Share via WhatsApp / SMS</button>
            <button style={s.outlineBtn} onClick={()=>setShowPayLink(false)}>Close</button>
          </div>
        </Mdl>
      )}

      {showShareModal && shareReceipt && <ShareModal rec={shareReceipt} copied={rcpCopied} onCopy={copyReceiptText} onNative={nativeShare} onDownload={downloadReceiptImage} onClose={()=>setShowShareModal(false)} />}
    </Shell>
  );
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Shell({ children, showNav, isMobile, menuOpen, setMenuOpen, NAV, tab, switchTab, walletAddr, fileNo, balLoading, usdcBal, toast }) {
  return (
    <div style={s.shell}>
      <div style={s.topbar}>
        <div style={s.tbL}>
          {showNav && isMobile && <button style={s.burger} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?"✕":"☰"}</button>}
          <div style={s.logoMk}><span style={{ fontSize:18,fontWeight:800,color:"#fff" }}>M</span></div>
          <span style={{ fontSize:20,fontWeight:800,letterSpacing:"-0.5px",color:"#fff" }}>MediPay</span>
        </div>
        {showNav && (
          <div style={s.tbR}>
            {!isMobile && NAV.map(([k,ic,lb])=>(
              <button key={k} style={{ ...s.topBtn,...(tab===k?s.topBtnOn:{}) }} onClick={()=>switchTab(k)}><span>{ic}</span><span>{lb}</span></button>
            ))}
            <div style={s.balChip}>
              <span style={{ fontSize:10,color:"#6b7280",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em" }}>Balance</span>
              <span style={{ fontSize:14,fontWeight:800,color:"#1a9e5f" }}>{balLoading?"...":usdcBal!==null?usdcBal+" USDC":"--"}</span>
            </div>
          </div>
        )}
      </div>
      {showNav && isMobile && menuOpen && (
        <div style={s.drawer}>
          {NAV.map(([k,ic,lb])=>(
            <button key={k} style={{ ...s.dItem,...(tab===k?s.dItemOn:{}) }} onClick={()=>switchTab(k)}>
              <span style={{ fontSize:22 }}>{ic}</span><span style={{ fontSize:15,fontWeight:tab===k?700:400 }}>{lb}</span>
              {tab===k && <div style={s.dItemDot} />}
            </button>
          ))}
          <div style={{ padding:"14px 20px",borderTop:"0.5px solid #1f2937",marginTop:4 }}>
            <div style={{ fontSize:11,color:"#6b7280",marginBottom:3 }}>File Number</div>
            <div style={{ fontSize:13,fontFamily:"monospace",color:"#1a9e5f",fontWeight:600 }}>{fileNo||"--"}</div>
          </div>
        </div>
      )}
      <div style={{ display:"flex",minHeight:"calc(100vh - 64px)" }}>
        {showNav && !isMobile && (
          <div style={s.sidebar}>
            <div style={{ padding:"20px 12px 12px" }}>
              <div style={{ fontSize:10,color:"#6b7280",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12,paddingLeft:6 }}>Navigation</div>
              {NAV.map(([k,ic,lb])=>(
                <button key={k} style={{ ...s.sideBtn,...(tab===k?s.sideBtnOn:{}) }} onClick={()=>switchTab(k)}>
                  <span style={{ fontSize:18 }}>{ic}</span><span style={{ fontSize:14,fontWeight:tab===k?700:400 }}>{lb}</span>
                  {tab===k && <div style={{ marginLeft:"auto",width:4,height:20,borderRadius:2,background:"#1a9e5f" }} />}
                </button>
              ))}
            </div>
            <div style={s.sidefoot}>
              <div style={{ fontSize:10,color:"#6b7280",marginBottom:4,fontWeight:600 }}>Circle Wallet</div>
              <div style={{ fontSize:10,fontFamily:"monospace",color:"#1a9e5f",wordBreak:"break-all",marginBottom:4 }}>{walletAddr?walletAddr.slice(0,22)+"...":"--"}</div>
              <div style={{ display:"flex",alignItems:"center",gap:6 }}><div style={{ width:6,height:6,borderRadius:"50%",background:"#1a9e5f" }} /><span style={{ fontSize:10,color:"#6b7280" }}>ARC-TESTNET</span></div>
            </div>
          </div>
        )}
        <div style={{ flex:1,minWidth:0,marginLeft:showNav&&!isMobile?220:0 }}>{children}</div>
      </div>
      {toast.msg && <div style={{ ...s.toast,...(toast.type==="err"?{ background:"#dc2626" }:{}) }}>{toast.msg}</div>}
    </div>
  );
}
const CopyBtn = ({ text }) => { const [c,setC] = React.useState(false); return <button onClick={()=>{if(!text)return;navigator.clipboard.writeText(text).then(()=>{setC(true);setTimeout(()=>setC(false),2000)}).catch(()=>{})}} style={{ flexShrink:0,background:c?"#1a9e5f22":"#111827",border:"0.5px solid "+(c?"#1a9e5f":"#374151"),borderRadius:8,padding:"8px 12px",fontSize:12,color:c?"#1a9e5f":"#9ca3af",cursor:"pointer",fontFamily:"inherit",fontWeight:600,whiteSpace:"nowrap" }}>{c?"✓ Copied":"Copy"}</button>; };
const PBar = ({ title, onBack }) => (
  <div style={{ display:"flex",alignItems:"center",gap:12,padding:"14px 20px",borderBottom:"0.5px solid #1f2937",position:"sticky",top:0,background:"#0d1117",zIndex:20 }}>
    {onBack && <button style={{ background:"none",border:"0.5px solid #374151",color:"#9ca3af",fontSize:13,cursor:"pointer",padding:"6px 12px",borderRadius:8 }} onClick={onBack}>← Back</button>}
    <span style={{ flex:1,fontSize:15,fontWeight:700,color:"#e5e7eb" }}>{title}</span>
  </div>
);
const GBtn = ({ children, onClick, disabled, xstyle }) => <button style={{ background:disabled?"#374151":"linear-gradient(135deg,#1a9e5f,#0d7a47)",color:"#fff",border:"none",borderRadius:12,padding:"14px 20px",fontSize:14,fontWeight:700,cursor:disabled?"not-allowed":"pointer",width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,...(xstyle||{}) }} disabled={disabled} onClick={onClick}>{children}</button>;
const ShareModal = ({ rec, copied, onCopy, onNative, onDownload, onClose }) => (
  <Mdl onClose={onClose}>
    <div style={{ fontSize:18,fontWeight:800,color:"#fff",marginBottom:10 }}>Share Receipt</div>
    <div style={{ background:"#0d1117",border:"0.5px solid #374151",borderRadius:10,padding:14,fontFamily:"monospace",fontSize:11,lineHeight:1.9,color:"#9ca3af",marginBottom:16,maxHeight:200,overflowY:"auto",whiteSpace:"pre-wrap" }}>
      {["== MEDIPAY RECEIPT ==","Patient:  "+rec.patient,"File No:  "+rec.fileNo,"Hospital: "+(rec.hospital||""),"Service:  "+rec.item,"Amount:   "+fmt(rec.amount),"USDC:     "+rec.usdc+" USDC","Date:     "+rec.date,"Tx ID:    "+rec.id,"========================","Powered by Circle on ARC Testnet"].join("\n")}
    </div>
    <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
      <button style={{ background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer" }} onClick={()=>onCopy(rec)}>{copied?"✓ Copied!":"📋 Copy Receipt"}</button>
      <button style={{ background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer" }} onClick={()=>onNative(rec)}>📲 Share Image on WhatsApp</button>
      <button style={{ background:"linear-gradient(135deg,#7c3aed,#5b21b6)",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer" }} onClick={()=>onDownload(rec)}>⬇ Save as Image</button>
      <button style={{ background:"none",border:"1.5px solid #374151",color:"#9ca3af",borderRadius:12,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer" }} onClick={onClose}>Close</button>
    </div>
  </Mdl>
);
const L   = ({ t }) => <div style={{ fontSize:12,color:"#9ca3af",fontWeight:600,marginBottom:6,marginTop:6 }}>{t}</div>;
const SL  = ({ t }) => <div style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"#6b7280",marginBottom:12 }}>{t}</div>;
const Stp = ({ s:st }) => st?<div style={{ display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#1a9e5f",padding:"10px 0",lineHeight:1.5 }}><span style={{ animation:"spin .8s linear infinite",display:"inline-block" }}>◌</span>{st}</div>:null;
const Mdl = ({ children, onClose }) => (
  <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)",padding:"20px" }} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{ background:"#111827",borderRadius:"20px",padding:"28px 24px 36px",width:"100%",maxWidth:540,maxHeight:"85vh",overflowY:"auto",border:"0.5px solid #374151",boxShadow:"0 24px 64px rgba(0,0,0,0.8)" }}>{children}</div>
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  shell:        { minHeight:"100vh",background:"#0d1117",color:"#e5e7eb",fontFamily:"system-ui,-apple-system,sans-serif" },
  topbar:       { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",height:64,borderBottom:"0.5px solid #1f2937",position:"sticky",top:0,background:"rgba(13,17,23,0.95)",backdropFilter:"blur(12px)",zIndex:30,gap:12 },
  tbL:          { display:"flex",alignItems:"center",gap:10 },
  tbR:          { display:"flex",alignItems:"center",gap:8 },
  burger:       { background:"none",border:"none",color:"#e5e7eb",fontSize:22,cursor:"pointer",padding:"4px 8px",lineHeight:1 },
  logoMk:       { width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 0 20px #1a9e5f44" },
  topBtn:       { background:"none",border:"none",color:"#9ca3af",fontSize:13,fontWeight:500,cursor:"pointer",padding:"7px 12px",borderRadius:8,display:"flex",alignItems:"center",gap:6 },
  topBtnOn:     { background:"#1a9e5f18",color:"#1a9e5f",fontWeight:700,border:"0.5px solid #1a9e5f33" },
  balChip:      { display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1,background:"#111827",padding:"7px 14px",borderRadius:10,border:"0.5px solid #1f2937",flexShrink:0 },
  drawer:       { position:"fixed",top:64,left:0,right:0,background:"#111827",zIndex:25,borderBottom:"0.5px solid #1f2937",boxShadow:"0 8px 32px rgba(0,0,0,0.8)" },
  dItem:        { width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 20px",background:"none",border:"none",borderBottom:"0.5px solid #1f2937",color:"#9ca3af",cursor:"pointer",textAlign:"left",fontFamily:"inherit" },
  dItemOn:      { color:"#1a9e5f",background:"rgba(26,158,95,0.06)" },
  dItemDot:     { marginLeft:"auto",width:8,height:8,borderRadius:"50%",background:"#1a9e5f" },
  sidebar:      { width:220,background:"#111827",borderRight:"0.5px solid #1f2937",position:"fixed",top:64,bottom:0,left:0,display:"flex",flexDirection:"column",justifyContent:"space-between",overflowY:"auto",zIndex:20 },
  sideBtn:      { width:"100%",display:"flex",alignItems:"center",gap:12,padding:"11px 14px",background:"none",border:"none",color:"#9ca3af",cursor:"pointer",borderRadius:8,textAlign:"left",fontFamily:"inherit",fontSize:13,margin:"1px 0" },
  sideBtnOn:    { background:"rgba(26,158,95,0.1)",color:"#1a9e5f" },
  sidefoot:     { padding:"16px 14px",borderTop:"0.5px solid #1f2937" },
  pg:           { padding:"20px 24px 80px",maxWidth:860,margin:"0 auto" },
  sub:          { fontSize:13,color:"#9ca3af",lineHeight:1.6,margin:"8px 0 16px" },
  searchWrap:   { display:"flex",alignItems:"center",gap:10,background:"#111827",border:"0.5px solid #374151",borderRadius:12,padding:"0 14px",marginBottom:16 },
  searchInp:    { flex:1,background:"none",border:"none",outline:"none",padding:"12px 0",fontSize:14,color:"#e5e7eb",fontFamily:"inherit" },
  hGrid:        { display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,paddingBottom:20 },
  hCard:        { background:"#111827",border:"0.5px solid #1f2937",borderRadius:14,padding:"16px 14px",cursor:"pointer",textAlign:"left" },
  hIdBadge:     { display:"inline-block",fontSize:14,fontWeight:800,color:"#1a9e5f",background:"#1a9e5f18",border:"0.5px solid #1a9e5f44",padding:"3px 10px",borderRadius:6 },
  inp:          { width:"100%",background:"#111827",border:"0.5px solid #374151",borderRadius:10,padding:"13px 14px",fontSize:14,color:"#e5e7eb",marginBottom:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",caretColor:"#1a9e5f" },
  fileCard:     { background:"#111827",border:"1px solid #1a9e5f33",borderRadius:20,padding:"32px 24px",maxWidth:480,margin:"24px auto",textAlign:"center" },
  fileCheck:    { width:60,height:60,borderRadius:"50%",background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,color:"#fff",margin:"0 auto 16px",boxShadow:"0 0 30px rgba(26,158,95,0.4)" },
  fileNo:       { fontSize:28,fontWeight:900,color:"#1a9e5f",letterSpacing:2,marginBottom:6,fontFamily:"monospace" },
  walletReveal: { background:"#0d1117",border:"0.5px solid #1a9e5f44",borderRadius:12,padding:"14px",marginBottom:16,textAlign:"left" },
  faucetBadge:  { fontSize:12,color:"#1a9e5f",background:"#1a9e5f15",borderRadius:8,padding:"7px 10px",marginTop:8 },
  rcpCard:      { background:"#111827",border:"0.5px solid #1f2937",borderRadius:16,padding:"24px 20px",maxWidth:520,margin:"0 auto 16px" },
  rcpHeader:    { textAlign:"center",marginBottom:16,display:"flex",flexDirection:"column",alignItems:"center",gap:4 },
  rcpDash:      { borderTop:"1.5px dashed #1f2937",margin:"14px 0" },
  rcpRow:       { display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"6px 0",borderBottom:"0.5px solid #1f293720",gap:10 },
  rcpTotal:     { fontSize:30,fontWeight:900,color:"#1a9e5f",textAlign:"center",marginTop:14,letterSpacing:"-1px" },
  welcomeBanner:{ background:"linear-gradient(135deg,#0d1f14,#0d1117,#111827)",border:"1px solid #1a9e5f33",borderRadius:16,padding:"22px 24px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap",position:"relative",overflow:"hidden" },
  welcomeGlow:  { position:"absolute",top:"-50%",right:"-10%",width:200,height:200,borderRadius:"50%",background:"radial-gradient(circle,rgba(26,158,95,0.15),transparent 70%)",pointerEvents:"none" },
  welcomeBalance:{ textAlign:"right" },
  statsRow:     { display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20 },
  statBox:      { background:"#111827",border:"0.5px solid #1f2937",borderRadius:12,padding:"14px 8px",textAlign:"center" },
  statV:        { fontSize:20,fontWeight:800,color:"#1a9e5f" },
  statL:        { fontSize:10,color:"#9ca3af",marginTop:3 },
  qaCard:       { background:"#111827",border:"0.5px solid #1f2937",borderRadius:14,padding:"20px 16px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:6,textAlign:"left" },
  qaIcon:       { width:44,height:44,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:4 },
  linkedCard:   { background:"#111827",border:"0.5px solid #1f2937",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:14 },
  linkedIcon:   { width:42,height:42,borderRadius:10,background:"#1a9e5f18",border:"0.5px solid #1a9e5f44",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#1a9e5f",fontSize:11,flexShrink:0 },
  tipCard:      { background:"#111827",border:"0.5px solid #1f2937",borderRadius:14,padding:"16px" },
  card:         { background:"#111827",border:"0.5px solid #1f2937",borderRadius:14,padding:"16px" },
  payHdr:       { display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10 },
  payBal:       { display:"flex",alignItems:"center",gap:10,background:"#0d1f14",border:"0.5px solid #1a9e5f33",borderRadius:10,padding:"8px 14px" },
  dropBtn:      { width:"100%",background:"#111827",border:"0.5px solid #374151",borderRadius:12,padding:"13px 16px",fontSize:14,color:"#e5e7eb",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10,fontFamily:"inherit" },
  dropMenu:     { position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#111827",border:"0.5px solid #374151",borderRadius:12,zIndex:200,maxHeight:280,overflowY:"auto",boxShadow:"0 16px 48px rgba(0,0,0,0.8)" },
  dropItem:     { width:"100%",padding:"12px 16px",background:"none",border:"none",borderBottom:"0.5px solid #1f2937",color:"#e5e7eb",cursor:"pointer",textAlign:"left",fontSize:13,fontFamily:"inherit",display:"flex",alignItems:"center",gap:10 },
  priceBox:     { background:"linear-gradient(135deg,#0d1f14,#0d1117)",border:"1px solid #1a9e5f44",borderRadius:14,padding:"20px",marginBottom:16,textAlign:"center" },
  histCard:     { background:"#111827",border:"0.5px solid #1f2937",borderRadius:14,padding:"16px",marginBottom:10 },
  statusBadge:  { fontSize:10,padding:"2px 8px",borderRadius:100,fontWeight:700 },
  statusDone:   { background:"#1a9e5f22",color:"#1a9e5f",border:"0.5px solid #1a9e5f44" },
  statusPending:{ background:"#f59e0b22",color:"#f59e0b",border:"0.5px solid #f59e0b44" },
  profileHero:  { background:"linear-gradient(135deg,#0d1f14,#0d1117,#111827)",border:"1px solid #1a9e5f33",borderRadius:16,padding:"24px",marginBottom:18,position:"relative",overflow:"hidden" },
  profileGlow:  { position:"absolute",top:"-50%",right:"-10%",width:200,height:200,borderRadius:"50%",background:"radial-gradient(circle,rgba(26,158,95,0.15),transparent 70%)",pointerEvents:"none" },
  avatar:       { width:64,height:64,borderRadius:"50%",background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:"0 0 24px rgba(26,158,95,0.4)" },
  walletCard:   { background:"linear-gradient(135deg,#0d1a14,#0d1117)",border:"1px solid #1a9e5f44",borderRadius:16,padding:"20px",marginBottom:20 },
  profRow:      { display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"12px 0",borderBottom:"0.5px solid #1f2937",gap:10 },
  transferBtn:  { width:"100%",background:"#111827",border:"1px solid #1a9e5f33",borderRadius:14,padding:"16px 18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",textAlign:"left",fontFamily:"inherit" },
  refBtn:       { background:"#1a9e5f18",border:"0.5px solid #1a9e5f44",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#1a9e5f",cursor:"pointer",fontFamily:"inherit",fontWeight:600,flexShrink:0 },
  greenBtn:     { background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8 },
  outlineBtn:   { background:"transparent",color:"#9ca3af",border:"1.5px solid #374151",borderRadius:12,padding:"13px 16px",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6 },
  signOutBtn:   { width:"100%",marginTop:22,padding:"14px",background:"transparent",border:"1.5px solid #dc2626",color:"#dc2626",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer" },
  empty:        { textAlign:"center",color:"#6b7280",padding:"60px 0",lineHeight:1.8 },
  toast:        { position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"#1a9e5f",color:"#fff",padding:"12px 24px",borderRadius:100,fontSize:13,fontWeight:600,zIndex:600,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,0.4)" },
};