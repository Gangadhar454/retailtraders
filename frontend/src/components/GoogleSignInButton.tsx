"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
            },
          ) => void;
          prompt?: () => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  onSuccess: (credential: string) => void | Promise<void>;
  onError?: (error: string) => void;
  disabled?: boolean;
}

const DEFAULT_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "329472900840-e86f17v1scnkckhj35v91gufboir97f3.apps.googleusercontent.com";

let isGsiInitialized = false;
let currentOnSuccess: ((credential: string) => void | Promise<void>) | null = null;
let currentOnError: ((error: string) => void) | null = null;

export function GoogleSignInButton({
  text = "continue_with",
  onSuccess,
  onError,
  disabled = false,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isRenderedRef = useRef(false);
  const [initialized, setInitialized] = useState(false);

  // Keep references fresh for the Google callback
  currentOnSuccess = onSuccess;
  currentOnError = onError ?? null;

  const initGoogle = useCallback(() => {
    if (
      typeof window === "undefined" ||
      !window.google?.accounts?.id ||
      !containerRef.current ||
      isRenderedRef.current
    ) {
      return;
    }

    try {
      if (!isGsiInitialized) {
        window.google.accounts.id.initialize({
          client_id: DEFAULT_CLIENT_ID,
          callback: async (response) => {
            if (response?.credential) {
              try {
                if (currentOnSuccess) {
                  await currentOnSuccess(response.credential);
                }
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Failed to sign in with Google";
                currentOnError?.(message);
              }
            } else {
              currentOnError?.("No credential received from Google");
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        isGsiInitialized = true;
      }

      // Clear any prior children before rendering button
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }

      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "outline", // Clean white background with crisp border & official Google colors
        size: "large",
        text,
        shape: "rectangular",
        logo_alignment: "left",
        width: 384,
      });

      isRenderedRef.current = true;
      setInitialized(true);
    } catch (err: unknown) {
      console.error("Google Sign-In initialization failed", err);
      onError?.("Could not initialize Google Sign-In");
    }
  }, [text, onError]);

  useEffect(() => {
    if (window.google?.accounts?.id && !isRenderedRef.current) {
      initGoogle();
    }
  }, [initGoogle]);

  return (
    <div className="w-full flex flex-col items-center">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          initGoogle();
        }}
      />

      {/* Target container for Google iframe — kept purely empty of React children */}
      <div
        ref={containerRef}
        className={`w-full flex justify-center min-h-[44px] ${
          disabled ? "pointer-events-none opacity-50" : ""
        } ${!initialized ? "hidden" : ""}`}
      />

      {/* Clean matching outline skeleton shown only while Google script loads */}
      {!initialized && (
        <div className="w-full max-w-[384px] h-[44px] rounded border border-gray-300 bg-white flex items-center justify-center gap-3 text-[14px] text-gray-700 font-medium shadow-sm animate-pulse">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Loading Google Sign-in...
        </div>
      )}
    </div>
  );
}
