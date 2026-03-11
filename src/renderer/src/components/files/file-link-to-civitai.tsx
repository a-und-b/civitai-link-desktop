import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useApi } from '@/hooks/use-api';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type FileLinkToCivitaiProps = {
  file: Resource;
  onLinked?: (file: Resource) => void;
};

export function FileLinkToCivitai({ file, onLinked }: FileLinkToCivitaiProps) {
  const { linkToCivitai } = useApi();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLink = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const updated = await linkToCivitai({
        hash: file.hash,
        modelVersionIdOrUrl: input.trim(),
      });
      if (updated) {
        onLinked?.(updated);
        setOpen(false);
        setInput('');
        toast({ title: 'Linked to Civitai' });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to link',
        description:
          err instanceof Error ? err.message : 'Invalid URL or version ID',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <Link2 className="h-4 w-4" />
              <span className="sr-only">Link to Civitai</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Link to Civitai model (paste URL or version ID)
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to Civitai</DialogTitle>
          <DialogDescription>
            Paste a Civitai model URL or model version ID to link this local file
            to its Civitai listing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="civitai-link">Civitai URL or Version ID</Label>
            <Input
              id="civitai-link"
              placeholder="https://civitai.com/models/123?modelVersionId=456 or 456"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={loading || !input.trim()}>
            {loading ? 'Linking...' : 'Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
