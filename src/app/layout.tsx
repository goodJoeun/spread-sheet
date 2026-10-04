import type { Metadata } from "next";
import { strings } from "@/resources/strings";
import "./globals.css";

export const metadata: Metadata = {
  title: strings.app.title,
  description: strings.app.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
