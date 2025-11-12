import { useAssets } from '../hooks/useAssets';
import { MediaCard } from '../components/media/MediaCard';
import { useJobsSocket } from '../hooks/useJobsSocket';

export function AssetsRoute() {
  const { items, loadMore, loading, error, hasMore } = useAssets();
  const jobsSocket = useJobsSocket({ autoConnect: true });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Assets</h1>
        <div className="text-xs text-neutral-500">
          Jobs WS: {jobsSocket.connected ? 'connected' : 'disconnected'}
        </div>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map(a => (
          <MediaCard
            key={a.id}
            id={a.id}
            mediaType={a.media_type}
            providerId={a.provider_id}
            providerAssetId={a.provider_asset_id}
            thumbUrl={a.thumbnail_url}
            remoteUrl={a.remote_url}
            width={a.width}
            height={a.height}
            durationSec={a.duration_sec}
            tags={a.tags}
            description={a.description}
            createdAt={a.created_at}
            status={a.sync_status}
          />
        ))}
      </div>
      <div className="pt-4">
        {hasMore && (
          <button disabled={loading} onClick={loadMore} className="border px-4 py-2 rounded">
            {loading ? 'Loading...' : 'Load More'}
          </button>
        )}
        {!hasMore && <div className="text-sm text-neutral-500">No more assets</div>}
      </div>
    </div>
  );
}
