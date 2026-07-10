import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "大育進学センター 夏期講習",
  description: "2026年 夏期講習 申込みシステム",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
