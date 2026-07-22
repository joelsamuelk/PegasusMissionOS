"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "info" | "error";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<{
  notify: (message: string, tone?: ToastTone) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? Check : t.tone === "error" ? TriangleAlert : Info;
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-md border bg-surface px-4 py-3 shadow-elev-3",
                t.tone === "success" && "border-success/30",
                t.tone === "error" && "border-critical/30",
                t.tone === "info" && "border-line-strong",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 flex-shrink-0",
                  t.tone === "success" && "text-success",
                  t.tone === "error" && "text-critical",
                  t.tone === "info" && "text-info",
                )}
              />
              <span className="flex-1 text-sm text-ink">{t.message}</span>
              <button
                onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}
                className="text-ink-subtle hover:text-ink"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
