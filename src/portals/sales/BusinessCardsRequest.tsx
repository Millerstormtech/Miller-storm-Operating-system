export function BusinessCardsRequest() {
  return (
    <div className="business-cards">
      <div className="panel-header">Tools/ Apps</div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Quantity</span>
          <input className="field-input" type="number" defaultValue={250} />
        </label>
        <label className="field">
          <span className="field-label">Notes for marketing</span>
          <textarea
            className="field-input"
            rows={3}
            placeholder="Any special instructions?"
          />
        </label>
      </div>
      <button
        className="btn-primary"
        onClick={() => alert("Business card request submitted (placeholder).")}
      >
        Submit Request
      </button>
    </div>
  );
}
