# MediPay 🏥

> Medical bill payments across Nigeria — powered by **Circle Programmable Wallets** and **USDC on ARC Testnet**

---

## What is MediPay?

MediPay is Nigeria's first blockchain-powered medical payment platform. Patients register **once** at any partner hospital, receive a Circle Programmable Wallet and a unique file number, and can then make payments for tests, surgery, medication, therapy, and more — across **12 major Nigerian hospitals** — without cash, without bank queues, and without re-registering.

Built on **Circle's ARC Testnet** using Circle Agent Stack, Nanopayments, and the x402 protocol.

---

## Features

- 🏥 **12 Nigerian hospitals** — UDUTH, LUTH, UCH, ABUTH, UNTH, OAUTH, UATH, BMSH, GESTH, NKST, FMCB, FMCA
- 🔒 **Circle Programmable Wallet** — created automatically on signup, no crypto knowledge needed
- 💸 **Auto USDC faucet** — 10 testnet USDC sent to every new wallet on registration
- 💳 **8 payment categories** — Surgery, Investigations, Radiology, Medication, Therapy, Pharmacy, Rehabilitation, Procedures
- 🔗 **Payment link generator** — share a payment request with family to pay on your behalf
- ⬆ **Shareable receipt** — copy or share via WhatsApp/SMS after every payment
- 🗺️ **Cross-hospital records transfer** — move from Sokoto to Lagos and link your records to LUTH without re-registering
- ⚡ **ARC Testnet settlement** — every payment settles in under 1 second via Circle MPC
- 📱 **Responsive** — works on desktop (sidebar nav) and mobile (hamburger menu)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 |
| Wallet | Circle Programmable Wallets (Developer-Controlled, EOA) |
| Blockchain | ARC-TESTNET |
| Token | USDC (native gas on ARC) |
| Payments | Circle Nanopayments + x402 protocol |
| Faucet | Circle Testnet Faucet (`/v1/faucet/drips`) |

---

## Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/medipay.git
cd medipay
```

### 2. Install dependencies
```bash
npm install
```

### 3. Add your Circle API key
```bash
cp .env .env.local
```
Open `.env.local` and replace the placeholders:
```
REACT_APP_CIRCLE_API_KEY=TEST_API_KEY:your_actual_key_here
REACT_APP_ENTITY_SECRET=0x_your_entity_secret_here
```

Get these from **[console.circle.com](https://console.circle.com)**:
- API Key → Settings → API Keys → Create API Key (Testnet)
- Entity Secret → Settings → Entity Secret → Generate

### 4. Go live (disable demo mode)
In `src/medipay.jsx` line 4, change:
```js
const DEMO_MODE = true;
// to:
const DEMO_MODE = false;
```

### 5. Run
```bash
npm start
```

App runs at `http://localhost:3000`

---

## Running in GitHub Codespaces

1. Push this repo to GitHub
2. Click **Code → Codespaces → Create codespace on main**
3. In the Codespaces terminal: `npm install && npm start`
4. Click **Open in Browser** when port 3000 becomes available
5. Add your `.env` values in the Codespaces **Secrets** settings for security

---

## Circle API Endpoints Used

| Feature | Endpoint |
|---|---|
| Create patient wallet | `POST /v1/w3s/developer/wallets` |
| Auto faucet drip | `POST /v1/faucet/drips` |
| Check USDC balance | `GET /v1/w3s/wallets/{id}/balances` |
| Send USDC payment | `POST /v1/w3s/developer/transactions/transfer` |

---

## Project Structure

```
medipay/
├── public/
│   └── index.html          # HTML shell with DM Sans font
├── src/
│   ├── medipay.jsx         # Main app — all components + Circle API
│   └── index.js            # React entry point
├── .env                    # API key placeholders (DO NOT commit real keys)
├── .gitignore
├── package.json
└── README.md
```

---

## Submission

This project was built for the **Circle ARC Testnet** agent submission.  
All transactions are traceable on ARC Testnet under the developer account linked to the API key.

**Powered by:** Circle Agent Stack · Programmable Wallets · Nanopayments · ARC Testnet · x402

---

*Built by Esther — Department of Nursing Sciences, UDUTH Sokoto*
