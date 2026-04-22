import { useEffect, useRef } from "react";

export default function TurnstileWidget({ siteKey, onToken, resetSignal }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !siteKey) return;

    let cancelled = false;
    let timerId;
    let retries = 0;

    const renderWhenReady = () => {
      if (cancelled || widgetIdRef.current || !containerRef.current) return;

      if (window.turnstile?.render) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "error-callback": () => onToken(""),
          "expired-callback": () => onToken("")
        });
        return;
      }

      retries += 1;
      if (retries <= 50) {
        timerId = setTimeout(renderWhenReady, 200);
      } else {
        onToken("");
      }
    };

    renderWhenReady();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onToken]);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  return <div ref={containerRef} aria-label="Captcha de seguridad" />;
}
