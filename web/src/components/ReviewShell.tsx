import { IconFileTree, IconX } from "@pierre/icons";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui/Button";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { ChromeHeader, type DisplaySettings } from "./ChromeHeader";

export function ReviewShell({
  context,
  actions,
  onHome,
  settings,
  onSettingsChange,
  files,
  comments,
  commentCount,
  error,
  children,
}: {
  context: string;
  actions: ReactNode;
  onHome: () => void;
  settings: DisplaySettings;
  onSettingsChange: (value: DisplaySettings) => void;
  files: ReactNode;
  comments: ReactNode;
  commentCount: number;
  error: string;
  children: ReactNode;
}) {
  const mobile = useMediaQuery("(max-width: 767px)");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("files");
  useEffect(() => {
    const viewURL = () => {
      const url = new URL(window.location.href);
      // Filtering the tree should not dismiss it; file/view navigation should.
      url.searchParams.delete("changed");
      return url.href;
    };
    let previous = viewURL();
    const close = () => {
      const next = viewURL();
      if (next !== previous) setOpen(false);
      previous = next;
    };
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);
  useEffect(() => {
    if (!mobile) setOpen(false);
  }, [mobile]);

  // Render one sidebar: no duplicate tree models or hidden mobile controls.
  const sidebar = (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => {
        if (typeof value === "string") setTab(value);
      }}
      className="flex h-full min-h-0 flex-col"
    >
      <Tabs.List
        activateOnFocus
        aria-label="Sidebar sections"
        className="flex gap-1 border-b border-border p-3"
      >
        <Tabs.Tab
          value="files"
          className="flex-1 cursor-pointer rounded-md p-2 data-active:bg-secondary"
        >
          Files
        </Tabs.Tab>
        <Tabs.Tab
          value="comments"
          className="flex-1 cursor-pointer rounded-md p-2 data-active:bg-secondary"
        >
          Comments ({commentCount})
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="files" keepMounted className="min-h-0 flex-1">
        {files}
      </Tabs.Panel>
      <Tabs.Panel
        value="comments"
        keepMounted
        className="min-h-0 flex-1 overflow-auto"
      >
        {comments}
      </Tabs.Panel>
    </Tabs.Root>
  );
  return (
    <Dialog.Root open={mobile && open} onOpenChange={setOpen}>
      <div className="flex h-dvh flex-col">
        <ChromeHeader
          context={context}
          actions={actions}
          onHome={onHome}
          settings={settings}
          onSettingsChange={onSettingsChange}
          sidebarTrigger={
            mobile && (
              <Dialog.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Show sidebar"
                  />
                }
              >
                <IconFileTree />
              </Dialog.Trigger>
            )
          }
        />
        {error && (
          <div
            role="alert"
            className="border-b border-border px-4 py-2.5 text-danger"
          >
            {error}
          </div>
        )}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
          {!mobile && (
            <aside
              aria-label="Review sidebar"
              className="min-h-0 border-r border-border"
            >
              {sidebar}
            </aside>
          )}
          {children}
        </div>
      </div>
      {mobile && (
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup
            className="fixed inset-y-0 left-0 z-50 flex w-[min(340px,90vw)] flex-col bg-background"
            aria-describedby={undefined}
          >
            <div className="flex items-center justify-between p-3">
              <Dialog.Title className="text-base">Review sidebar</Dialog.Title>
              <Dialog.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close sidebar"
                  />
                }
              >
                <IconX />
              </Dialog.Close>
            </div>
            {sidebar}
          </Dialog.Popup>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
