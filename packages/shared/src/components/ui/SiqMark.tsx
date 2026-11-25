export function SiqMark({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="SIQ" className={`siq-mark ${className ?? ""}`}>
      <span aria-hidden="true" className="siq-mark-s" />
      <span aria-hidden="true" className="siq-mark-i" />
      <span aria-hidden="true" className="siq-mark-q" />
    </span>
  );
}
