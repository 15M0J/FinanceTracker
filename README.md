# Sovereign Ledger — Finance Tracker

> HNG Mobile Track · Stage 2 submission

A fully offline personal finance tracker built with **React Native + Expo**. Users log income and expenses, set category budgets, schedule recurring transactions, visualise spending patterns with charts, protect the dashboard with a biometric liveness gate, and export data to CSV — all without a backend.

---

## Features

| Area | Details |
|---|---|
| **Transaction management** | Log income or expenses with amount, category, note, and date. Tap a ledger row to drill into category history. |
| **Category budgets** | Set weekly or monthly spending limits per category. Cards show live progress bars, "AT LIMIT / ON TRACK / HEALTHY" badges, and remaining budget. |
| **Recurring transactions** | Mark any transaction as recurring (weekly or monthly). Due items are automatically posted on the next app launch. |
| **Financial overview** | Dashboard hero card shows liquid portfolio value, monthly inflow/active spend, and DEPOSIT / WITHDRAW quick actions. |
| **Chart analytics** | Spending Velocity bar chart (last 7 days), Allocation donut chart (by category share), and Spending Trend line chart — all on the Insights tab. |
| **Liveness verification** | A biometric security gate (`expo-local-authentication`) guards the dashboard. The custom liveness UI shows real-time instructions ("Center your face", "Blink Twice If you're safe"), a camera-frame overlay, and a Verification Successful screen with animated progress bar. |
| **Local persistence** | All finance data lives in `@react-native-async-storage/async-storage`. Security unlock state (last unlock time, method) is stored in `expo-secure-store`. Data survives app close/reopen and device restarts. |
| **CSV export** | Exports all transactions to a timestamped `.csv` file via `expo-file-system`, then opens the native share sheet with `expo-sharing`. |
| **Multi-currency** | Supports USD, GBP, NGN, EUR, GHS, KES, ZAR. Currency is toggled in Settings and applied to every monetary display. |

---

## Screenshots

| Overview | Insights | Budgets | Liveness | Verified |
|---|---|---|---|---|
| Dashboard with portfolio hero card, allocation scroll, trend chart, and recent ledger | Financial analytics with bar chart, donut chart, smart suggestions | Burn-rate hero, category filter pills, per-category budget cards | Biometric liveness gate with camera frame and real-time instructions | Verification Successful card with animated progress bar |

---

## Tech Stack

| Package | Purpose |
|---|---|
| `expo` ~54 | Managed workflow, build tooling, native module access |
| `react-native` 0.81 | Core UI framework |
| `typescript` | Type-safe data models and props |
| `react-native-svg` | SVG-based donut, bar, and trend charts |
| `@expo/vector-icons` | Ionicons throughout the UI |
| `expo-local-authentication` | Biometric / Face ID liveness verification |
| `expo-secure-store` | Encrypted storage for security session state |
| `@react-native-async-storage/async-storage` | Persistent local storage for all finance data |
| `expo-file-system` + `expo-sharing` | CSV export and native share sheet |

---

## Architecture

```
FinanceTracker/
├── App.tsx                  # Single-screen app with route-based rendering
├── src/
│   ├── types.ts             # Transaction, Budget, RecurringTransaction, AppSettings
│   ├── constants.ts         # Category metadata, currency options, empty data template
│   ├── components/
│   │   ├── SecurityGate.tsx # Biometric liveness gate + Verification Successful screen
│   │   └── Charts.tsx       # Reusable DonutChart and BarChart components
│   └── lib/
│       ├── finance.ts       # getTotals, getBudgetUsage, getDailyExpenseTotals, processRecurring
│       ├── storage.ts       # loadFinanceData, saveFinanceData, saveSecurityState
│       ├── date.ts          # startOfPeriod, addFrequency, isDue, shortDate
│       ├── id.ts            # createId — prefixed timestamp IDs
│       └── export.ts        # exportTransactionsCsv
├── assets/                  # App icon, adaptive icon, splash
├── app.json                 # Expo config (bundle IDs, Face ID permission string)
└── eas.json                 # EAS Build profiles (preview APK, production AAB)
```

### Data model

