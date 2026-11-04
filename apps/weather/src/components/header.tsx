import { Link } from "react-router-dom";
import DisasterAlertPortal from "./disaster-alert-portal"
import { CitySearch } from "./city-search";
import { ThemeToggle } from "./theme-toggle";
import { useTheme } from "@/context/theme-provider";

export function Header() {
  const { theme } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b bg-emerald-950/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-3 sm:px-4">
        <Link to={"/"} className="hidden sm:block shrink-0">
          <img
            src={theme === "dark" ? "/agriqnet2.jpg" : "/agriqnet.jpg"}
            alt="AgriQNet"
            className="h-14"
          />
        </Link>

        <div className="flex flex-1 sm:flex-none min-w-0 items-center justify-end gap-2 sm:gap-4">
          <DisasterAlertPortal />
          <div className="flex-1 sm:flex-none min-w-0"><CitySearch /></div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
