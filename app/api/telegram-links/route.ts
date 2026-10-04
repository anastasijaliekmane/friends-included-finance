import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/domain";
import { getEmployee, getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const actor = await getEmployee(body.actorEmployeeId);
    if (actor.role !== "manager") throw new Error("Only Svetlana can link Telegram users");
    const telegramUserId = Number(body.telegramUserId);
    const chatId = Number(body.chatId);
    if (!Number.isSafeInteger(telegramUserId) || !Number.isSafeInteger(chatId)) throw new Error("Enter valid Telegram user and chat IDs");
    await getEmployee(body.employeeId);
    const supabase = getSupabaseAdmin();
    await supabase.from("telegram_links").delete().or(`telegram_user_id.eq.${telegramUserId},employee_id.eq.${body.employeeId}`);
    const { data, error } = await supabase.from("telegram_links").insert({
      telegram_user_id: telegramUserId,
      employee_id: body.employeeId,
      chat_id: chatId,
      telegram_username: String(body.telegramUsername || "").replace(/^@/, "") || null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ link: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
