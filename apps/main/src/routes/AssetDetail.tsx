import { useParams } from 'react-router-dom';
import { useAsset } from '@features/assets';

export function AssetDetailRoute() {
  const { id } = useParams();
  const numericId = id ? Number(id) : null;
  const { asset, loading, error } = useAsset(numericId);
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Asset Detail</h1>
      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {asset && (
        <pre className="text-xs bg-neutral-100 p-3 rounded overflow-auto max-h-[50vh]">{JSON.stringify(asset, null, 2)}</pre>
      )}
    </div>
  );
}
