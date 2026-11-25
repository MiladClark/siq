import { type ReactNode } from "react";
import RootLayout from "@siq/shared/layout";
import "./desktop.css";

export { metadata, viewport } from "@siq/shared/layout";

export default function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <RootLayout>
      <div className="siq-desktop-host">{children}</div>
    </RootLayout>
  );
}
