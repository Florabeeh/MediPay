# MediPay

Borderless medical bill payments, powered by Circle USDC on ARC Testnet.

MediPay is a healthcare payment platform that allows patients to register once at any partnered hospital, receive a Circle Programmable Wallet instantly, and pay for medical services from anywhere in the world. No cash. No queues. No paperwork. One wallet, one file number, forever.

Built for Nigeria first — designed for the world.

---

## The Problem

Healthcare payment across emerging markets is fragmented, slow, and disconnected. Patients lose records when they change hospitals or move cities. Families cannot easily send money for medical emergencies across state lines or international borders. Hospital cashier systems are cash-dependent, isolated, and unable to communicate with each other.

The result is delayed treatment, lost documentation, and financial barriers at the worst possible moments. MediPay is built to solve this from first principles using programmable blockchain infrastructure.

---

## The Solution

MediPay gives every patient a portable digital identity and payment wallet that works across every partnered hospital. One registration. One file number. One wallet. Accessible from any device, any city, any country.

Payments settle in under one second. No bank involved. No transfer delays. No fees.

---

## How It Works

- A patient visits any MediPay-partnered hospital and signs up using their Google account or email and password
- A Circle Programmable Wallet is automatically created and linked to their profile in seconds
- The patient receives a unique file number that serves as their permanent medical identity across all linked hospitals
- They fund their wallet with testnet USDC, which is auto-sent via the Circle faucet on registration
- They can pay for any medical service using USDC — surgery, medication, radiology, therapy and more
- Every payment settles in under one second on ARC Testnet via Circle Nanopayments
- Their records, wallet balance, and full payment history persist across every device through Firebase

---

## Features

**Authentication and Identity**
- Google sign-in and email/password authentication via Firebase Auth
- Patient profiles stored in Firestore — fully persistent across devices and sessions
- Unique file number generated per patient per hospital at registration
- Returning patients are automatically loaded into their dashboard on login

**Wallet and Payments**
- Circle Programmable Wallet (Smart Contract Account) auto-created on every new signup
- No seed phrase, no private key management — fully MPC-secured by Circle
- Wallet balance auto-loads on login
- Payments execute server-side for reliability — no proxy timeouts
- USDC auto-sent to new wallets via Circle testnet faucet on registration
- Manual faucet link provided on profile page as fallback

**Hospital Network**
- 12 hospitals across Nigeria in the current pilot network
- Cross-hospital record linking — patients can link their file number to hospitals in other states
- Patients can walk into any linked hospital and be identified by their file number alone

**Payment Categories**
- Surgery
- Investigations (lab tests)
- Radiology
- Medication
- Therapy
- Pharmacy
- Rehabilitation
- Procedures

**Receipts and Sharing**
- Downloadable payment receipts as PNG images
- WhatsApp image sharing — share receipt photo directly on mobile via Web Share API
- Shareable payment links — patients generate a link and send it to family members who can pay on their behalf
- Pending payment links tracked in transaction history and marked confirmed once paid

**Developer and Operations**
- Server-side Circle API endpoints — wallet creation, payments, faucet, and ciphertext generation all run server-to-server to avoid browser proxy timeouts
- Diagnostic endpoints for testing Circle API connectivity and faucet access
- Full API request logging in terminal for debugging

---

## Tech Stack

- Frontend — React 18
- Authentication — Firebase Auth (Google and Email/Password)
- Database — Firebase Firestore
- Payments — Circle Programmable Wallets (Developer-Controlled, SCA)
- Blockchain — ARC Testnet
- Currency — USDC
- Cryptography — Node.js RSA-OAEP for entity secret ciphertext generation
- Proxy — http-proxy-middleware (Create React App dev server)

---

## Project Structure

```
MediPay/
├── medipay_v2/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── firebase.js          Firebase initialisation, auth helpers, Firestore helpers
│   │   ├── index.js             React entry point
│   │   ├── medipay.jsx          Main application — all screens, components, and logic
│   │   └── setupProxy.js        Dev server proxy and server-side Circle API endpoints
│   ├── .env                     Environment variables (not committed)
│   ├── .gitignore
│   ├── package.json
│   └── package-lock.json
└── README.md
```

---

## Environment Variables

Create a `.env` file inside `medipay_v2/` with the following:

