-- Run only immediately before Test 1. This removes every transaction and keeps employees and Telegram links.
begin;
delete from public.sales;
delete from public.expenses;
commit;
