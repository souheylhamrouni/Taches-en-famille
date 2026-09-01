import { useEffect } from "react";
import { Platform } from "react-native";

export default function WebSecurityHeaders() {
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const setMeta = (name: string, content: string, httpEquiv = false) => {
      const tag = document.createElement(httpEquiv ? "meta" : "meta");
      if (httpEquiv) tag.httpEquiv = name;
      else tag.name = name;
      tag.content = content;
      document.head.appendChild(tag);
    };

    setMeta("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://*.expo.dev https://exp.host; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';");
    setMeta("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload", true);
    setMeta("X-Content-Type-Options", "nosniff", true);
    setMeta("X-Frame-Options", "DENY", true);
    setMeta("Referrer-Policy", "strict-origin-when-cross-origin", true);
  }, []);

  return null;
}
