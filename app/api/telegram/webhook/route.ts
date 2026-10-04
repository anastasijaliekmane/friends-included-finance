import { NextRequest, NextResponse } from "next/server";
import { createExpense, createSale } from "@/lib/transactions";
import { errorMessage, formatEuro } from "@/lib/domain";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
  };
};

const help = [
  "Friends Included commands",
  "/whoami — show your Telegram IDs and linked role",
  "/sale REF | Customer | A or B | Description | Amount | Richard% | Anastasia% | Jean-Claude%",
  "/expense REF | Description | Materials, Travel, or Other | Amount | A, B, or Company overhead",
].join("\n");

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message?.text || !message.from) return NextResponse.json({ ok: true });
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text.trim();
  try {
    const { data: link } = await getSupabaseAdmin()
      .from("telegram_links")
      .select("employee_id, employees(display_name, role)")
      .eq("telegram_user_id", userId)
      .maybeSingle();
    if (text.startsWith("/start") || text.startsWith("/whoami")) {
      const employee = Array.isArray(link?.employees) ? link?.employees[0] : link?.employees;
      await sendTelegramMessage(chatId, [
        `Telegram user ID: ${userId}`,
        `Chat ID: ${chatId}`,
        employee ? `Linked to: ${(employee as { display_name: string }).display_name}` : "Not linked. Ask Svetlana to link this ID in Manager setup.",
        "",
        help,
      ].join("\n"));
      return NextResponse.json({ ok: true });
    }
    if (text.startsWith("/help")) {
      await sendTelegramMessage(chatId, help);
      return NextResponse.json({ ok: true });
    }
    if (!link?.employee_id) throw new Error("This Telegram user is not linked. Send /whoami and ask Svetlana to link your user ID.");
    if (text.startsWith("/sale")) {
      const parts = text.replace(/^\/sale(?:@\w+)?\s*/i, "").split("|").map((part) => part.trim());
      if (parts.length !== 8) throw new Error("Use: /sale REF | Customer | A or B | Description | Amount | Richard% | Anastasia% | Jean-Claude%");
      const sale = await createSale({ actorEmployeeId: link.employee_id, origin: "telegram", telegramChatId: chatId }, {
        reference: parts[0], customer: parts[1], project: parts[2].toUpperCase(), description: parts[3], amount: parts[4],
        richardPct: parts[5], anastasiaPct: parts[6], jeanClaudePct: parts[7],
      });
      await sendTelegramMessage(chatId, `Recorded ${sale.reference}: ${formatEuro(sale.amount_cents)}, Project ${sale.project}, Pending approval. Sheets: ${sale.sheet_sync_status}.`).catch(() => undefined);
    } else if (text.startsWith("/expense")) {
      const parts = text.replace(/^\/expense(?:@\w+)?\s*/i, "").split("|").map((part) => part.trim());
      if (parts.length !== 5) throw new Error("Use: /expense REF | Description | Materials, Travel, or Other | Amount | A, B, or Company overhead");
      const allocation = /company overhead/i.test(parts[4]) ? "Company overhead" : parts[4].toUpperCase();
      const expense = await createExpense({ actorEmployeeId: link.employee_id, origin: "telegram", telegramChatId: chatId }, {
        reference: parts[0], description: parts[1], category: parts[2], amount: parts[3], proposedAllocation: allocation,
      });
      const status = expense.status === "allocated" ? "Allocated to Company overhead" : "Awaiting allocation";
      await sendTelegramMessage(chatId, `Recorded ${expense.reference}: ${formatEuro(expense.amount_cents)}, proposed ${expense.proposed_allocation}, ${status}. Sheets: ${expense.sheet_sync_status}.`).catch(() => undefined);
    } else {
      await sendTelegramMessage(chatId, help);
    }
  } catch (error) {
    await sendTelegramMessage(chatId, `Not recorded: ${errorMessage(error)}`);
  }
  return NextResponse.json({ ok: true });
}
