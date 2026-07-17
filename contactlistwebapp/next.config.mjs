/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep these out of the webpack bundle so their runtime fs reads (pdfkit's
  // .afm font-metric files, exceljs internals) resolve from node_modules.
  experimental: {
    serverComponentsExternalPackages: ["pdfkit", "exceljs"],
    // Make sure pdfkit's bundled font data ships with the serverless function.
    outputFileTracingIncludes: {
      "/api/generate": ["./node_modules/pdfkit/js/data/**/*"],
    },
  },
};

export default nextConfig;
