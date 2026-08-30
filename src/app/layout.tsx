import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export const metadata: Metadata = {
  title: "Trafic routier à Biarritz",
  description: "Exploration locale des données historiques de trafic routier à Biarritz.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
