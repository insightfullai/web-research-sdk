import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Insightfull Next Survey Recipe",
  description: "Checkout recipe app demonstrating Insightfull surveys in a shadcn Dialog.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
