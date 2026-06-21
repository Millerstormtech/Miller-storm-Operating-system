import { useState } from "react";

type Material = {
  id: string;
  name: string;
  category: string;
  status: "Pending" | "Approved" | "Rejected";
};

const materials: Material[] = [
  {
    id: "door-flyer",
    name: "Door Hanger Flyer",
    category: "Print",
    status: "Approved"
  },
  {
    id: "neighborhood-mailer",
    name: "Neighborhood Mailer",
    category: "Direct Mail",
    status: "Pending"
  },
  {
    id: "social-carousel",
    name: "Social Carousel Post",
    category: "Social",
    status: "Approved"
  }
];

export function MarketingMaterials() {
  const [category, setCategory] = useState("All");

  const filtered = materials.filter((m) =>
    category === "All" ? true : m.category === category
  );

  return (
    <div className="materials-page">
      <div className="panel-header">Marketing Materials</div>
      <div className="field">
        <span className="field-label">Filter by category</span>
        <select
          className="field-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>All</option>
          <option>Print</option>
          <option>Direct Mail</option>
          <option>Social</option>
        </select>
      </div>
      <div className="materials-grid">
        {filtered.map((material) => (
          <div key={material.id} className="card material-card">
            <div className="card-title">{material.name}</div>
            <div className="card-description">{material.category}</div>
            <div className={`status-badge status-${material.status.toLowerCase()}`}>
              {material.status}
            </div>
            <div className="card-actions">
              <button className="btn-secondary">Download</button>
              <button className="btn-ghost">Request Print</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
