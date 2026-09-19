import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

type ViewHeaderProps = {
  eyebrow: string;
  title: string;
  onBack: () => void;
};

export function ViewHeader({ eyebrow, title, onBack }: ViewHeaderProps) {
  return (
    <header className="view-header">
      <Button variant="ghost" size="icon" className="icon-button" onClick={onBack} aria-label="返回">
        <ArrowLeft aria-hidden="true" />
      </Button>
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span className="view-header__spacer" aria-hidden="true" />
    </header>
  );
}
