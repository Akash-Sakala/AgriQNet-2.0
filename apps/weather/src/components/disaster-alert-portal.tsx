import { Siren } from "lucide-react";
import { Button } from "./ui/button";
import { t } from "@/i18n";

const DisasterAlertPortal = () => {
  const handleClick = () => {
    window.open("https://sachet.ndma.gov.in/", "_blank"); // opens in a new tab
  };

  return (
    <Button onClick={handleClick} className="shrink-0 px-3" title={t("disasterAlerts")}>
      <Siren className="h-4 w-4" aria-hidden /><span className="hidden sm:inline ml-1">{t("disasterAlerts")}</span>
    </Button>
  );
};

export default DisasterAlertPortal;
