import { FileActions } from '@/components/files/file-actions';
import { FileNotes } from '@/components/files/file-notes';
import { Badge, TypeBadge } from '@/components/ui/badge';
import { SafeHtml } from '@/components/ui/safe-html';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useApi } from '@/hooks/use-api';
import { cn, getResourceDisplayName, isVideoPreview } from '@/lib/utils';
import dayjs from 'dayjs';
import { Check, Copy, DownloadCloud, Image } from 'lucide-react';
import prettyBytes from 'pretty-bytes';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function File() {
  const { hash } = useParams();
  const { getFileByHash } = useApi();
  const [isCopied, setIsCopied] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [file, setFile] = useState<Resource | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    const fetchFile = async () => {
      if (hash) {
        const fileByHash = await getFileByHash(hash);
        setFile(fileByHash);
      }
    };

    fetchFile();
  }, [hash]);

  useEffect(() => {
    setTimeout(() => {
      setIsCopied(null);
    }, 4000);
  }, [isCopied]);

  // This is due to react-router not resetting state
  useEffect(() => {
    setImageFailed(false);
    setIsCopied(null);
    setPreviewKey((k) => k + 1);
  }, [hash]);

  if (!file) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <FileActions
        file={file}
        onRefresh={(updated) => {
          setFile(updated);
          setImageFailed(false);
          setPreviewKey((k) => k + 1);
        }}
      />
      <Separator />
      <ScrollArea className="h-full">
        <div className="p-4 gap-2 flex flex-col pb-16">
          {file.previewImageUrl && !imageFailed ? (
            isVideoPreview(file.previewImageUrl) ? (
              <video
                key={previewKey}
                src={file.previewImageUrl}
                className="aspect-square object-cover object-center rounded-lg max-w-80"
                muted
                loop
                playsInline
                autoPlay
                onError={() => {
                  console.warn('[Preview] Video failed to load:', file.previewImageUrl);
                  setImageFailed(true);
                }}
                onLoadedData={() =>
                  console.log('[Preview] Video loaded successfully:', file.previewImageUrl)
                }
              />
            ) : (
              <img
                key={previewKey}
                src={file.previewImageUrl}
                alt={getResourceDisplayName(file)}
                className="aspect-square object-cover object-center rounded-lg max-w-80"
                onError={() => {
                  console.warn('[Preview] Image failed to load:', file.previewImageUrl);
                  setImageFailed(true);
                }}
                onLoad={() =>
                  console.log('[Preview] Image loaded successfully:', file.previewImageUrl)
                }
              />
            )
          ) : (
            <div className="bg-card w-12 h-12 rounded flex items-center justify-center">
              <Image size={24} />
            </div>
          )}
          <h1>{getResourceDisplayName(file)}</h1>
          <p className="text-[10px] dark:text-[#909296]">{file.name}</p>
          <table>
            <tbody>
              <tr>
                <td>Type</td>
                <td>
                  <TypeBadge type={file?.type} />
                </td>
              </tr>
              <tr>
                <td>Version</td>
                <td>
                  <Badge variant="outline">
                    {file.modelVersionName ?? 'Local file'}
                  </Badge>
                  {file.matchStatus === 'unmatched' && (
                    <Badge variant="secondary" className="ml-1">
                      Unmatched
                    </Badge>
                  )}
                </td>
              </tr>
              {file.downloadDate ? (
                <tr>
                  <td>Downloaded</td>
                  <td>
                    <p className="flex items-center">
                      <DownloadCloud
                        className="mr-1"
                        size={12}
                        color="#909296"
                      />
                      {dayjs(file.downloadDate).fromNow()}
                    </p>
                  </td>
                </tr>
              ) : null}
              {file.fileSize ? (
                <tr>
                  <td>File Size</td>
                  <td>{prettyBytes(file.fileSize)}</td>
                </tr>
              ) : null}
              {file.baseModel ? (
                <tr>
                  <td>Base Model</td>
                  <td>{file.baseModel}</td>
                </tr>
              ) : null}
              {file.trainedWords && file.trainedWords.length > 0 ? (
                <tr>
                  <td>Trigger Words</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {file.trainedWords.map((word, i) => (
                        <Badge
                          variant="modelTag"
                          className={cn('cursor-pointer', {
                            '!dark:bg-[#2f9e44]/20 !bg-[#2f9e44]/20 !text-[#B2F2BB] !dark:text-[#B2F2BB]':
                              isCopied === i,
                          })}
                          onClick={() => {
                            navigator.clipboard.writeText(word);
                            setIsCopied(i);
                          }}
                          key={`${word}-${i}`}
                        >
                          {word}{' '}
                          <span className="ml-1">
                            {isCopied === i ? (
                              <Check size={10} color="green" />
                            ) : (
                              <Copy size={10} className="cursor-pointer" />
                            )}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {file.description?.trim() ? (
            <div className="bg-[#25262b] w-full px-3 py-2 mt-4 rounded-sm">
              <p className="text-[#909296] text-sm mb-2">Description</p>
              <div className="max-h-64 overflow-y-auto">
                <SafeHtml html={file.description} />
              </div>
            </div>
          ) : null}
          <FileNotes file={file} />
        </div>
      </ScrollArea>
    </div>
  );
}
