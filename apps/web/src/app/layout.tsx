import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarkUS — 美国商标申请平台 | US Trademark Application",
  description:
    "Cross-border e-commerce sellers: assess, apply for and manage US trademarks with dual-qualified attorneys. 跨境电商卖家美国商标注册与管理平台。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