```
# Circle
REACT_APP_CIRCLE_API_KEY=TEST_API_KEY:your_key_here
REACT_APP_ENTITY_SECRET=your_64_char_hex_here
REACT_APP_DEMO_MODE=false

# Firebase
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

The `.env` file is listed in `.gitignore` and must never be committed to the repository.

---

## Getting Started

**Prerequisites**
- Node.js 18 or higher
- A Circle developer account at console.circle.com
- A Firebase project at console.firebase.google.com

**Clone and install**

```bash
git clone https://github.com/Florabeeh/MediPay.git
cd MediPay/medipay_v2
npm install
```

**Circle setup**
- Create a Standard API Key on Testnet at console.circle.com
- Generate a 32-byte Entity Secret and register it in the Wallets Developer Controlled Configurator
- Copy both values into your `.env` file

**Firebase setup**
- Create a Firebase project and register a web app to get config values
- Enable Authentication with Google and Email/Password providers
- Create a Firestore database in test mode
- Add your development and production domains to the Authorized Domains list under Authentication > Settings > Authorised Domains
- Copy all config values into your `.env` file

**Start the development server**

```bash
npm start
```

The app runs at `http://localhost:3000`.

---

## Server-Side API Endpoints

These endpoints are handled by `setupProxy.js` and run server-to-server to avoid browser security restrictions and proxy timeouts:

- `POST /create-wallet` — creates a new Circle Programmable Wallet for a patient
- `POST /fund-wallet` — calls the Circle testnet faucet to send USDC to a new wallet
- `POST /send-payment` — executes a USDC transfer from a patient wallet to the hospital address
- `GET /get-ciphertext` — generates a fresh RSA-OAEP entity secret ciphertext using Node.js crypto
- `GET /test-circle` — diagnostic endpoint to verify Circle API key and connectivity
- `GET /test-faucet` — diagnostic endpoint to test faucet access for a specific address

---

## Roadmap

### Phase 1 — Foundation (Completed)
- React frontend with full patient registration and payment flow
- Circle Developer-Controlled Wallets with SCA account type
- Server-side wallet creation, payment execution, and ciphertext generation
- 12 Nigerian hospitals onboarded as pilot network
- 8 payment categories with real NGN and USDC pricing
- Cross-hospital record linking
- Shareable payment links for family-assisted payments
- Downloadable and shareable payment receipts

### Phase 2 — Authentication and Persistence (Completed)
- Firebase Auth — Google and email/password login
- Firestore database — patient records persist across all devices
- Returning patients auto-loaded to dashboard on login
- Balance auto-loads on authentication
- WhatsApp receipt image sharing via Web Share API

### Phase 3 — Production Deployment (In Progress)
- Migrate server-side endpoints from setupProxy.js to Vercel serverless functions
- Deploy frontend on Vercel
- Configure production Firebase Authorized Domains
- Set production environment variables in Vercel dashboard
- End-to-end testing on production URL

### Phase 4 — Hospital Network Expansion
- Expand from 12 to 50+ hospitals across all 36 Nigerian states
- Onboard hospitals in Ghana, Kenya, and South Africa
- Hospital admin dashboard for payment reconciliation and patient lookup
- Formal hospital partnership agreements and API integrations
- Real-time hospital capacity and appointment availability

### Phase 5 — Mainnet and Real Payments
- Migrate from ARC Testnet to mainnet
- Real USDC payments with NGN on-ramp integration
- Circle Paymaster integration for gasless transactions
- Multi-currency support — GHS, KES, ZAR alongside NGN
- Compliance and KYC layer for regulated markets

### Phase 6 — Patient Experience
- Mobile application for Android and iOS (React Native)
- Push notifications for payment confirmations and appointment reminders
- Offline payment receipt storage
- NFC tap-to-pay at hospital cashier points
- Patient health record summary linked to payment history

### Phase 7 — International Scale
- UK and Europe hospital network
- Global patient identity — same file number works in any country
- Insurance integration — direct billing to health insurance providers
- Diaspora payment support — family members abroad pay directly in their local currency
- Government and NGO partnership program for subsidised healthcare access

---

## Current Status

The application is in active development and demo stage. Core functionality — patient registration, wallet creation, USDC payments, Firebase authentication, and Firestore persistence — is fully working on ARC Testnet. Production deployment and hospital network expansion are the immediate next milestones.

---

## Contributing

Contributions, feedback, and ideas are welcome. Open an issue or submit a pull request. If you work in healthcare, fintech, or have direct experience with medical payment challenges anywhere in the world, your perspective is especially valuable.

---

## Author

Built by Blis Thoms ([@blisthoms](https://github.com/Florabeeh))

Domain knowledge and product vision — healthcare payment infrastructure for underserved markets. Technical implementation in collaboration with AI tooling.

---

## License

MIT
