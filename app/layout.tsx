import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Google Docs PDF Copy",
  description: "Editor Markdown con preview estilo Google Docs y exportación PDF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
