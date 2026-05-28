# MediPay v2 🏥

> Medical bill payments across Nigeria — powered by **Circle Programmable Wallets** and **USDC on ARC Testnet**

## Quick Start (GitHub Codespaces)

```bash
npm install
npm start
```
Open port 3000 when prompted.

## Go Live with Circle API

1. Get your API key from [console.circle.com](https://console.circle.com) → Settings → API Keys
2. Open `.env` and paste your key
3. In `src/medipay.jsx` line 4, change `DEMO_MODE = true` to `DEMO_MODE = false`
4. Restart with `npm start`

## Features
- Circle Programmable Wallet auto-created on signup
- 10 USDC auto-sent from Circle faucet on registration
- 8 payment categories: Surgery, Investigations, Radiology, Medication, Therapy, Pharmacy, Rehabilitation, Procedures
- Payment link generation — share with family to pay on your behalf
- Pending/Confirmed payment tracking in History
- Receipt download as PNG image
- Cross-hospital record transfer (Profile tab)
- Global expansion coming soon (Ghana, Kenya, South Africa, UK)
- Responsive: desktop sidebar + mobile hamburger menu

## Circle APIs Used
| Feature | Endpoint |
|---|---|
| Create wallet | POST /v1/w3s/developer/wallets |
| Auto faucet | POST /v1/faucet/drips |
| Check balance | GET /v1/w3s/wallets/{id}/balances |
| Send payment | POST /v1/w3s/developer/transactions/transfer |

**Built for Circle ARC Testnet submission**
Powered by Circle Agent Stack · Programmable Wallets · Nanopayments · ARC Testnet · x402
