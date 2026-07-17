import "./globals.css";
import { Oswald, Arimo } from "next/font/google";

// Match the Innova Developments site: Oswald headings, Arimo body.
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-heading",
  display: "swap",
});

const arimo = Arimo({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "Contact List Generator | Innova Developments",
  description:
    "Pick a JobTread project and generate a formatted contact list as .xlsx and .pdf.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${oswald.variable} ${arimo.variable}`}>
      <body className="min-h-screen bg-slate-50 font-body text-slate-900">
        {children}
      </body>
    </html>
  );
}
