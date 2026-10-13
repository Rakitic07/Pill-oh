interface Props {
  taken: number;
  total: number;
}

export function ProgressRing({ taken, total }: Props) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = total ? taken / total : 0;

  return (
    <div className="ring clay-inset">
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="ring-value"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="ring-label">
        <strong>{Math.round(pct * 100)}%</strong>
        <span>
          {taken}/{total} taken
        </span>
      </div>
    </div>
  );
}