```typescript
type Transaction      = { id, type, amount, category, note, date, createdAt }
type Budget           = { id, category, amount, period, createdAt }
type RecurringTransaction = { id, type, amount, category, note, frequency, nextRunAt, active, createdAt }
type AppSettings      = { currency, lockDashboard }
type FinanceData      = { transactions, budgets, recurring, settings }
```

All data is stored as a single JSON blob under the key `finance_data_v1` in AsyncStorage.

---

## Screens

| Route | Description |
|---|---|
| `tabs/overview` | Dashboard: portfolio hero, allocation cards, spending trend, recent ledger |
| `tabs/budgets` | Monthly burn hero, category filter, per-category budget cards |
| `tabs/insights` | Spending velocity bar chart, donut allocation chart, smart suggestions |
| `tabs/settings` | Profile, biometrics toggle, currency picker, CSV export |
| `add-transaction` | Expense/Income toggle, number pad, category selector, notes |
| `allocation` (New Category) | Category selector, notes, budget amount + number pad |
| `allocation-list` | Filterable list of all budget allocations |
| `ledger` | Per-category or all-transaction ledger list |
| `categories` | Category summary with progress bars |
| `change-password` | Password update form with strength meter |

---

## Liveness Verification Flow

1. User enables **Biometrics** in Settings (toggle → stores `lockDashboard: true`).
2. On next app launch the `SecurityGate` component is rendered instead of the dashboard.
3. The gate shows a camera-frame overlay and taps `expo-local-authentication` to trigger the device biometric prompt (Face ID on iOS, face/fingerprint on Android).
4. While the OS prompt is open the UI shows the yellow "Blink Twice If you're safe" pill.
5. On **success**: Verification Successful card appears with an animated progress bar, then `onVerified()` is called → dashboard unlocks.
6. On **failure**: Error message shown inline; user can retry or cancel.
7. Security session state (last unlock timestamp, method) is saved to `expo-secure-store`.

> The gate is isolated in `src/components/SecurityGate.tsx` so it can be swapped for a third-party face-liveness SDK (e.g. AWS Amplify Liveness, FaceTec) without touching the finance logic.

---

## Run Locally

```bash
# Install dependencies
npm install

# Start Metro bundler
npm start

# Or open directly on a platform
npm run android   # Android emulator / device
npm run ios       # iOS simulator (macOS only)
```

Scan the QR code with **Expo Go** on a physical device to test biometric features.

---

## Build APK (for Appetize submission)

```bash
# Install EAS CLI globally (once)
npm install -g eas-cli

# Login to Expo account
eas login

# Configure build if first time
eas build:configure

# Build a preview APK (Android)
eas build --platform android --profile preview
```

The build runs on Expo's cloud. Download the `.apk` when complete, upload to [Appetize.io](https://appetize.io), and copy the public preview link for submission.

---

## Grading Checklist

| Criterion | Implementation |
|---|---|
| **Transaction Management** | `renderAddTransactionScreen` — Expense/Income toggle, categories, notes, recurring switch |
| **Security / Liveness** | `src/components/SecurityGate.tsx` — biometric gate with custom liveness UI and success screen |
| **Financial Overview** | Overview tab — live portfolio balance; Budgets tab — real-time category burn rate |
| **Recurring Transactions** | `processRecurringTransactions` in `src/lib/finance.ts` — auto-posts due items on launch |
| **Chart Analytics** | Insights tab — 7-day bar chart, category donut, trend line; `src/components/Charts.tsx` |
| **Local Persistence** | `src/lib/storage.ts` — AsyncStorage for data, SecureStore for auth state |
| **CSV Export** | `src/lib/export.ts` — `exportTransactionsCsv` writes file and opens share sheet |
| **Currency Formatting** | `formatMoney` in `src/lib/finance.ts` — `Intl.NumberFormat` for 7 currencies |

---

## Notes

- The **first launch** seeds sample data (9 transactions, 7 budgets, 2 recurring items) so charts and the dashboard render immediately.
- The app targets **portrait orientation** only (`"orientation": "portrait"` in `app.json`).
- New Architecture is enabled (`"newArchEnabled": true`) for better performance on React Native 0.81.
- Edge-to-edge display is enabled on Android (`"edgeToEdgeEnabled": true`).
