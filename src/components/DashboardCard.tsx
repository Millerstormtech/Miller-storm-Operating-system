type DashboardCardProps = {
  title: string;
  value: string;
  description?: string;
};

export function DashboardCard(props: DashboardCardProps) {
  return (
    <div className="card">
      <div className="card-title">{props.title}</div>
      <div className="card-value">{props.value}</div>
      {props.description && (
        <div className="card-description">{props.description}</div>
      )}
    </div>
  );
}
