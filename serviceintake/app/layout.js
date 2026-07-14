import "./globals.css";

export const metadata = {
  title: "Service Request | Innova Developments",
  description:
    "Submit a service request to Innova Developments — tell us about your site and the work you need done.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900">{children}</body>
    </html>
  );
}
