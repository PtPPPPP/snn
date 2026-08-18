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

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  other: {
    "codex-preview": "development",
  },
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
        {children}
      </body>
    </html>
  );
}
