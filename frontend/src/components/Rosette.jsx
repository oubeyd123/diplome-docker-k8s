// Guilloché rosette, the pattern printed on banknotes and certificates.
export default function Rosette() {
  const n = 28;
  return (
    <svg className="rosette" viewBox="-100 -100 200 200" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={i} rx="92" ry="34" transform={`rotate(${(i * 180) / n})`} />
      ))}
      <circle r="12" />
      <circle r="96" />
    </svg>
  );
}
