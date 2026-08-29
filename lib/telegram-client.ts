declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;

        ready: () => void;
        expand: () => void;

        colorScheme?: string;

        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
      };
    };
  }
}

export function getTelegramWebApp() {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  return (
    window.Telegram
      ?.WebApp ?? null
  );
}

export function getTelegramInitData() {
  return (
    getTelegramWebApp()
      ?.initData ?? ""
  );
}
