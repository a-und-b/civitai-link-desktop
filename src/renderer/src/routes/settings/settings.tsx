import { ApiKeyInput } from '@/components/inputs/api-key-input';
import { PathInput } from '@/components/inputs/path-input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { PanelWrapper } from '@/layout/panel-wrapper';
import { useElectron } from '@/providers/electron';
import { ResourceType } from '@/types';
import { RefreshCcw } from 'lucide-react';

export function Settings() {
  const {
    clearSettings,
    settings,
    appVersion,
    updateAvailable,
    DEBUG,
    isExperimental,
  } = useElectron();
  const { setNSFW, setAlwaysOnTop, restartApp, setConcurrent, setBaseModelSubfolders } = useApi();

  return (
    <PanelWrapper>
      <>
        <div className="flex items-center px-4 py-2 min-h-14 justify-between">
          <h1 className="text-xl font-bold">Settings</h1>
          <div className="flex gap-2 items-center">
            {updateAvailable ? (
              <RefreshCcw
                size={16}
                className="cursor-pointer"
                onClick={restartApp}
              />
            ) : null}
            {isExperimental && (
              <span className="px-2 py-1 text-xs font-semibold rounded-md bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                EXPERIMENTAL
              </span>
            )}
            <p className="text-sm text-primary">v{appVersion}</p>
          </div>
        </div>
        <Separator />

        <ScrollArea className="h-screen">
          <div className="grid gap-6 p-4 pb-[145px] max-w-[600px]">
            <div className="flex items-center space-x-2">
              <Switch
                id="nsfw"
                checked={settings.nsfw}
                onCheckedChange={(checked: boolean) => setNSFW(checked)}
              />
              <label
                htmlFor="nsfw"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Add NSFW images to model preview
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="alwaysOnTop"
                checked={settings.alwaysOnTop}
                onCheckedChange={(checked: boolean) => setAlwaysOnTop(checked)}
              />
              <label
                htmlFor="alwaysOnTop"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Window always on top
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="baseModelSubfolders"
                checked={settings.baseModelSubfolders}
                onCheckedChange={(checked: boolean) => setBaseModelSubfolders(checked)}
              />
              <label
                htmlFor="baseModelSubfolders"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex flex-col gap-1"
              >
                Organize LoRAs by Base Model
                <span className="text-xs text-muted-foreground font-normal">
                  Automatically save LoRAs, LoCons, and DoRAs into subfolders based on their base model (e.g., loras/F1D/, loras/SDXL/)
                </span>
              </label>
            </div>
            {DEBUG ? (
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  id="concurrent"
                  name="concurrent"
                  min="1"
                  max="30"
                  className="max-w-16"
                  value={settings.concurrent}
                  onChange={(e) => setConcurrent(Number(e.target.value))}
                />
                <label
                  htmlFor="concurrent"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-col flex"
                >
                  Single download connections
                  <span className="text-xs">Min: 1 / Max: 30</span>
                </label>
              </div>
            ) : null}
            <ApiKeyInput />
            <h1 className="text-xl">Model Settings</h1>
            {(
              Object.keys(ResourceType) as Array<keyof typeof ResourceType>
            ).map((key) => (
              <div className="flex flex-col gap-y-4 overflow-hidden" key={key}>
                <Label className="text-primary">
                  {ResourceType[key] === ResourceType.DEFAULT
                    ? 'Root Model'
                    : ResourceType[key]}{' '}
                  Folder
                </Label>
                <PathInput type={key} />
              </div>
            ))}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-36 py-4">
                  Reset Settings
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Reseting this will clear all settings, keys, paths and
                    connections within the Link app.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="p-2">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={clearSettings}
                    className="p-2 destructive"
                  >
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </ScrollArea>
      </>
    </PanelWrapper>
  );
}
