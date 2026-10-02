import { IconColorAuto, IconColorDark, IconColorLight } from "@pierre/icons";
import { Menu } from "@base-ui/react/menu";
import { Button } from "../ui/Button";
import { parseThemeMode } from "../../lib/theme";
import { useTheme } from "./ThemeProvider";

const modes = [
  ["system", "Auto", IconColorAuto],
  ["light", "Light", IconColorLight],
  ["dark", "Dark", IconColorDark],
] as const;

export function ThemeDropdown() {
  const { mode, setMode } = useTheme();
  const Icon = modes.find(([value]) => value === mode)![2];
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button variant="ghost" size="icon" aria-label="Theme settings" />
        }
      >
        <Icon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={6} className="z-60">
          <Menu.Popup
            className="min-w-37.5 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-surface p-2 text-foreground shadow-lg"
            aria-label="Appearance"
          >
            <Menu.RadioGroup
              value={mode}
              onValueChange={(value) => setMode(parseThemeMode(value))}
            >
              {modes.map(([value, label, ModeIcon]) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  closeOnClick
                  className="flex cursor-pointer items-center gap-2.5 rounded-sm p-2 data-highlighted:bg-secondary"
                >
                  <ModeIcon className="size-4 shrink-0" /> {label}
                  <Menu.RadioItemIndicator
                    className="ml-auto"
                    aria-hidden="true"
                  >
                    ✓
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
