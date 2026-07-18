import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hyderabad Clean Bites",
  description: "Tracking food safety inspections across the city.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}