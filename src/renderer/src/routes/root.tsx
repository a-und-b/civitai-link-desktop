import { PrimaryLayout } from '@/layout/primary-layout';
import { useEffect } from 'react';
import { useApi } from '@/hooks/use-api';

export default function Root() {
  const { init } = useApi();

  useEffect(() => {
    console.log('[Root] App loaded, calling init()...');
    init();
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="titlebar border-b border-border" />
      <PrimaryLayout />
    </div>
  );
}
