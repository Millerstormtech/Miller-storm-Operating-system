export function Placeholder(props: { title: string; description: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{props.title}</div>
      <div className="placeholder-description">{props.description}</div>
    </div>
  );
}
