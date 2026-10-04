# Friends Included Finance

This is the complete Day 4 homework application for Friends Included Ltd. It uses one business-logic layer for website and Telegram submissions, Supabase as the source of truth, Google Sheets as a readable synchronized copy, and Vercel for hosting.

The app includes:

- five demonstration roles with server-side role enforcement;
- sales and expense forms;
- pending sales, expense allocation, manager corrections, and idempotent approvals;
- the required commission rounding rule;
- a financial dashboard and reconciliation;
- Telegram identity linking, submissions, confirmations, and decision notifications;
- Google Sheets upsert by reference, with failed-sync and failed-notification retry controls;
- automated tests for validation, rounding, and the supplied Test 2 totals.

## 1  Create Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Project Settings → API**, copy the project URL and the server-only service-role key.
4. Never expose the service-role key in a variable beginning with `NEXT_PUBLIC_`.

The browser does not connect directly to Supabase. All requests pass through Vercel server routes, where the selected employee’s stored role is checked before a transaction or decision is processed.

## 2  Create the Google Sheet

1. Create a spreadsheet and rename two tabs exactly `Sales` and `Expenses`.
2. In Google Cloud, create a project, enable the Google Sheets API, create a service account, and create a JSON key.
3. Share the spreadsheet with the service account email as **Editor**.
4. Share the spreadsheet with the instructor as **Viewer**.
5. Copy the spreadsheet ID from the URL. It is the text between `/d/` and `/edit`.

The app creates the header rows when it first writes to each empty tab. New transactions and later decisions update the same row by reference.

## 3  Create the Telegram bot

You will do this part in Telegram after the first Vercel deployment:

1. Open [BotFather](https://t.me/BotFather), send `/newbot`, choose a name and a username, and copy the bot token.
2. Create a long random webhook secret, for example with `openssl rand -hex 32`.
3. Add both values to Vercel using the variable names in `.env.example`.
4. Redeploy the app.
5. Set the webhook from your terminal:

   ```bash
   TELEGRAM_BOT_TOKEN="your-token" \
   TELEGRAM_WEBHOOK_SECRET="your-secret" \
   pnpm set-telegram-webhook https://YOUR-APP.vercel.app
   ```

6. Open the new bot in a private chat and send `/start`. The bot replies with your Telegram user ID and chat ID.
7. On the website choose **Svetlana → Manager setup**, enter both IDs, and link your account to the fictional employee needed for the next test step.

Telegram command formats:

```text
/sale REF | Customer | A or B | Description | Amount | Richard% | Anastasia% | Jean-Claude%
/expense REF | Description | Materials, Travel, or Other | Amount | A, B, or Company overhead
```

For the required first Telegram entries:

```text
/sale S01 | Olivia Rose | A | One proud uncle and an emotional grandmother | 1000 | 50 | 30 | 20
/expense E01 | Rented suit and fake pearl necklace for the relatives | Materials | 120 | A
```

Link yourself to Richard before `S01`. Then use Manager setup to change the same Telegram user ID to Kevin before `E01`. The saved S01 still retains Richard and its original chat ID.

## 4  Configure locally

Copy `.env.example` to `.env.local` and fill every value. Keep the service account JSON on one line; preserve its `\\n` sequences inside the private key.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## 5  Publish with GitHub and Vercel

1. Create a private or public GitHub repository that the instructor can access.
2. Commit this folder, making sure `.env.local` is not included.
3. Import that repository into Vercel as a Next.js project.
4. Add every variable from `.env.example` in **Vercel → Project Settings → Environment Variables**.
5. Set `NEXT_PUBLIC_OWNER_NAME` to your real name and add the final Telegram, Sheet, and GitHub links.
6. Deploy, then set the Telegram webhook as described above.

## 6  Run the homework tests

Before Test 1, remove practice transactions by running [`supabase/clear-practice-data.sql`](supabase/clear-practice-data.sql) once in Supabase SQL Editor.

### Test 1

1. Link your Telegram account to Richard and submit `S01` through the bot.
2. Relink the same Telegram account to Kevin and submit `E01` through the bot.
3. Use the website role selector for:
   - Anastasia: `S02`, €2,000, Project B, split `0 / 50 / 50`.
   - Kevin: `E02`, €80 Travel, proposed B; and `E03`, €100 Other, Company overhead.
4. As Svetlana approve `S01` unchanged, change `S02` to `20 / 40 / 40`, allocate `E01` to A, and change `E02` from B to A.

Expected results: Project A €700, Project B €1,800, Company €2,400. Commission: Richard €90, Anastasia €110, Jean-Claude €100.

### Test 2

Keep Test 1 data. Add through the website:

- Jean-Claude: `S03`, €1,500, A, proposed `40 / 40 / 20`.
- Richard: `S04`, €800, B, `25 / 25 / 50`; and `S05`, €600, B, `100 / 0 / 0`.
- Kevin: `E04` €250 Materials B; `E05` €90 Travel A; `E06` €60 Other Company overhead; `E07` €140 Materials A.

Before decisions, link your Telegram ID to Jean-Claude. As Svetlana change `S03` to `20 / 30 / 50` and approve. Approve `S04`; leave `S05` pending. Relink yourself to Kevin, approve `E04` to B, change `E05` from A to B, and leave `E07` awaiting allocation.

Expected cumulative results: Project A €2,050, Project B €2,180, Company €3,930. Commission: Richard €140, Anastasia €175, Jean-Claude €215. `S05` remains pending and `E07` remains awaiting allocation.

## 7  Verify and submit

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Check both Google Sheet tabs, the Telegram decision messages, and retry controls. Then place the single working Vercel URL in your own row of the course spreadsheet. Do not edit any other row.

## Security notes

- All people and data in the application are fictional.
- Bot tokens, service-role keys, and service-account JSON stay only in server-side environment variables.
- Approval and notification delivery are stored separately. A Telegram failure never reverses an approved financial decision.
- Sheets retry updates the existing reference row and never inserts another financial transaction.
