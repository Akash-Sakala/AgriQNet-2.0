import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/theme-provider";
import { t } from "@/i18n";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`flex items-center cursor-pointer transition-transform duration-500 ${
        isDark ? "rotate-180" : "rotate-0"
      }`}
    >
      {isDark ? (
        <Sun className="h-6 w-6 text-amber-300" />
      ) : (
        <Moon className="h-6 w-6 text-emerald-600" />
      )}
      <span className="sr-only">{t("toggleTheme")}</span>
    </div>
  );
}
