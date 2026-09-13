# Personal Banks (React Native)

Mobile app for your personal bank balances — separate from the factory ERP.

## Features

- 4-digit PIN lock (setup / unlock / forgot via factory code)
- Banks (HBL, Meezan, Cash…)
- Multiple accounts per bank with balances
- Send money (deduct + recipient + notes)
- Deposit / add money
- Transaction history

## API

Uses the same deployed backend:

- `GET/POST /api/personal-banks/auth/*`
- `/api/personal-banks/banks`
- `/api/personal-banks/accounts`
- `POST /api/personal-banks/send`
- `POST /api/personal-banks/deposit`
- `GET /api/personal-banks/transactions`

## Run

1. Set API URL in `app.json` → `expo.extra.apiUrl`  
   (phone needs your machine LAN IP, e.g. `http://192.168.1.10:5000/api`, not `localhost`)
2. Or: `EXPO_PUBLIC_API_URL=http://YOUR_IP:5000/api`
3. Start backend, then:

```bash
cd personal-banks-app
npm start
```

Scan with Expo Go.

## First open

1. Create a 4-digit PIN  
2. Add a bank  
3. Add accounts + opening balances  
4. Use **Send** to deduct and record who you paid
