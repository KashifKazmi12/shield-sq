import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export const metadata = {
  title: "ShieldSQ",
  description: "Unified security dashboard for Trivy scans and Falco runtime alerts",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
