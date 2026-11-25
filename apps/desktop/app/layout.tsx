import { type ReactNode } from "react";
import RootLayout from "@siq/shared/layout";
import { DesktopTitlebar } from "../src/components/DesktopTitlebar";
import "./desktop.css";

export { metadata, viewport } from "@siq/shared/layout";

export default function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <RootLayout>
      <DesktopTitlebar />
      {children}
    </RootLayout>
  );
}
