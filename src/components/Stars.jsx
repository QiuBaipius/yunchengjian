export default function Stars({ value, onChange }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={n <= value ? 'star on' : 'star'} onClick={() => onChange(n)}>
          ★
        </button>
      ))}
    </div>
  )
}
