import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* 100% Local Self-Hosted Fonts — Zero External API Requests */

/**
 * Milad — the single Persian/Arabic-script typeface for the whole app.
 * Scoped with unicode-range so it renders every Persian glyph (letters, Persian digits,
 * ZWNJ, punctuation) while Latin text keeps flowing through the selected English preset.
 */
const milad = localFont({
  src: [
    { path: "./fonts/Milad-Thin.woff2", weight: "100", style: "normal" },
    { path: "./fonts/Milad-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/Milad-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Milad-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Milad-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Milad-ExtraBold.woff2", weight: "800", style: "normal" },
    { path: "./fonts/Milad-Black.woff2", weight: "900", style: "normal" },
    { path: "./fonts/Milad-ExtraBlack.woff2", weight: "950", style: "normal" },
  ],
  variable: "--font-milad",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0600-06FF, U+0750-077F, U+08A0-08FF, U+200C-200F, U+2066-2069, U+FB50-FDFF, U+FE70-FEFF",
    },
  ],
});

const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const ibmPlexSans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/IBMPlexSans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ibm-plex",
  display: "swap",
});

const manrope = localFont({
  src: "./fonts/Manrope-Variable.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});

const rubik = localFont({
  src: "./fonts/Rubik-Latin-Variable.woff2",
  variable: "--font-rubik",
  weight: "300 900",
  display: "swap",
});

const ALL_FONT_VARS = [
  milad.variable,
  geistSans.variable,
  geistMono.variable,
  ibmPlexSans.variable,
  manrope.variable,
  rubik.variable,
].join(" ");

const APPEARANCE_BOOTSTRAP_SCRIPT = `
(function(){
  try {
    var raw = localStorage.getItem("siq_app_prefs_v1");
    if (!raw) return;
    var p = JSON.parse(raw);
    var r = document.documentElement;
    if (p && typeof p.fontPreset === "string") {
      r.dataset.font = p.fontPreset;
    }
    if (p && typeof p.theme === "string") {
      r.dataset.theme = p.theme;
    }
    if (p && typeof p.customAccentHex === "string" && /^#[0-9a-fA-F]{6}$/.test(p.customAccentHex)) {
      var h = p.customAccentHex.slice(1);
      var R = parseInt(h.slice(0,2),16), G = parseInt(h.slice(2,4),16), B = parseInt(h.slice(4,6),16);
      var mix = function(tr,tg,tb,w){
        var c = function(a,b){ return Math.round(a*(1-w)+b*w).toString(16).padStart(2,"0"); };
        return "#" + c(R,tr) + c(G,tg) + c(B,tb);
      };
      r.style.setProperty("--color-emerald-300", mix(255,255,255,0.42));
      r.style.setProperty("--color-emerald-400", mix(255,255,255,0.22));
      r.style.setProperty("--color-emerald-500", p.customAccentHex);
      r.style.setProperty("--color-emerald-600", mix(0,0,0,0.18));
      r.style.setProperty("--siq-accent-rgb", R + " " + G + " " + B);
    }
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: "siq — Private Voice & Chat",
  description: "Lightweight, private voice channels, screen sharing, and chat for friends.",
};

export const viewport: Viewport = {
  themeColor: "#070709",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-font="geist"
      data-theme="emerald"
      suppressHydrationWarning
      className={`${ALL_FONT_VARS} dark`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="flex min-h-[100dvh] flex-col bg-[#070709] text-zinc-100 antialiased selection:bg-emerald-500/25 selection:text-emerald-200">
        {children}
      </body>
    </html>
  );
}
