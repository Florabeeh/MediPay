import { useState, useEffect, useCallback } from "react";

// ─── Circle API ───────────────────────────────────────────────────────────────
const DEMO_MODE = true;
const CIRCLE_API = "https://api.circle.com";

async function circlePost(path, body, apiKey) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 1200)); return null; }
  const res = await fetch(CIRCLE_API + path, { method:"POST", headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"}, body:JSON.stringify(body) });
  if (!res.ok) throw new Error("Circle API "+res.status);
  return res.json();
}
async function circleGet(path, apiKey) {
  if (DEMO_MODE) { await new Promise(r => setTimeout(r, 800)); return null; }
  const res = await fetch(CIRCLE_API + path, { headers:{"Authorization":`Bearer ${apiKey}`} });
  if (!res.ok) throw new Error("Circle API "+res.status);
  return res.json();
}
async function createCircleWallet(apiKey, walletSetId, refId) {
  if (DEMO_MODE) { await new Promise(r=>setTimeout(r,1400)); return { id:"wlt_"+Math.random().toString(36).slice(2,14), address:"0x"+[...Array(20)].map(()=>Math.floor(Math.random()*256).toString(16).padStart(2,"0")).join(""), blockchain:"ARC-TESTNET", state:"LIVE" }; }
  const data = await circlePost("/v1/w3s/developer/wallets", { idempotencyKey:crypto.randomUUID(), accountType:"EOA", blockchains:["ARC-TESTNET"], count:1, walletSetId, metadata:[{name:refId,refId}] }, apiKey);
  return data?.data?.wallets?.[0];
}
async function faucetDrip(apiKey, address) {
  if (DEMO_MODE) { await new Promise(r=>setTimeout(r,1000)); return {amount:"10.00",status:"pending"}; }
  return circlePost("/v1/faucet/drips", { idempotencyKey:crypto.randomUUID(), address, blockchain:"ARC-TESTNET", usdc:true }, apiKey);
}
async function getWalletBalance(apiKey, walletId) {
  if (DEMO_MODE) { await new Promise(r=>setTimeout(r,600)); return (Math.random()*18+2).toFixed(2); }
  const data = await circleGet(`/v1/w3s/wallets/${walletId}/balances`, apiKey);
  return data?.data?.tokenBalances?.find(t=>t.token?.symbol==="USDC")?.amount || "0.00";
}
async function sendPayment(apiKey, fromWalletId, toAddress, amount) {
  if (DEMO_MODE) { await new Promise(r=>setTimeout(r,2000)); return { id:"txn_"+Math.random().toString(36).slice(2,14), txHash:"0x"+[...Array(16)].map(()=>Math.floor(Math.random()*16).toString(16)).join(""), state:"COMPLETE" }; }
  const data = await circlePost("/v1/w3s/developer/transactions/transfer", { idempotencyKey:crypto.randomUUID(), walletId:fromWalletId, blockchain:"ARC-TESTNET", tokenAddress:"0x3600000000000000000000000000000000000000", destinationAddress:toAddress, amounts:[String(amount)], feeLevel:"MEDIUM" }, apiKey);
  return data?.data?.transaction;
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const HOSPITALS = [
  {id:"UDUTH",full:"Usmanu Danfodiyo University Teaching Hospital",state:"Sokoto"},
  {id:"LUTH", full:"Lagos University Teaching Hospital",           state:"Lagos"},
  {id:"UCH",  full:"University College Hospital",                  state:"Oyo"},
  {id:"ABUTH",full:"Ahmadu Bello University Teaching Hospital",    state:"Kaduna"},
  {id:"UNTH", full:"University of Nigeria Teaching Hospital",      state:"Enugu"},
  {id:"OAUTH",full:"Obafemi Awolowo University Teaching Hospital", state:"Osun"},
  {id:"UATH", full:"University of Abuja Teaching Hospital",        state:"FCT"},
  {id:"BMSH", full:"Benin Medical & Surgical Hospital",            state:"Edo"},
  {id:"GESTH",full:"General Hospital Enugu (State)",               state:"Enugu"},
  {id:"NKST", full:"NKST Hospital Mkar",                           state:"Benue"},
  {id:"FMCB", full:"Federal Medical Centre Birnin Kebbi",          state:"Kebbi"},
  {id:"FMCA", full:"Federal Medical Centre Abeokuta",              state:"Ogun"},
];

const CATS = {
  Surgery:       {icon:"🔪",items:["Brain Surgery","Open Heart Surgery","Kidney Transplant","Liver Transplant","Appendectomy","Caesarean Section","Spinal Surgery","Hip Replacement","Knee Replacement","Eye Surgery (Cataract)","Hernia Repair","Thyroidectomy"],prices:[950000,1200000,2500000,3800000,180000,250000,750000,900000,850000,320000,150000,420000]},
  Investigations:{icon:"🧪",items:["Full Blood Count","Liver Function Test","Kidney Function Test","Malaria RDT","HIV Screening","Hepatitis B&C Panel","Blood Culture","Thyroid Function Test","Widal Test","Stool MCS","Urinalysis","Coagulation Profile"],prices:[3500,5500,6000,2000,4500,9000,15000,12000,2500,3000,1500,18000]},
  Radiology:     {icon:"🩻",items:["Chest X-Ray","Abdominal Ultrasound","CT Scan (Head)","MRI Brain","Echocardiogram","Pelvic Ultrasound","Mammogram","Bone Density Scan","Barium Meal","Fluoroscopy","Nuclear Medicine Scan","PET Scan"],prices:[8000,15000,85000,180000,55000,12000,25000,30000,20000,35000,200000,450000]},
  Medication:    {icon:"💊",items:["Antimalarial Course","Antibiotic Course","Antihypertensive (1mo)","Diabetic Medication (1mo)","Chemotherapy Round","ARV (1 month)","Painkillers","IV Fluids (per bag)","Insulin (per vial)","Anticoagulants","Immunosuppressants","Vitamins"],prices:[4500,6000,8500,12000,350000,18000,3500,2500,15000,25000,45000,4000]},
  Therapy:       {icon:"🧠",items:["Physiotherapy Session","Occupational Therapy","Speech Therapy","Dialysis Session","Chemotherapy Session","Radiation Therapy","Cardiac Rehab","Wound Dressing","Blood Transfusion","IV Infusion Therapy","Respiratory Therapy","Hydrotherapy"],prices:[8000,9500,10000,85000,150000,200000,25000,5000,45000,15000,18000,12000]},
  Pharmacy:      {icon:"🏪",items:["Prescription Dispensing","Over-the-Counter Meds","Medical Consumables","Surgical Supplies","Formulary Drugs","Vaccination Package","Nebulizer Medication","Ophthalmic Drops","Topical Creams","Ear/Nasal Drops","ORS","Asthma Inhaler"],prices:[2000,3500,5000,8000,12000,25000,7000,4500,2500,3000,1500,18000]},
  Rehabilitation:{icon:"🦽",items:["Post-Stroke Rehab","Post-Surgery Recovery","Orthopedic Rehab","Cardiac Rehab Program","Pulmonary Rehab","Substance Abuse Rehab","TBI Rehab","Spinal Cord Rehab","Pediatric Rehab","Geriatric Rehab","Sports Injury Rehab","Amputee Rehab"],prices:[45000,35000,40000,55000,50000,80000,120000,100000,30000,35000,25000,65000]},
  Procedures:    {icon:"⚕️", items:["Endoscopy","Colonoscopy","Bone Marrow Biopsy","Lumbar Puncture","Liver Biopsy","Bronchoscopy","Cystoscopy","Circumcision","Dental Extraction","Vasectomy","Colposcopy","Hysteroscopy"],prices:[55000,60000,75000,35000,80000,65000,50000,15000,12000,20000,30000,45000]},
};

const HEALTH_TIPS = [
  {icon:"💧",title:"Stay Hydrated",body:"Drink 8–12 glasses of water daily. Dehydration is a leading cause of hospital visits in Nigeria's hot climate."},
  {icon:"🩸",title:"Know Your Genotype",body:"Confirm genotype before marriage. SS children suffer sickle cell disease — entirely preventable with proper planning."},
  {icon:"🍎",title:"Eat Local Vegetables",body:"Ugwu, garden egg, and bitter leaf are rich in iron and vitamins. Include them in every meal."},
  {icon:"🏃",title:"Exercise Daily",body:"30 minutes of walking daily reduces diabetes and hypertension risk by up to 35%. No gym needed."},
  {icon:"🩺",title:"Annual Check-ups",body:"Silent killers — hypertension, diabetes, cancer — show no early symptoms. A yearly check saves lives."},
  {icon:"🌙",title:"Sleep 7–9 Hours",body:"Poor sleep raises blood pressure and weakens immunity. Try to sleep at the same time each night."},
  {icon:"🧴",title:"Wash Your Hands",body:"20 seconds with soap prevents diarrhoea, typhoid, and cholera — top causes of illness in West Africa."},
  {icon:"💉",title:"Vaccinate Children",body:"Routine vaccines protect against polio, measles, yellow fever. Visit your nearest PHC for the schedule."},
];
const NEWS = [
  {tag:"Launch",title:"MediPay live across 12 Nigerian hospitals",body:"Register once at UDUTH, LUTH, UCH, ABUTH and 8 others with a single Circle Programmable Wallet."},
  {tag:"Feature",title:"Transfer records across states instantly",body:"Moving from Sokoto to Lagos? Your history travels with you. Just enter your file number at any MediPay hospital."},
  {tag:"Technology",title:"Powered by Circle on ARC Testnet",body:"Every payment settles in under 1 second using Circle Nanopayments. No bank delays, no transfer fees."},
  {tag:"Vision",title:"Expanding to Ghana & Kenya by Q4 2026",body:"After Nigeria pilot, MediPay partners with Korle-Bu (Ghana) and Kenyatta National Hospital (Kenya)."},
];
const STATS = [{val:"12",label:"Hospitals"},{val:"<1s",label:"Settlement"},{val:"₦0",label:"Fees"},{val:"36",label:"States"}];
const NGN_USDC = 1650;
const HOSP_ADDR = "0x742d35Cc6634C0532925a3b8D4C9b4AA12b5e6f4";

const fmt = n => "₦" + Number(n).toLocaleString();
const genFN = id => id + "-" + Date.now().toString().slice(-6) + "-" + Math.floor(Math.random()*9000+1000);

// ─── Receipt text builder ─────────────────────────────────────────────────────
function buildReceiptText(r) {
  return [
    "━━━━━━━━━━━━━━━━━━━━━━━━",
    "       MEDIPAY RECEIPT",
    "━━━━━━━━━━━━━━━━━━━━━━━━",
    `Patient:     ${r.patient}`,
    `File No:     ${r.fileNo}`,
    `Hospital:    ${r.hospital}`,
    `─────────────────────────`,
    `Category:    ${r.category}`,
    `Service:     ${r.item}`,
    r.note ? `Note:        ${r.note}` : null,
    `─────────────────────────`,
    `Amount:      ${fmt(r.amount)}`,
    `USDC:        ${r.usdc} USDC`,
    `Network:     ARC-TESTNET`,
    `Settlement:  < 1 second`,
    `─────────────────────────`,
    `Date:        ${r.date}`,
    `Tx ID:       ${r.id}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━",
    "Powered by Circle on ARC Testnet",
    "medipay.circle.arc",
  ].filter(Boolean).join("\n");
}

// ─── Payment link encoder ─────────────────────────────────────────────────────
function buildPaymentLink(data) {
  const payload = btoa(JSON.stringify({
    fn:   data.fileNo,
    h:    data.hospitalId,
    cat:  data.category,
    item: data.item,
    amt:  data.amount,
    note: data.note || "",
    ts:   Date.now(),
  }));
  // In production this would be your real domain. In demo we use a data URL pattern.
  return `https://medipay.app/pay?ref=${payload}`;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function MediPay() {
  const [screen,    setScreen]    = useState("landing");
  const [hospital,  setHospital]  = useState(null);
  const [authMode,  setAuthMode]  = useState("signup");
  const [user,      setUser]      = useState(null);
  const [form,      setForm]      = useState({name:"",dob:"",gender:"",phone:"",email:"",address:"",state:"",bloodGroup:"",genotype:""});
  const [fileNo,    setFileNo]    = useState("");
  const [walletId,  setWalletId]  = useState("");
  const [walletAddr,setWalletAddr]= useState("");
  const [usdcBal,   setUsdcBal]   = useState(null);
  const [balLoading,setBalLoading]= useState(false);
  const [faucetSent,setFaucetSent]= useState(false);
  const [linked,    setLinked]    = useState([]);
  const [tab,       setTab]       = useState("home");
  const [paycat,    setPaycat]    = useState("");
  const [payitem,   setPayitem]   = useState("");
  const [payprice,  setPayprice]  = useState(0);
  const [paynote,   setPaynote]   = useState("");
  const [receipt,   setReceipt]   = useState(null);
  const [history,   setHistory]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [step,      setStep]      = useState("");
  const [toast,     setToast]     = useState({msg:"",type:"ok"});
  const [searchH,   setSearchH]   = useState("");
  const [showCat,   setShowCat]   = useState(false);
  const [showItem,  setShowItem]  = useState(false);
  const [showTrf,   setShowTrf]   = useState(false);
  const [trfTarget, setTrfTarget] = useState("");
  const [trfDrop,   setTrfDrop]   = useState(false);
  const [trfDone,   setTrfDone]   = useState(false);
  const [existFN,   setExistFN]   = useState("");
  const [apiKey,    setApiKey]    = useState("");
  // Responsive
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [isMobile,  setIsMobile]  = useState(window.innerWidth < 768);
  // Payment link modal
  const [showPayLink, setShowPayLink] = useState(false);
  const [payLink,     setPayLink]     = useState("");
  const [payLinkCopied, setPayLinkCopied] = useState(false);
  // Share receipt modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareReceipt,   setShareReceipt]   = useState(null);
  const [rcpCopied,      setRcpCopied]      = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const toast_ = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast({msg:"",type:"ok"}),3200); };
  const filtered = HOSPITALS.filter(h=>h.full.toLowerCase().includes(searchH.toLowerCase())||h.state.toLowerCase().includes(searchH.toLowerCase())||h.id.toLowerCase().includes(searchH.toLowerCase()));
  const availTrf = HOSPITALS.filter(h=>!linked.find(l=>l.id===h.id)&&h.id!==hospital?.id);

  const refreshBalance = async (wId) => {
    const id = wId || walletId; if (!id) return;
    setBalLoading(true);
    try { setUsdcBal(await getWalletBalance(apiKey, id)); } catch { setUsdcBal("—"); }
    setBalLoading(false);
  };

  const setupWallet = async (refId) => {
    setStep("Creating your Circle Programmable Wallet on ARC Testnet…");
    const w = await createCircleWallet(apiKey, "demo-set", refId);
    setWalletId(w.id); setWalletAddr(w.address);
    setStep("Requesting testnet USDC from Circle faucet…");
    await faucetDrip(apiKey, w.address);
    setFaucetSent(true);
    setStep("Loading balance…");
    setUsdcBal(await getWalletBalance(apiKey, w.id));
    setStep(""); return w;
  };

  const handleHospSelect = h => { setHospital(h); setScreen("auth"); };

  const handleAuth = async () => {
    setLoading(true);
    if (authMode==="existing") {
      const fn = existFN.trim().toUpperCase();
      if (!fn) { toast_("Enter your file number","err"); setLoading(false); return; }
      const w = await setupWallet(fn);
      const prefix = fn.split("-")[0];
      const homeH = HOSPITALS.find(h=>h.id===prefix)||hospital;
      setLinked([homeH,hospital].filter(Boolean).filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i));
      setFileNo(fn); setUser({name:"Returning Patient",email:""});
      toast_("✓ Records found — welcome back");
      setLoading(false); setTab("home"); setScreen("dashboard");
    } else { setLoading(false); setScreen("profile"); }
  };

  const handleProfileSubmit = async () => {
    if (!form.name||!form.dob||!form.phone) { toast_("Fill all required fields","err"); return; }
    setLoading(true);
    const fn = genFN(hospital.id); setFileNo(fn);
    await setupWallet(fn);
    setLinked([hospital]); setUser({...form});
    setLoading(false); setScreen("fileno");
  };

  const handlePay = async () => {
    if (!paycat||!payitem) { toast_("Select category and item","err"); return; }
    setLoading(true); setStep("Signing transaction via Circle MPC…");
    try {
      const idx = CATS[paycat].items.indexOf(payitem);
      const amount = CATS[paycat].prices[idx];
      const usdc = (amount/NGN_USDC).toFixed(4);
      const tx = await sendPayment(apiKey, walletId, HOSP_ADDR, usdc);
      if (usdcBal&&usdcBal!=="—") setUsdcBal(Math.max(0,parseFloat(usdcBal)-parseFloat(usdc)).toFixed(2));
      const rec = {
        id: tx?.txHash||tx?.id||"0x"+[...Array(16)].map(()=>Math.floor(Math.random()*16).toString(16)).join(""),
        hospital:hospital?.full, hospitalId:hospital?.id,
        patient:user?.name||form.name, fileNo, walletAddr,
        category:paycat, item:payitem, amount, usdc, note:paynote,
        date:new Date().toLocaleString("en-NG",{dateStyle:"full",timeStyle:"short"}),
      };
      setReceipt(rec); setHistory(h=>[rec,...h]);
      setLoading(false); setStep(""); setScreen("receipt");
    } catch(e) { toast_("Payment failed: "+e.message,"err"); setLoading(false); setStep(""); }
  };

  const handleTransfer = async () => {
    if (!trfTarget) { toast_("Select a hospital","err"); return; }
    setLoading(true);
    await new Promise(r=>setTimeout(r,1400));
    setLinked(p=>[...p,HOSPITALS.find(h=>h.id===trfTarget)]);
    setLoading(false); setTrfDone(true);
    toast_("✓ Records linked to "+trfTarget);
  };

  // ── Share receipt ──────────────────────────────────────────────────────────
  const openShareReceipt = (rec) => {
    setShareReceipt(rec); setRcpCopied(false); setShowShareModal(true);
  };
  const copyReceiptText = (rec) => {
    const text = buildReceiptText(rec);
    navigator.clipboard.writeText(text).then(()=>{ setRcpCopied(true); setTimeout(()=>setRcpCopied(false),2000); }).catch(()=>{ toast_("Clipboard not available","err"); });
  };
  const nativeShare = (rec) => {
    if (navigator.share) {
      navigator.share({ title:"MediPay Receipt", text:buildReceiptText(rec) });
    } else { copyReceiptText(rec); toast_("Copied to clipboard!"); }
  };

  // ── Generate payment link ──────────────────────────────────────────────────
  const generatePayLink = () => {
    if (!paycat||!payitem) { toast_("Select category and item first","err"); return; }
    const idx = CATS[paycat].items.indexOf(payitem);
    const amount = CATS[paycat].prices[idx];
    const link = buildPaymentLink({ fileNo, hospitalId:hospital?.id, category:paycat, item:payitem, amount, note:paynote });
    setPayLink(link); setPayLinkCopied(false); setShowPayLink(true);
  };
  const copyPayLink = () => {
    navigator.clipboard.writeText(payLink).then(()=>{ setPayLinkCopied(true); setTimeout(()=>setPayLinkCopied(false),2000); }).catch(()=>toast_("Clipboard not available","err"));
  };
  const sharePayLink = () => {
    const idx = CATS[paycat].items.indexOf(payitem);
    const amount = CATS[paycat].prices[idx];
    const text = `Hi, please help me pay my medical bill at ${hospital?.id}.\n\nService: ${payitem}\nAmount: ${fmt(amount)}\n\nPay here: ${payLink}`;
    if (navigator.share) navigator.share({ title:"MediPay Payment Request", text, url:payLink });
    else { copyPayLink(); toast_("Link copied!"); }
  };

  // ─── Sidebar / Nav items ───────────────────────────────────────────────────
  const NAV = [["home","🏠","Home"],["pay","💳","Pay"],["history","📋","History"],["profile","👤","Profile"]];
  const switchTab = (t) => { setTab(t); setMenuOpen(false); };

  // ══════════════════════════════════════════════════════════════════════════════
  //  LAYOUT WRAPPER
  // ══════════════════════════════════════════════════════════════════════════════
  const AppShell = ({children, showNav=false}) => (
    <div style={c.shell}>
      {/* ── TOP BAR (always) ── */}
      <div style={c.topbar}>
        <div style={c.tbLeft}>
          {showNav && isMobile && (
            <button style={c.hamburger} onClick={()=>setMenuOpen(!menuOpen)}>
              {menuOpen ? "✕" : "☰"}
            </button>
          )}
          <div style={c.mk}>M</div>
          <span style={c.mkTxt}>MediPay</span>
          {DEMO_MODE && <span style={c.demoBadge}>Demo</span>}
        </div>
        {showNav && (
          <div style={c.tbRight}>
            {!isMobile && NAV.map(([k,ic,lb])=>(
              <button key={k} style={{...c.topNavBtn,...(tab===k?c.topNavBtnOn:{})}} onClick={()=>switchTab(k)}>
                {ic} {lb}
              </button>
            ))}
            {showNav && (
              <div style={c.walPill}>
                <span style={{fontSize:10,color:"#484f58"}}>Balance</span>
                <span style={{fontSize:13,fontWeight:800,color:"#1a9e5f"}}>
                  {balLoading?"…":usdcBal!==null?usdcBal+" USDC":"—"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MOBILE MENU DRAWER ── */}
      {showNav && isMobile && menuOpen && (
        <div style={c.drawer}>
          <div style={{padding:"12px 16px 6px",fontSize:11,color:"#484f58",textTransform:"uppercase",letterSpacing:".07em"}}>Navigation</div>
          {NAV.map(([k,ic,lb])=>(
            <button key={k} style={{...c.drawerItem,...(tab===k?c.drawerItemOn:{})}} onClick={()=>switchTab(k)}>
              <span style={{fontSize:20}}>{ic}</span>
              <span style={{fontSize:15,fontWeight:tab===k?700:400}}>{lb}</span>
            </button>
          ))}
          <div style={{padding:"14px 16px",borderTop:"0.5px solid #21262d",marginTop:8}}>
            <div style={{fontSize:12,color:"#8b949e",marginBottom:4}}>File Number</div>
            <div style={{fontSize:13,fontFamily:"monospace",color:"#1a9e5f"}}>{fileNo}</div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{...c.content, marginLeft: showNav && !isMobile ? 220 : 0}}>
        {/* Desktop sidebar */}
        {showNav && !isMobile && (
          <div style={c.sidebar}>
            <div style={{padding:"16px 12px 8px"}}>
              <div style={{fontSize:11,color:"#484f58",textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>Menu</div>
              {NAV.map(([k,ic,lb])=>(
                <button key={k} style={{...c.sideItem,...(tab===k?c.sideItemOn:{})}} onClick={()=>switchTab(k)}>
                  <span style={{fontSize:18}}>{ic}</span>
                  <span style={{fontSize:14,fontWeight:tab===k?700:400}}>{lb}</span>
                </button>
              ))}
            </div>
            <div style={c.sideBottom}>
              <div style={{fontSize:10,color:"#484f58",marginBottom:4}}>Circle Wallet</div>
              <div style={{fontSize:11,fontFamily:"monospace",color:"#1a9e5f",wordBreak:"break-all",marginBottom:6}}>{walletAddr.slice(0,20)}…</div>
              <div style={{fontSize:10,color:"#484f58"}}>ARC-TESTNET</div>
            </div>
          </div>
        )}
        <div style={c.main}>{children}</div>
      </div>

      {/* Toast */}
      {toast.msg && <div style={{...c.toast,...(toast.type==="err"?{background:"#c0392b"}:{})}}>{toast.msg}</div>}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  //  SCREENS
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Landing ──────────────────────────────────────────────────────────────────
  if (screen==="landing") return (
    <AppShell>
      <div style={c.landCenter}>
        <div style={c.glow}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <div style={c.mk}>M</div><span style={{fontSize:32,fontWeight:800,letterSpacing:"-1px"}}>MediPay</span>
        </div>
        <h1 style={c.landH1}>Medical bills.<br/>Paid instantly.<br/>Across Nigeria.</h1>
        <p style={c.landSub}>One Circle Wallet. Every hospital. Zero paperwork.<br/>Powered by Circle USDC on ARC Testnet.</p>
        <GBtn onClick={()=>setScreen("hospitals")} style={{maxWidth:320,margin:"0 auto 20px"}}>Get Started →</GBtn>
        <div style={c.chips}>
          {["🔒 Circle Programmable Wallet","⚡ ARC Testnet","🇳🇬 12 Hospitals","💸 USDC Settlement"].map(b=>(
            <span key={b} style={c.chip}>{b}</span>
          ))}
        </div>
        <p style={{fontSize:12,color:"#484f58",marginTop:14}}>Powered by Circle Agent Stack · Nanopayments · x402</p>
        {DEMO_MODE&&<div style={c.demoBanner}>🧪 Demo Mode — swap in your Circle API key to go live</div>}
      </div>
    </AppShell>
  );

  // ── Hospitals ─────────────────────────────────────────────────────────────────
  if (screen==="hospitals") return (
    <AppShell>
      <PageBar title="Select Hospital" onBack={()=>setScreen("landing")}/>
      <div style={c.pg}>
        <p style={c.sub}>Choose the hospital you are currently visiting.</p>
        <input style={c.inp} placeholder="🔍  Search hospital or state…" value={searchH} onChange={e=>setSearchH(e.target.value)}/>
        <div style={c.hGrid}>
          {filtered.map(h=>(
            <button key={h.id} style={c.hCard} onClick={()=>handleHospSelect(h)}>
              <div style={c.hId}>{h.id}</div>
              <div style={c.hFull}>{h.full}</div>
              <div style={c.hState}>{h.state} State</div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );

  // ── Auth ──────────────────────────────────────────────────────────────────────
  if (screen==="auth") return (
    <AppShell>
      <PageBar title={hospital?.id} onBack={()=>setScreen("hospitals")}/>
      <div style={c.pg}>
        <div style={c.hospBanner}>
          <span style={{fontSize:24,fontWeight:800,color:"#1a9e5f"}}>{hospital?.id}</span>
          <span style={{fontSize:12,color:"#8b949e"}}>{hospital?.full}</span>
        </div>
        <p style={c.sub}>No crypto knowledge needed. A Circle Programmable Wallet is created for you automatically.</p>
        <div style={c.aTabs}>
          {[["signup","New Patient"],["existing","I have a File Number"]].map(([m,l])=>(
            <button key={m} style={{...c.aTab,...(authMode===m?c.aTabOn:{})}} onClick={()=>setAuthMode(m)}>{l}</button>
          ))}
        </div>
        {authMode==="existing"?(
          <>
            <Lbl t="Your MediPay file number"/>
            <input style={c.inp} placeholder="e.g. UDUTH-123456-4521" value={existFN} onChange={e=>setExistFN(e.target.value)}/>
            <p style={c.hint}>Retrieves your records and links your wallet to <b style={{color:"#e6edf3"}}>{hospital?.id}</b>. No forms needed.</p>
            {loading&&<Step s={step}/>}
            <GBtn disabled={loading} onClick={handleAuth}>{loading?"Retrieving…":"Retrieve My Records →"}</GBtn>
          </>
        ):(
          <>
            <p style={c.hint}>We'll register you at {hospital?.id} and create a Circle Programmable Wallet.</p>
            <input style={c.inp} placeholder="Email address" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              <button style={c.socialBtn} onClick={handleAuth}>📧  Continue with Email</button>
              <button style={c.socialBtn} onClick={handleAuth}>🇬  Continue with Google</button>
            </div>
            <p style={{fontSize:11,color:"#484f58",textAlign:"center"}}>Circle MPC-secured — no seed phrase exposed.</p>
          </>
        )}
      </div>
    </AppShell>
  );

  // ── Profile Form ──────────────────────────────────────────────────────────────
  if (screen==="profile") return (
    <AppShell>
      <PageBar title="Create Profile" onBack={()=>setScreen("auth")}/>
      <div style={c.pg}>
        <p style={c.sub}>Fill your details to register at {hospital?.id}.</p>
        <Lbl t="Full name *"/><input style={c.inp} placeholder="First Middle Last" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
        <Lbl t="Date of birth *"/><input style={c.inp} type="date" value={form.dob} onChange={e=>setForm({...form,dob:e.target.value})}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><Lbl t="Gender"/><select style={c.inp} value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div><Lbl t="Blood Group"/><select style={c.inp} value={form.bloodGroup} onChange={e=>setForm({...form,bloodGroup:e.target.value})}><option value="">Select</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g=><option key={g}>{g}</option>)}</select></div>
        </div>
        <Lbl t="Phone *"/><input style={c.inp} placeholder="+234…" type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
        <Lbl t="State of residence"/><select style={c.inp} value={form.state} onChange={e=>setForm({...form,state:e.target.value})}><option value="">Select state</option>{["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"].map(s=><option key={s}>{s}</option>)}</select>
        <Lbl t="Home address"/><input style={c.inp} placeholder="Street, LGA, State" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
        <Lbl t="Genotype"/><select style={c.inp} value={form.genotype} onChange={e=>setForm({...form,genotype:e.target.value})}><option value="">Select</option>{["AA","AS","SS","AC","SC"].map(g=><option key={g}>{g}</option>)}</select>
        {loading&&<Step s={step}/>}
        <GBtn disabled={loading} onClick={handleProfileSubmit}>{loading?"Setting up…":"Submit & Register →"}</GBtn>
      </div>
    </AppShell>
  );

  // ── File Number Reveal ────────────────────────────────────────────────────────
  if (screen==="fileno") return (
    <AppShell>
      <div style={c.pg}>
        <div style={{...c.card,textAlign:"center",marginTop:24,padding:"32px 24px",maxWidth:480,margin:"24px auto 0"}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{fontSize:13,color:"#8b949e",marginBottom:8}}>Registration Successful</div>
          <div style={{fontSize:28,fontWeight:800,color:"#1a9e5f",letterSpacing:2,marginBottom:4}}>{fileNo}</div>
          <div style={{fontSize:12,color:"#484f58",marginBottom:10}}>Your MediPay File Number</div>
          <div style={{...c.walletBox,marginBottom:14}}>
            <div style={{fontSize:10,color:"#484f58",marginBottom:4,textTransform:"uppercase",letterSpacing:".06em"}}>Circle Programmable Wallet · ARC Testnet</div>
            <div style={{fontSize:12,fontFamily:"monospace",color:"#1a9e5f",wordBreak:"break-all"}}>{walletAddr}</div>
            {faucetSent&&<div style={{marginTop:8,fontSize:12,color:"#1a9e5f",background:"#1a9e5f15",borderRadius:8,padding:"6px 10px"}}>🎉 10 USDC testnet sent from Circle faucet!</div>}
          </div>
          <p style={{fontSize:13,color:"#8b949e",lineHeight:1.7,marginBottom:20}}><b style={{color:"#e6edf3"}}>Save this file number.</b> Visit any partner hospital, quote it, and your records are there — no re-registration.</p>
          <GBtn onClick={()=>{setTab("home");setScreen("dashboard");}}>Go to Dashboard →</GBtn>
        </div>
      </div>
    </AppShell>
  );

  // ── Receipt ───────────────────────────────────────────────────────────────────
  if (screen==="receipt") return (
    <AppShell>
      <PageBar title="Payment Receipt" onBack={()=>{setPaycat("");setPayitem("");setPaynote("");setPayprice(0);setTab("pay");setScreen("dashboard");}}/>
      <div style={c.pg}>
        <div style={{...c.card,maxWidth:520,margin:"0 auto 14px"}}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{...c.mk,margin:"0 auto 6px",width:48,height:48,fontSize:22}}>M</div>
            <div style={{fontSize:18,fontWeight:800}}>MediPay</div>
            <div style={{fontSize:13,color:"#1a9e5f",marginTop:3}}>✓ Payment Confirmed · ARC Testnet</div>
          </div>
          <div style={c.rcpDiv}/>
          {[["Receipt ID",receipt?.id?.slice(0,22)+"…"],["Date",receipt?.date],["Patient",receipt?.patient],["File Number",receipt?.fileNo],["Hospital",receipt?.hospital],["Category",receipt?.category],["Service",receipt?.item],["Note",receipt?.note||"—"],["Amount (NGN)",fmt(receipt?.amount)],["Amount (USDC)",receipt?.usdc+" USDC"],["Network","ARC-TESTNET"],["Settlement","< 1 second (Circle MPC)"]].map(([k,v])=>v&&(
            <div key={k} style={c.rcpRow}><span style={c.rcpK}>{k}</span><span style={c.rcpV}>{v}</span></div>
          ))}
          <div style={c.rcpDiv}/>
          <div style={{fontSize:28,fontWeight:800,color:"#1a9e5f",textAlign:"center"}}>{fmt(receipt?.amount)}</div>
          <div style={{fontSize:12,color:"#484f58",textAlign:"center",marginTop:4}}>{receipt?.usdc} USDC · Circle ARC Testnet</div>
          <div style={{fontSize:8,color:"#21262d",textAlign:"center",margin:"12px 0 4px",letterSpacing:1}}>|||||||||||||||||||||||||||||||||||||||||||||||||||||</div>
          <p style={{fontSize:10,color:"#484f58",textAlign:"center",wordBreak:"break-all"}}>Tx: {receipt?.id}</p>
        </div>
        {/* Action buttons */}
        <div style={{display:"flex",gap:10,maxWidth:520,margin:"0 auto",flexWrap:"wrap"}}>
          <button style={c.ghost} onClick={()=>openShareReceipt(receipt)}>⬆ Share Receipt</button>
          <GBtn style={{flex:1,margin:0}} onClick={()=>{setPaycat("");setPayitem("");setPaynote("");setPayprice(0);setTab("pay");setScreen("dashboard");}}>New Payment →</GBtn>
        </div>
      </div>

      {/* ── Share Receipt Modal ── */}
      {showShareModal&&shareReceipt&&(
        <Modal onClose={()=>setShowShareModal(false)}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:10}}>Share Receipt</div>
          <div style={{background:"#0d1117",border:"0.5px solid #30363d",borderRadius:10,padding:12,fontFamily:"monospace",fontSize:11,lineHeight:1.8,color:"#8b949e",marginBottom:14,maxHeight:220,overflowY:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
            {buildReceiptText(shareReceipt)}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button style={{...c.btnGreen,margin:0}} onClick={()=>copyReceiptText(shareReceipt)}>
              {rcpCopied?"✓ Copied!":"📋 Copy Receipt Text"}
            </button>
            <button style={{...c.btnGreen,margin:0,background:"linear-gradient(135deg,#1565c0,#0d47a1)"}} onClick={()=>nativeShare(shareReceipt)}>
              📤 Share via WhatsApp / SMS
            </button>
            <button style={c.ghost} onClick={()=>setShowShareModal(false)}>Close</button>
          </div>
        </Modal>
      )}
    </AppShell>
  );

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  if (screen==="dashboard") return (
    <AppShell showNav>

      {/* ── HOME ── */}
      {tab==="home"&&(
        <div style={c.pg}>
          <div style={c.statsRow}>
            {STATS.map(st=>(
              <div key={st.label} style={c.statBox}>
                <div style={c.statV}>{st.val}</div>
                <div style={c.statL}>{st.label}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            <button style={c.qaCard} onClick={()=>switchTab("pay")}><span style={{fontSize:28}}>💳</span><span style={{fontSize:14,fontWeight:700}}>Make Payment</span><span style={{fontSize:12,color:"#8b949e"}}>Tests, drugs, surgery</span></button>
            <button style={c.qaCard} onClick={()=>switchTab("history")}><span style={{fontSize:28}}>📋</span><span style={{fontSize:14,fontWeight:700}}>History</span><span style={{fontSize:12,color:"#8b949e"}}>{history.length} transactions</span></button>
          </div>
          <SecLbl t="Your Linked Hospitals"/>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {linked.map(h=>(
              <div key={h.id} style={{...c.card,display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>
                <div style={c.hospIcon}>{h.id.slice(0,4)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700}}>{h.id}</div>
                  <div style={{fontSize:11,color:"#8b949e",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.full}</div>
                </div>
                <span style={{fontSize:11,color:"#1a9e5f",flexShrink:0}}>✓ Active</span>
              </div>
            ))}
          </div>
          <SecLbl t="MediPay Updates"/>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            {NEWS.map((n,i)=>(
              <div key={i} style={c.card}>
                <span style={c.newsTag}>{n.tag}</span>
                <div style={{fontSize:14,fontWeight:700,margin:"6px 0 4px",lineHeight:1.4}}>{n.title}</div>
                <div style={{fontSize:12,color:"#8b949e",lineHeight:1.6}}>{n.body}</div>
              </div>
            ))}
          </div>
          <SecLbl t="Health Tips"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:20}}>
            {HEALTH_TIPS.map((t,i)=>(
              <div key={i} style={c.card}>
                <div style={{fontSize:28,marginBottom:7}}>{t.icon}</div>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{t.title}</div>
                <div style={{fontSize:12,color:"#8b949e",lineHeight:1.6}}>{t.body}</div>
              </div>
            ))}
          </div>
          <SecLbl t="About MediPay"/>
          <div style={{...c.card,marginBottom:24,padding:"20px"}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:10}}>What is MediPay?</div>
            <p style={{fontSize:13,color:"#8b949e",lineHeight:1.8,marginBottom:10}}>Nigeria's first blockchain-powered medical payment platform. Register once, pay anywhere — tests, surgery, medication, therapy — without cash, without queues, without paperwork.</p>
            <p style={{fontSize:13,color:"#8b949e",lineHeight:1.8,marginBottom:14}}>Powered by <b style={{color:"#1a9e5f"}}>Circle Programmable Wallets</b> and <b style={{color:"#1a9e5f"}}>Circle Nanopayments on ARC Testnet</b>, every payment settles in under one second.</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {["Circle Programmable Wallet","Nanopayments","ARC Testnet","x402","USDC","Auto Faucet"].map(t=>(
                <span key={t} style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:"#1a9e5f15",border:"0.5px solid #1a9e5f44",color:"#1a9e5f"}}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PAY ── */}
      {tab==="pay"&&(
        <div style={c.pg}>
          <p style={c.sub}>Select a service to pay for at {hospital?.id}.</p>
          {usdcBal!==null&&usdcBal!=="—"&&(
            <div style={c.balCard}>
              <span style={{fontSize:12,color:"#8b949e"}}>Available Balance</span>
              <span style={{fontSize:18,fontWeight:800,color:"#1a9e5f"}}>{usdcBal} USDC</span>
              <button style={c.refreshBtn} onClick={()=>refreshBalance()}>↻ Refresh</button>
            </div>
          )}
          <Lbl t="Payment category"/>
          <div style={{position:"relative",marginBottom:12}}>
            <button style={c.dropBtn} onClick={()=>{setShowCat(!showCat);setShowItem(false);}}>
              {paycat?<>{CATS[paycat].icon} {paycat}</>:"Select category…"}<span style={{marginLeft:"auto"}}>▾</span>
            </button>
            {showCat&&(
              <div style={c.dropMenu}>
                {Object.keys(CATS).map(cat=>(
                  <button key={cat} style={c.dropItem} onClick={()=>{setPaycat(cat);setPayitem("");setPayprice(0);setShowCat(false);}}>
                    {CATS[cat].icon} {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          {paycat&&(
            <>
              <Lbl t={`Select ${paycat} type`}/>
              <div style={{position:"relative",marginBottom:12}}>
                <button style={c.dropBtn} onClick={()=>{setShowItem(!showItem);setShowCat(false);}}>
                  {payitem||`Choose ${paycat}…`}<span style={{marginLeft:"auto"}}>▾</span>
                </button>
                {showItem&&(
                  <div style={c.dropMenu}>
                    {CATS[paycat].items.map((it,i)=>(
                      <button key={it} style={c.dropItem} onClick={()=>{setPayitem(it);setPayprice(CATS[paycat].prices[i]);setShowItem(false);}}>
                        <span style={{flex:1}}>{it}</span>
                        <span style={{color:"#1a9e5f",fontWeight:700,flexShrink:0}}>{fmt(CATS[paycat].prices[i])}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {payitem&&(
            <div style={c.priceCard}>
              <div style={{fontSize:12,color:"#8b949e",marginBottom:4}}>Total to pay</div>
              <div style={{fontSize:32,fontWeight:800,color:"#1a9e5f"}}>{fmt(payprice)}</div>
              <div style={{fontSize:12,color:"#484f58",marginTop:4}}>≈ {(payprice/NGN_USDC).toFixed(4)} USDC · ARC Testnet</div>
            </div>
          )}
          <Lbl t="Note (optional)"/>
          <input style={c.inp} placeholder="e.g. Prescribed by Dr. Musa Aliyu" value={paynote} onChange={e=>setPaynote(e.target.value)}/>
          {loading&&<Step s={step}/>}

          {/* Pay + Generate Link buttons */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <GBtn disabled={!payitem||loading} onClick={handlePay} style={{flex:2,minWidth:160,...(!payitem||loading?{opacity:.5,cursor:"not-allowed"}:{})}}>
              {loading?"Processing on ARC…":`Pay ${payitem?fmt(payprice):""} →`}
            </GBtn>
            <button style={{...c.ghost,flex:1,minWidth:140,flexDirection:"column",gap:2,padding:"12px"}} disabled={!payitem} onClick={generatePayLink}>
              <span>🔗 Generate</span>
              <span style={{fontSize:11}}>Payment Link</span>
            </button>
          </div>
          <p style={{fontSize:11,color:"#484f58",marginTop:8,textAlign:"center",lineHeight:1.5}}>
            Use "Generate Payment Link" to send a payment request to a family member or anyone who will pay the bill on your behalf.
          </p>
        </div>
      )}

      {/* ── HISTORY ── */}
      {tab==="history"&&(
        <div style={c.pg}>
          {history.length===0
            ?<div style={c.empty}>No payments yet.<br/>Make your first payment from the Pay tab.</div>
            :history.map(r=>(
              <div key={r.id} style={{...c.card,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700}}>{CATS[r.category]?.icon} {r.category}</div>
                    <div style={{fontSize:12,color:"#8b949e",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.item}</div>
                    <div style={{fontSize:11,color:"#484f58",marginTop:4}}>{r.date}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:15,fontWeight:700,color:"#1a9e5f"}}>{fmt(r.amount)}</div>
                    <div style={{fontSize:11,color:"#484f58"}}>{r.usdc} USDC</div>
                    <div style={{fontSize:10,color:"#1a9e5f",marginTop:3}}>✓ Confirmed</div>
                    <button style={{fontSize:11,color:"#8b949e",background:"none",border:"none",cursor:"pointer",marginTop:4,padding:0,textDecoration:"underline"}} onClick={()=>openShareReceipt(r)}>Share ⬆</button>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ── PROFILE ── */}
      {tab==="profile"&&(
        <div style={c.pg}>
          <div style={{...c.card,textAlign:"center",marginBottom:14,padding:"20px"}}>
            <div style={c.avatar}>{(user?.name||"P")[0]}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:10}}>{user?.name}</div>
            <div style={{fontSize:12,color:"#1a9e5f",marginTop:4,fontFamily:"monospace"}}>{fileNo}</div>
          </div>
          {/* Circle Wallet Card */}
          <div style={c.walletCard}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontSize:11,color:"#484f58",textTransform:"uppercase",letterSpacing:".06em",marginBottom:2}}>Circle Programmable Wallet</div>
                <div style={{fontSize:11,color:"#8b949e"}}>ARC Testnet · EOA Account</div>
              </div>
              <div style={c.circleC}>C</div>
            </div>
            <div style={{fontSize:12,fontFamily:"monospace",color:"#1a9e5f",wordBreak:"break-all",marginBottom:12}}>{walletAddr}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:11,color:"#484f58",marginBottom:2}}>USDC Balance</div>
                <div style={{fontSize:24,fontWeight:800,color:"#1a9e5f"}}>{balLoading?"…":usdcBal!==null?usdcBal:"—"}<span style={{fontSize:12,color:"#484f58",marginLeft:5}}>USDC</span></div>
              </div>
              <button style={c.refreshBtn} onClick={()=>refreshBalance()}>↻ Refresh</button>
            </div>
            {faucetSent&&<div style={{marginTop:10,fontSize:11,color:"#1a9e5f",background:"#1a9e5f12",borderRadius:8,padding:"7px 10px"}}>🎉 10 USDC auto-sent from Circle faucet on registration</div>}
            <div style={{marginTop:8,fontSize:10,color:"#484f58"}}>Wallet ID: {walletId||"—"}</div>
          </div>
          {/* Details */}
          {[["Home Hospital",hospital?.id+" · "+hospital?.state],["Email",user?.email||form.email||"—"],["Phone",user?.phone||form.phone||"—"],["Date of Birth",user?.dob||form.dob||"—"],["Blood Group",user?.bloodGroup||form.bloodGroup||"—"],["Genotype",user?.genotype||form.genotype||"—"],["State",user?.state||form.state||"—"],["Network","ARC-TESTNET (Circle)"]].map(([k,v])=>v&&(
            <div key={k} style={c.profRow}><span style={c.profK}>{k}</span><span style={c.profV}>{v}</span></div>
          ))}
          {/* Transfer */}
          <div style={{marginTop:22}}>
            <SecLbl t="Hospital Access"/>
            <p style={{fontSize:13,color:"#8b949e",lineHeight:1.6,marginBottom:12}}>Moved to a new state? Link your records to another hospital. Your file number, history, and Circle wallet remain unchanged.</p>
            <button style={{...c.card,width:"100%",textAlign:"left",cursor:"pointer",border:"0.5px solid #1a9e5f33",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#161b22",boxSizing:"border-box"}}
              onClick={()=>{setShowTrf(true);setTrfDone(false);setTrfTarget("");}}>
              <div><div style={{fontSize:14,fontWeight:700}}>🔗 Link to Another Hospital</div><div style={{fontSize:12,color:"#8b949e",marginTop:2}}>Linked to {linked.length} hospital{linked.length!==1?"s":""}</div></div>
              <span style={{color:"#1a9e5f",fontSize:20}}>›</span>
            </button>
          </div>
          <button style={{...c.btnGreen,marginTop:22,background:"transparent",border:"1.5px solid #e25555",color:"#e25555"}}
            onClick={()=>{setUser(null);setForm({name:"",dob:"",gender:"",phone:"",email:"",address:"",state:"",bloodGroup:"",genotype:""});setFileNo("");setWalletId("");setWalletAddr("");setUsdcBal(null);setFaucetSent(false);setHistory([]);setLinked([]);setScreen("landing");}}>
            Sign Out
          </button>
        </div>
      )}

      {/* ── Transfer Modal ── */}
      {showTrf&&(
        <Modal onClose={()=>setShowTrf(false)}>
          {!trfDone?(
            <>
              <div style={{fontSize:16,fontWeight:700,marginBottom:10}}>Link Records to New Hospital</div>
              <p style={{fontSize:13,color:"#8b949e",lineHeight:1.6,marginBottom:12}}>Your file <b style={{color:"#1a9e5f"}}>{fileNo}</b> and payment history will be accessible at the new hospital. Your Circle wallet stays the same.</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                {linked.map(h=><span key={h.id} style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:"#1a9e5f22",border:"0.5px solid #1a9e5f44",color:"#1a9e5f"}}>✓ {h.id}</span>)}
              </div>
              <Lbl t="Select hospital to link"/>
              <div style={{position:"relative",marginBottom:16}}>
                <button style={c.dropBtn} onClick={()=>setTrfDrop(!trfDrop)}>
                  {trfTarget?HOSPITALS.find(h=>h.id===trfTarget)?.full:"Choose hospital…"}<span style={{marginLeft:"auto"}}>▾</span>
                </button>
                {trfDrop&&(
                  <div style={c.dropMenu}>
                    {availTrf.length===0
                      ?<div style={{padding:14,fontSize:13,color:"#484f58",textAlign:"center"}}>All hospitals already linked</div>
                      :availTrf.map(h=>(
                        <button key={h.id} style={c.dropItem} onClick={()=>{setTrfTarget(h.id);setTrfDrop(false);}}>
                          <b style={{color:"#1a9e5f",minWidth:56}}>{h.id}</b>
                          <span style={{flex:1,fontSize:12}}>{h.full}</span>
                          <span style={{fontSize:11,color:"#484f58",flexShrink:0}}>{h.state}</span>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
              {loading&&<Step s="Linking records on ARC Testnet…"/>}
              <div style={{display:"flex",gap:10}}>
                <button style={c.ghost} onClick={()=>setShowTrf(false)}>Cancel</button>
                <GBtn disabled={!trfTarget||loading} style={{flex:1,margin:0}} onClick={handleTransfer}>{loading?"Linking…":"Link Records →"}</GBtn>
              </div>
            </>
          ):(
            <div style={{textAlign:"center",padding:"8px 0"}}>
              <div style={{fontSize:44,marginBottom:12}}>✅</div>
              <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Records Linked!</div>
              <p style={{fontSize:13,color:"#8b949e",lineHeight:1.6,marginBottom:20}}>Your records are now accessible at <b style={{color:"#1a9e5f"}}>{HOSPITALS.find(h=>h.id===trfTarget)?.id}</b>.<br/>Walk in and quote your file number <b style={{color:"#1a9e5f"}}>{fileNo}</b>.</p>
              <GBtn onClick={()=>setShowTrf(false)}>Done ✓</GBtn>
            </div>
          )}
        </Modal>
      )}

      {/* ── Payment Link Modal ── */}
      {showPayLink&&(
        <Modal onClose={()=>setShowPayLink(false)}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>🔗 Payment Link</div>
          <p style={{fontSize:13,color:"#8b949e",lineHeight:1.6,marginBottom:14}}>Share this link with a family member or anyone who will pay the bill on your behalf. They can open it and complete the payment using their own Circle wallet.</p>
          {/* Summary */}
          <div style={{background:"#0d1117",border:"0.5px solid #1a9e5f44",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:12,color:"#8b949e",marginBottom:6}}>Payment details</div>
            <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{payitem}</div>
            <div style={{fontSize:12,color:"#8b949e",marginBottom:2}}>Hospital: {hospital?.id}</div>
            <div style={{fontSize:12,color:"#8b949e",marginBottom:2}}>File No: {fileNo}</div>
            <div style={{fontSize:18,fontWeight:800,color:"#1a9e5f",marginTop:6}}>{fmt(payprice)}</div>
          </div>
          {/* Link box */}
          <div style={{background:"#0d1117",border:"0.5px solid #30363d",borderRadius:10,padding:"10px 12px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,fontFamily:"monospace",color:"#8b949e",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{payLink}</span>
            <button style={{...c.refreshBtn,flexShrink:0,padding:"6px 12px"}} onClick={copyPayLink}>
              {payLinkCopied?"✓ Copied":"📋 Copy"}
            </button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button style={{...c.btnGreen,margin:0,background:"linear-gradient(135deg,#1a7c2e,#145a21)"}} onClick={sharePayLink}>
              💬 Share via WhatsApp / SMS
            </button>
            <button style={c.ghost} onClick={()=>setShowPayLink(false)}>Close</button>
          </div>
          <p style={{fontSize:10,color:"#484f58",marginTop:10,textAlign:"center",lineHeight:1.5}}>This link encodes the payment details. The payer will need their own MediPay account to complete payment.</p>
        </Modal>
      )}

      {/* ── Share Receipt Modal (from history) ── */}
      {showShareModal&&shareReceipt&&(
        <Modal onClose={()=>setShowShareModal(false)}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:10}}>Share Receipt</div>
          <div style={{background:"#0d1117",border:"0.5px solid #30363d",borderRadius:10,padding:12,fontFamily:"monospace",fontSize:11,lineHeight:1.8,color:"#8b949e",marginBottom:14,maxHeight:220,overflowY:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
            {buildReceiptText(shareReceipt)}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button style={{...c.btnGreen,margin:0}} onClick={()=>copyReceiptText(shareReceipt)}>
              {rcpCopied?"✓ Copied to clipboard!":"📋 Copy Receipt Text"}
            </button>
            <button style={{...c.btnGreen,margin:0,background:"linear-gradient(135deg,#1a7c2e,#145a21)"}} onClick={()=>nativeShare(shareReceipt)}>
              📤 Share via WhatsApp / SMS
            </button>
            <button style={c.ghost} onClick={()=>setShowShareModal(false)}>Close</button>
          </div>
        </Modal>
      )}

    </AppShell>
  );

  return null;
}

// ─── Small components ─────────────────────────────────────────────────────────
const PageBar = ({title,onBack}) => (
  <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 20px",borderBottom:"0.5px solid #21262d",position:"sticky",top:0,background:"#0d1117",zIndex:20}}>
    <button style={{background:"none",border:"none",color:"#8b949e",fontSize:20,cursor:"pointer",padding:"2px 8px"}} onClick={onBack}>←</button>
    <span style={{flex:1,fontSize:15,fontWeight:700}}>{title}</span>
  </div>
);
const GBtn = ({children,onClick,disabled,style={}}) => (
  <button style={{background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",color:"#fff",border:"none",borderRadius:12,padding:"14px 20px",fontSize:14,fontWeight:700,cursor:disabled?"not-allowed":"pointer",width:"100%",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:disabled?.6:1,...style}} disabled={disabled} onClick={onClick}>{children}</button>
);
const Lbl = ({t}) => <div style={{fontSize:12,color:"#8b949e",fontWeight:600,marginBottom:5,marginTop:4}}>{t}</div>;
const SecLbl = ({t}) => <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",color:"#484f58",marginBottom:10}}>{t}</div>;
const Step = ({s}) => s?<div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#1a9e5f",padding:"8px 0",lineHeight:1.5}}><span style={{animation:"spin .8s linear infinite",display:"inline-block"}}>⟳</span>{s}</div>:null;
const Modal = ({children,onClose}) => (
  <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:"#161b22",borderRadius:"20px 20px 0 0",padding:"24px 20px 44px",width:"100%",maxWidth:520,maxHeight:"88vh",overflowY:"auto"}}>
      {children}
    </div>
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const c = {
  shell:     {minHeight:"100vh",background:"#0d1117",color:"#e6edf3",fontFamily:"'DM Sans',system-ui,sans-serif"},
  topbar:    {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",borderBottom:"0.5px solid #21262d",position:"sticky",top:0,background:"#0d1117",zIndex:30,gap:12},
  tbLeft:    {display:"flex",alignItems:"center",gap:10},
  tbRight:   {display:"flex",alignItems:"center",gap:8},
  hamburger: {background:"none",border:"none",color:"#e6edf3",fontSize:20,cursor:"pointer",padding:"4px 8px",lineHeight:1},
  mk:        {width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",flexShrink:0},
  mkTxt:     {fontSize:20,fontWeight:800,letterSpacing:"-0.5px"},
  demoBadge: {fontSize:10,padding:"2px 8px",borderRadius:100,background:"#2d2200",border:"0.5px solid #5a4200",color:"#f0b429"},
  topNavBtn: {background:"none",border:"none",color:"#8b949e",fontSize:13,fontWeight:500,cursor:"pointer",padding:"7px 12px",borderRadius:8,display:"flex",alignItems:"center",gap:6},
  topNavBtnOn:{background:"#1a9e5f18",color:"#1a9e5f",fontWeight:700},
  walPill:   {display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1,background:"#161b22",padding:"7px 12px",borderRadius:10,border:"0.5px solid #21262d",flexShrink:0},
  drawer:    {position:"fixed",top:62,left:0,right:0,background:"#161b22",zIndex:25,borderBottom:"0.5px solid #21262d",boxShadow:"0 8px 32px #000a"},
  drawerItem:{width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 20px",background:"none",border:"none",borderBottom:"0.5px solid #21262d",color:"#8b949e",cursor:"pointer",textAlign:"left",fontFamily:"inherit"},
  drawerItemOn:{color:"#1a9e5f",background:"#1a9e5f0a"},
  content:   {display:"flex",minHeight:"calc(100vh - 62px)"},
  sidebar:   {width:220,background:"#161b22",borderRight:"0.5px solid #21262d",position:"fixed",top:62,bottom:0,left:0,display:"flex",flexDirection:"column",justifyContent:"space-between",overflowY:"auto",zIndex:20},
  sideItem:  {width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"none",border:"none",color:"#8b949e",cursor:"pointer",borderRadius:9,textAlign:"left",fontFamily:"inherit",fontSize:14},
  sideItemOn:{background:"#1a9e5f18",color:"#1a9e5f"},
  sideBottom:{padding:"16px 12px",borderTop:"0.5px solid #21262d"},
  main:      {flex:1,minWidth:0},
  pg:        {padding:"16px 20px 80px",maxWidth:800,margin:"0 auto"},
  landCenter:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"calc(100vh - 62px)",padding:"40px 24px",textAlign:"center",position:"relative",maxWidth:500,margin:"0 auto"},
  glow:      {position:"absolute",top:"20%",left:"50%",transform:"translateX(-50%)",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,#1a9e5f18,transparent 70%)",pointerEvents:"none"},
  landH1:    {fontSize:"clamp(28px,5vw,42px)",fontWeight:800,lineHeight:1.15,marginBottom:14,letterSpacing:"-1px"},
  landSub:   {fontSize:15,color:"#8b949e",lineHeight:1.7,marginBottom:28,maxWidth:340},
  chips:     {display:"flex",gap:7,flexWrap:"wrap",justifyContent:"center",marginBottom:10},
  chip:      {fontSize:11,padding:"4px 10px",borderRadius:100,background:"#161b22",border:"0.5px solid #30363d",color:"#8b949e"},
  demoBanner:{marginTop:14,fontSize:11,padding:"6px 14px",borderRadius:100,background:"#2d2200",border:"0.5px solid #5a4200",color:"#f0b429"},
  sub:       {fontSize:13,color:"#8b949e",lineHeight:1.6,margin:"8px 0 14px"},
  hint:      {fontSize:12,color:"#8b949e",lineHeight:1.6,marginBottom:14},
  inp:       {width:"100%",background:"#161b22",border:"0.5px solid #30363d",borderRadius:10,padding:"12px 14px",fontSize:14,color:"#e6edf3",marginBottom:12,outline:"none",fontFamily:"inherit",boxSizing:"border-box"},
  socialBtn: {width:"100%",background:"#161b22",border:"0.5px solid #30363d",borderRadius:10,padding:"13px",fontSize:14,color:"#e6edf3",cursor:"pointer",fontFamily:"inherit",textAlign:"center"},
  hGrid:     {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,paddingBottom:20},
  hCard:     {background:"#161b22",border:"0.5px solid #21262d",borderRadius:12,padding:"14px 12px",cursor:"pointer",textAlign:"left"},
  hId:       {fontSize:17,fontWeight:800,color:"#1a9e5f",marginBottom:4},
  hFull:     {fontSize:11,color:"#8b949e",lineHeight:1.4,marginBottom:4},
  hState:    {fontSize:11,color:"#484f58"},
  hospBanner:{background:"linear-gradient(135deg,#0d2b1a,#0d1117)",border:"0.5px solid #1a9e5f33",borderRadius:12,padding:"14px 16px",margin:"10px 0 14px",display:"flex",flexDirection:"column",gap:4},
  aTabs:     {display:"flex",gap:5,marginBottom:16,background:"#161b22",borderRadius:10,padding:4},
  aTab:      {flex:1,padding:"9px 6px",fontSize:12,fontWeight:600,border:"none",borderRadius:8,background:"none",color:"#8b949e",cursor:"pointer"},
  aTabOn:    {background:"#1a9e5f",color:"#fff"},
  walletBox: {background:"#0d1117",border:"0.5px solid #1a9e5f44",borderRadius:10,padding:"12px 14px"},
  card:      {background:"#161b22",border:"0.5px solid #21262d",borderRadius:12,padding:"14px"},
  statsRow:  {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16},
  statBox:   {background:"#161b22",border:"0.5px solid #21262d",borderRadius:10,padding:"10px 6px",textAlign:"center"},
  statV:     {fontSize:18,fontWeight:800,color:"#1a9e5f"},
  statL:     {fontSize:10,color:"#8b949e",marginTop:2},
  qaCard:    {background:"#161b22",border:"0.5px solid #21262d",borderRadius:12,padding:"16px 14px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:5,textAlign:"left"},
  hospIcon:  {width:38,height:38,borderRadius:9,background:"#1a9e5f15",border:"0.5px solid #1a9e5f44",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#1a9e5f",fontSize:11,flexShrink:0},
  newsTag:   {fontSize:10,padding:"2px 8px",borderRadius:100,background:"#1a9e5f22",color:"#1a9e5f",border:"0.5px solid #1a9e5f44",fontWeight:600},
  balCard:   {display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0d2b1a",border:"0.5px solid #1a  balCard:   {display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0d2b1a",border:"0.5px solid #1a9e5f44",borderRadius:10,padding:"10px 14px",marginBottom:14,gap:10,flexWrap:"wrap"},
  dropBtn:   {width:"100%",background:"#161b22",border:"0.5px solid #30363d",borderRadius:10,padding:"12px 14px",fontSize:14,color:"#e6edf3",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",fontFamily:"inherit"},
  dropMenu:  {position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#161b22",border:"0.5px solid #30363d",borderRadius:10,zIndex:200,maxHeight:260,overflowY:"auto",boxShadow:"0 8px 32px #000b"},
  dropItem:  {width:"100%",padding:"11px 14px",background:"none",border:"none",borderBottom:"0.5px solid #21262d",color:"#e6edf3",cursor:"pointer",textAlign:"left",fontSize:13,fontFamily:"inherit",display:"flex",alignItems:"center",gap:8},
  priceCard: {background:"linear-gradient(135deg,#0d2b1a,#0d1117)",border:"0.5px solid #1a9e5f44",borderRadius:12,padding:"16px",marginBottom:14,textAlign:"center"},
  walletCard:{background:"#0d1a14",border:"1px solid #1a9e5f44",borderRadius:14,padding:"16px",marginBottom:14},
  circleC:   {width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff",fontSize:14},
  refreshBtn:{background:"#1a9e5f15",border:"0.5px solid #1a9e5f44",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#1a9e5f",cursor:"pointer",fontFamily:"inherit"},
  avatar:    {width:60,height:60,borderRadius:"50%",background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:800,color:"#fff",margin:"0 auto"},
  profRow:   {display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"11px 0",borderBottom:"0.5px solid #21262d",gap:10},
  profK:     {fontSize:13,color:"#8b949e",flexShrink:0},
  profV:     {fontSize:13,color:"#e6edf3",fontWeight:500,textAlign:"right",wordBreak:"break-word"},
  empty:     {textAlign:"center",color:"#484f58",fontSize:14,padding:"48px 0",lineHeight:1.8},
  rcpDiv:    {borderTop:"1px dashed #30363d",margin:"12px 0"},
  rcpRow:    {display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"6px 0",borderBottom:"0.5px solid #21262d22",gap:8},
  rcpK:      {fontSize:12,color:"#8b949e",flexShrink:0},
  rcpV:      {fontSize:12,color:"#e6edf3",fontWeight:500,textAlign:"right",wordBreak:"break-word"},
  btnGreen:  {background:"linear-gradient(135deg,#1a9e5f,#0d7a47)",color:"#fff",border:"none",borderRadius:12,padding:"13px 20px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%",marginBottom:0,display:"flex",alignItems:"center",justifyContent:"center",gap:8},
  ghost:     {background:"transparent",color:"#8b949e",border:"1.5px solid #30363d",borderRadius:12,padding:"13px 16px",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flex:1},
  toast:     {position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1a9e5f",color:"#fff",padding:"10px 22px",borderRadius:100,fontSize:13,fontWeight:600,zIndex:600,whiteSpace:"nowrap",boxShadow:"0 4px 20px #0006"},
};
