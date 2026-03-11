import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useApi } from '@/hooks/use-api';
import {
  Check,
  ClipboardCopy,
  ExternalLink,
  FolderOpenDot,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { StoreInVaultButton } from '../buttons/store-in-vault-button';
import { FileFetchMetadata } from './file-fetch-metadata';
import { FileItemDelete } from './file-item-delete';
import { FileLinkToCivitai } from './file-link-to-civitai';

type FileActionsProps = {
  file: Resource;
  onRefresh?: (file: Resource) => void;
};

export function FileActions({ file, onRefresh }: FileActionsProps) {
  const { openModelFileFolder, refreshMetadataFromCivitai } = useApi();
  const { toast } = useToast();

  const [isCopied, setIsCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setIsCopied(false);
    }, 4000);
  }, [isCopied]);

  return (
    <div className="flex items-center p-2">
      <div className="flex items-center gap-2">
        <StoreInVaultButton file={file} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                file?.localPath
                  ? openModelFileFolder(file.localPath)
                  : alert('Path to file cant be found.')
              }
            >
              <FolderOpenDot className="h-4 w-4" />
              <span className="sr-only">Open File in Folder</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open File in Folder</TooltipContent>
        </Tooltip>
        {(file.matchStatus === 'matched' ||
          file.matchStatus === 'user-linked' ||
          (file.matchStatus === undefined && file.modelVersionId)) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={isRefreshing}
              onClick={async () => {
                console.log('[Refresh] User triggered refresh for:', file.modelName ?? file.name, file.hash);
                setIsRefreshing(true);
                try {
                  const updated = await refreshMetadataFromCivitai(file.hash);
                  if (updated) {
                    console.log('[Refresh] Renderer received updated file, previewImageUrl:', !!updated.previewImageUrl);
                    onRefresh?.(updated);
                    toast({ title: 'Metadata refreshed from Civitai' });
                  } else {
                    console.log('[Refresh] No updated file returned');
                  }
                } catch (err) {
                  console.error('[Refresh] Refresh failed:', err);
                  toast({
                    variant: 'destructive',
                    title: 'Failed to refresh metadata',
                    description:
                      err instanceof Error ? err.message : 'Model may not exist on Civitai',
                  });
                } finally {
                  setIsRefreshing(false);
                }
              }}
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              <span className="sr-only">Refresh metadata from Civitai</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Refresh metadata from Civitai
          </TooltipContent>
        </Tooltip>
        )}
        {(file.matchStatus === 'unmatched' ||
          (file.matchStatus === undefined && !file.modelVersionId)) && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    const updated = await refreshMetadataFromCivitai(file.hash);
                    if (updated) {
                      onRefresh?.(updated);
                      toast({ title: 'Matched on Civitai' });
                    }
                  } catch (err) {
                    toast({
                      variant: 'destructive',
                      title: 'No match on Civitai',
                      description:
                        err instanceof Error ? err.message : 'Model may not exist on Civitai',
                    });
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                <span className="sr-only">Try match on Civitai</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Try match on Civitai
            </TooltipContent>
          </Tooltip>
          <FileLinkToCivitai file={file} onLinked={onRefresh} />
        </>
        )}
        {file.civitaiUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <a
                  href={`${file.civitaiUrl}?modelVersionId=${file.modelVersionId}`}
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="sr-only">Open Model on Civitai</span>
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open Model on Civitai</TooltipContent>
          </Tooltip>
        ) : null}
        {file.localPath ? (
          <FileFetchMetadata
            localPath={file.localPath}
            metadata={file.metadata}
            hash={file.hash}
          />
        ) : null}
        {file.trainedWords && file.trainedWords.length > 0 ? (
          <>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      file.trainedWords?.join(', ') || '',
                    );
                    setIsCopied(true);
                  }}
                >
                  {isCopied ? (
                    <Check className="w-4 h-4" color="green" />
                  ) : (
                    <ClipboardCopy className="h-4 w-4" />
                  )}
                  <span className="sr-only">Copy All Trigger Words</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Copy All Trigger Words
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <FileItemDelete resource={file} />
      </div>
    </div>
  );
}
