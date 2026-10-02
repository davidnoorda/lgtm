import { IconDiffSplit, IconDiffUnified, IconGearFill } from "@pierre/icons";
import type { DiffIndicators } from "@pierre/diffs";
import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { Button } from "./ui/Button";
import { ToggleGroup } from "./ui/ToggleGroup";
import { Switch } from "./ui/Switch";
import { ThemeDropdown } from "./theme/ThemeDropdown";

export type DisplaySettings = {
  diffStyle: "unified" | "split";
  diffIndicators: DiffIndicators;
  lineNumbers: boolean;
  showBackgrounds: boolean;
  overflow: "wrap" | "scroll";
};

export function ChromeHeader({
  title = "LGTM",
  context,
  actions,
  onHome,
  sidebarTrigger,
  settings,
  onSettingsChange,
}: {
  title?: string;
  context?: string;
  actions?: ReactNode;
  onHome: () => void;
  sidebarTrigger?: ReactNode;
  settings?: DisplaySettings;
  onSettingsChange?: (settings: DisplaySettings) => void;
}) {
  const change = (update: Partial<DisplaySettings>) => {
    if (settings) onSettingsChange?.({ ...settings, ...update });
  };
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background p-2 md:flex-nowrap md:gap-3 md:px-4 md:py-2.5">
      <Button variant="ghost" onClick={onHome}>
        {title}
      </Button>
      <span className="min-w-0 flex-1 truncate" title={context}>
        {context}
      </span>
      <div className="flex w-full flex-wrap items-center gap-1.5 md:w-auto">
        {sidebarTrigger}
        {actions}
        {settings && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              settings.diffStyle === "split"
                ? "Switch to unified view"
                : "Switch to split view"
            }
            onClick={() =>
              change({
                diffStyle: settings.diffStyle === "split" ? "unified" : "split",
              })
            }
          >
            {settings.diffStyle === "split" ? (
              <IconDiffSplit />
            ) : (
              <IconDiffUnified />
            )}
          </Button>
        )}
        <ThemeDropdown />
        {settings && (
          <Popover.Root>
            <Popover.Trigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Display settings"
                />
              }
            >
              <IconGearFill />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner align="end" sideOffset={6} className="z-60">
                <Popover.Popup
                  className="w-70 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-surface p-4 text-foreground shadow-lg"
                  aria-label="Display settings"
                >
                  <label className="mb-4 flex items-center justify-between text-xs">
                    Backgrounds{" "}
                    <Switch
                      checked={settings.showBackgrounds}
                      onCheckedChange={(value) =>
                        change({ showBackgrounds: value })
                      }
                    />
                  </label>
                  <label className="mb-4 flex items-center justify-between text-xs">
                    Line numbers{" "}
                    <Switch
                      checked={settings.lineNumbers}
                      onCheckedChange={(value) =>
                        change({ lineNumbers: value })
                      }
                    />
                  </label>
                  <label className="mb-4 flex items-center justify-between text-xs">
                    Word wrap{" "}
                    <Switch
                      checked={settings.overflow === "wrap"}
                      onCheckedChange={(value) =>
                        change({ overflow: value ? "wrap" : "scroll" })
                      }
                    />
                  </label>
                  <div className="flex flex-col gap-2 text-xs">
                    <span>Indicators</span>
                    <ToggleGroup
                      label="Indicator style"
                      value={settings.diffIndicators}
                      options={[
                        { value: "bars", label: "Bars" },
                        { value: "classic", label: "Classic" },
                        { value: "none", label: "None" },
                      ]}
                      onChange={(diffIndicators) => change({ diffIndicators })}
                    />
                  </div>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </header>
  );
}
