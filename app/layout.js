import "./globals.css";
import { GoogleAnalytics } from '@next/third-parties/google';

export const viewport = {
  themeColor: "#2e1433",
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content"
};

export const metadata = {
  title: "access: chatgpt - Enhanced Accessibility ChatGPT Interface",
  description: "Interact with ChatGPT using enhanced accessibility features",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-64x64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/apple-touch-icon-60x60.png', sizes: '60x60', type: 'image/png' },
      { url: '/apple-touch-icon-76x76.png', sizes: '76x76', type: 'image/png' },
      { url: '/apple-touch-icon-120x120.png', sizes: '120x120', type: 'image/png' },
      { url: '/apple-touch-icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/apple-touch-icon-167x167.png', sizes: '167x167', type: 'image/png' },
      { url: '/apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    title: "access:chatgpt",
    statusBarStyle: "default",
    capable: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-dark text-light antialiased">
        {children}
        <GoogleAnalytics gaId="G-LGBJ3EV4V7" />
      </body>
    </html>
  );
}
