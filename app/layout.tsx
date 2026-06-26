import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "大育進学センター 授業申込み",
  description: "2026年 授業申込みシステム",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
