# LinkedIn / X Post — HNG Mobile Stage 2

---

## Draft (LinkedIn format)

🚀 Just shipped **Sovereign Ledger** — a fully offline personal finance tracker built with React Native + Expo for HNG Mobile Stage 2!

Here's what the app does:

💸 **Transaction management** — Log income and expenses with categories, notes, and dates. Every entry updates the live balance instantly.

📊 **Chart analytics dashboard** — Spending Velocity bar chart (last 7 days), category allocation donut chart, and a portfolio trend line — all rendered with `react-native-svg` and zero backend.

🔒 **Biometric liveness gate** — The dashboard is protected by a custom liveness verification screen built on `expo-local-authentication`. Users see real-time instructions ("Center your face in the frame", "Blink Twice If you're safe"), a camera-frame overlay, and a Verification Successful card with an animated progress bar on success.

🔁 **Recurring transactions** — Set weekly or monthly repeating income/expenses. Due items are auto-posted on the next app launch.

💾 **Local persistence** — All finance data lives in `AsyncStorage`; security state in `expo-secure-store`. Nothing leaves the device.

📤 **CSV export** — One tap exports all transactions to a `.csv` file and opens the native share sheet.

🌍 **7 currencies** — USD, GBP, NGN, EUR, GHS, KES, ZAR, all formatted with `Intl.NumberFormat`.

---

**Development process:**
I modelled the data in TypeScript first (Transaction, Budget, RecurringTransaction, AppSettings), then built the financial logic (getTotals, getBudgetUsage, processRecurringTransactions) before touching the UI. This separation made it easy to verify calculations independently and swap chart implementations without breaking the finance core.

**Challenges:**
- Keeping recurring-transaction posting idempotent so items aren't double-posted across app restarts.
- Making the liveness gate feel polished (animated progress bar, proper disabled states) while staying within Expo's managed workflow.
- Balancing visual fidelity to the Figma mockups with responsive layouts across screen sizes from 360 px to tablet width.

**What I learned:**
Separating financial logic from UI (no state in lib files, pure functions everywhere) made the entire feature surface testable in isolation and the UI layer far simpler to reason about.

@hnginternship #HNG #MobileTrack #ReactNative #Expo #FinTech #OpenToWork

---

## Draft (X / Twitter — thread format)

1/ Just shipped my Stage 2 submission for @hnginternship — Sovereign Ledger, a fully offline finance tracker in React Native + Expo. 🧵

2/ Features: transaction management, category budgets, recurring transactions, CSV export, 7 currencies, and a biometric liveness gate protecting the dashboard. All data stays on-device.

3/ The liveness screen shows real-time instructions + a camera-frame overlay, then a "Verification Successful" card with an animated progress bar before unlocking. Built on expo-local-authentication.

4/ Charts: a 7-day spending velocity bar chart (responsive SVG), a category allocation donut, and a portfolio trend line — powered by react-native-svg, no chart library needed.

5/ Biggest challenge: keeping recurring transactions idempotent across app restarts while still auto-posting due items on launch. Pure-function finance logic made this way easier to reason about.

6/ Check the repo: [GitHub link] | Preview: [Appetize link]

#HNG #ReactNative #MobileTrack
