import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host
    ? new URL(`${protocol}://${host}`)
    : new URL("https://cashflow-os.local");
  const socialImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: {
      default: "CashFlow OS · Personal Money Management",
      template: "%s · CashFlow OS",
    },
    description:
      "A private personal finance operating system for accounts, transactions, budgets, goals, bills, transfers and reports.",
    applicationName: "CashFlow OS",
    icons: {
      icon: "/og.png",
      shortcut: "/og.png",
    },
    openGraph: {
      title: "CashFlow OS",
      description: "Your money, in one clear system.",
      type: "website",
      siteName: "CashFlow OS",
      images: [
        {
          url: socialImage,
          width: 1760,
          height: 922,
          alt: "CashFlow OS personal finance dashboard",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "CashFlow OS",
      description: "Your money, in one clear system.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
