import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "SNN｜Smart Neural Network 学生科技社团";
const DESCRIPTION =
  "面向人工智能与机器人方向的学生科技社团。一起学习、动手、参赛，把想法做成真正能跑的项目。";

// 部署时通过 NEXT_PUBLIC_SITE_URL 注入正式域名，用于解析 OG 图的绝对地址。
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: "/assets/favicon.svg",
    shortcut: "/assets/favicon.svg",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "SNN · Smart Neural Network",
    locale: "zh_CN",
    type: "website",
    images: [
      {
        url: "/assets/og.png",
        width: 1200,
        height: 630,
        alt: "SNN · Smart Neural Network",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/assets/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Must run synchronously before the client bundle: injects
            window.__SNN_AI_API_BASE_URL__ consumed by lib/ai-client.ts.
            async/defer would race hydration and break AI endpoint resolution. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/ai-config.js"></script>
        {children}
      </body>
    </html>
  );
}
