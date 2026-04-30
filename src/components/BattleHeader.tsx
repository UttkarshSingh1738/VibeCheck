export function BattleHeader({
  hostName,
  oppName
}: {
  hostName: string;
  oppName: string;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="text-lg font-semibold">{hostName}</div>
      <div className="text-sm uppercase tracking-widest text-zinc-500">vs</div>
      <div className="text-lg font-semibold">{oppName}</div>
    </div>
  );
}
