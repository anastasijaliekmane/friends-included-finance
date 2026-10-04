import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Friends Included Finance",
  description: "Transaction approvals and project finance for Friends Included Ltd",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
