import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spread Sheet",
  description: "여러 사람이 함께, AI와 함께 편집하는 스프레드시트",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
