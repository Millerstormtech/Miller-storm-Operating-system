import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtCount } from "../../../lib/scoreboard/display";
import { FIELD_LABELS, FIRST_MONTH, DEFAULT_COMMISSION_PER_ROOF, MIN_WEEKLY_DOORS, MIN_WEEKLY_CLAIMS, type WeeklyField } from "../../../lib/dmo/config";
import { incomePlan, type Bar, type Colour, type FormState, type ChipState } from "../../../lib/dmo/rules";
import { daysInMonth, addDays, monthName } from "../../../lib/dmo/calendar";
import type { DmoBoard } from "../../../lib/dmo/load";
import type { GroupDmo, PersonDmo, CommitmentView } from "../../../lib/dmo/view";

// The DMO (Jay, 2026-10-02): each person's monthly goal and weekly commitment,
// tracked against their real numbers, and rolled up the chain. One component
// for all four roles. What each viewer sees is decided on the server by
// /api/dmo (a rep only ever receives themselves), and every colour comes from
// src/lib/dmo/rules.ts there: nothing here decides who is on pace.

const CARD: React.CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  padding: "15px 16px",
  minWidth: 0,
};

const CAP: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  fontWeight: 600,
};

const BTN: React.CSSProperties = {
  background: "var(--brand-fill)",
  color: "var(--text-inverse)",
  border: "none",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const BTN_QUIET: React.CSSProperties = {
  background: "transparent",
  color: "var(--brand-on-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--surface-default)",
  color: "var(--text-primary)",
  fontVariantNumeric: "tabular-nums",
};

const COLOUR_VAR: Record<Colour, string> = {
  green: "var(--trend-up)",
  yellow: "var(--warning-on-surface)",
  red: "var(--trend-down)",
};

const colourVar = (c: Colour | null) => (c ? COLOUR_VAR[c] : "var(--text-subtle)");

const CHIP_LABEL: Record<ChipState, string> = {
  met: "Minimum met",
  "at-contract": "At contract",
  "on-pace": "On pace",
  "at-risk": "At risk",
  "off-pace": "Off pace",
  missed: "Missed the minimum",
  ramp: "Ramp",
  away: "Away",
};

const FORM_LABEL: Record<FormState, string> = {
  "not-open": "Opens Thursday",
  due: "Not done yet",
  overdue: "Not done",
  done: "Done",
  late: "Done late",
};

function fmtField(field: WeeklyField, n: number): string {
  return field === "contractDollars" ? fmtMoney(n) : fmtCount(Math.round(n));
}

function plural(n: number, word: string): string {
  return `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) + " CT";
}

function Dot(props: { colour: Colour | null }) {
  return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: colourVar(props.colour), flex: "none" }} />;
}

function Chip(props: { person: PersonDmo }) {
  const c = props.person.chip;
  const label = c.state === "ramp" ? `Ramp: day ${c.rampDay} of 90` : CHIP_LABEL[c.state];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: colourVar(c.colour), whiteSpace: "nowrap" }}>
      <Dot colour={c.colour} />
      {label}
    </span>
  );
}

function BarRow(props: { bar: Bar }) {
  const { bar } = props;
  const width = bar.target > 0 ? Math.min(100, (bar.actual / bar.target) * 100) : 100;
  const paceAt = bar.target > 0 ? Math.min(100, (bar.pace / bar.target) * 100) : 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{FIELD_LABELS[bar.field]}</span>
        <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
          <b style={{ color: colourVar(bar.colour) }}>{fmtField(bar.field, bar.actual)}</b> / {fmtField(bar.field, bar.target)}
          <span style={{ color: "var(--text-subtle)" }}> (pace {fmtField(bar.field, bar.pace)})</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--surface-muted)", marginTop: 5, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${width}%`, background: colourVar(bar.colour), borderRadius: 4 }} />
        {bar.pace > 0 && paceAt < 100 && (
          <div title="Where you should be today" style={{ position: "absolute", top: 0, bottom: 0, left: `${paceAt}%`, width: 2, background: "var(--text-primary)", opacity: 0.45 }} />
        )}
      </div>
    </div>
  );
}

function Commitment(props: { c: CommitmentView; names: Record<string, string> }) {
  const { c } = props;
  return (
    <div style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--text-muted)" }}>
      {(Object.keys(FIELD_LABELS) as WeeklyField[]).map((f) => {
        const changed = c.original[f] !== c.commitment[f];
        const by = changed ? [...c.adjustments].reverse().find((a) => a.field === f) : null;
        return (
          <div key={f} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{FIELD_LABELS[f]}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>
              {changed ? (
                <>
                  <s style={{ color: "var(--text-subtle)" }}>{fmtField(f, c.original[f])}</s>{" "}
                  <b>{fmtField(f, c.commitment[f])}</b>
                  <span style={{ color: "var(--text-subtle)" }}> (changed by {by ? props.names[by.byUserId] || "your Team Lead" : "your Team Lead"})</span>
                </>
              ) : (
                <b>{fmtField(f, c.commitment[f])}</b>
              )}
            </span>
          </div>
        );
      })}
      {c.away && (
        <div style={{ marginTop: 4, color: "var(--text-subtle)" }}>
          Away {dayLabel(c.away.from)} to {dayLabel(c.away.to)}{c.away.reason ? ` (${c.away.reason})` : ""}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The two forms
// ---------------------------------------------------------------------------

function NumberField(props: { label: string; value: string; onChange: (v: string) => void; money?: boolean; hint?: string; disabled?: boolean }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>{props.label}</span>
      <div style={{ position: "relative" }}>
        {props.money && <span style={{ position: "absolute", left: 10, top: 10, color: "var(--text-subtle)" }}>$</span>}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={props.value}
          disabled={props.disabled}
          onChange={(e) => props.onChange(e.target.value)}
          style={{ ...INPUT, paddingLeft: props.money ? 22 : 10 }}
        />
      </div>
      {props.hint && <span style={{ display: "block", fontSize: 12, color: "var(--text-subtle)", marginTop: 4 }}>{props.hint}</span>}
    </label>
  );
}

const GRID: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 };

function WeeklyForm(props: { me: PersonDmo; onSaved: () => void; onClose: () => void }) {
  const { me } = props;
  const form = me.weeklyForm;
  const start = form.commitment?.commitment || me.thisWeek.commitment?.commitment || { doors: MIN_WEEKLY_DOORS, claims: MIN_WEEKLY_CLAIMS, contracts: 0, contractDollars: 0 };
  const [values, setValues] = useState<Record<WeeklyField, string>>({
    doors: String(start.doors),
    claims: String(start.claims),
    contracts: String(start.contracts),
    contractDollars: String(start.contractDollars),
  });
  const existingAway = form.commitment?.away;
  const [away, setAway] = useState(!!existingAway);
  const [awayFrom, setAwayFrom] = useState(existingAway?.from || form.forWeekOf);
  const [awayTo, setAwayTo] = useState(existingAway?.to || addDays(form.forWeekOf, 6));
  const [reason, setReason] = useState(existingAway?.reason || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = !!form.commitment && !form.canAdjust;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/dmo/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doors: Number(values.doors),
          claims: Number(values.claims),
          contracts: Number(values.contracts),
          contractDollars: Number(values.contractDollars),
          away: away ? { from: awayFrom, to: awayTo, reason } : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      props.onSaved();
    } catch (e: any) {
      setError(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const recap = me.thisWeek.commitment;
  return (
    <div style={{ ...CARD, borderColor: "var(--brand-fill)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>Weekly DMO</span>
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Due {timeLabel(form.due)}</span>
      </div>

      <div style={{ ...CAP, marginTop: 14 }}>This week so far</div>
      {recap ? (
        <div style={{ display: "grid", gap: 4, marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
          {(Object.keys(FIELD_LABELS) as WeeklyField[]).map((f) => (
            <div key={f} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{FIELD_LABELS[f]}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                committed {fmtField(f, recap.commitment[f])}, <b style={{ color: "var(--text-primary)" }}>did {fmtField(f, me.thisWeek.actual[f])}</b>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-subtle)" }}>
          No commitment for this week. So far: {plural(me.thisWeek.actual.doors, "door")}, {plural(me.thisWeek.actual.claims, "claim")}, {plural(me.thisWeek.actual.contracts, "contract")}, {fmtMoney(me.thisWeek.actual.contractDollars)}.
        </div>
      )}

      <div style={{ ...CAP, marginTop: 18 }}>Next week, {dayLabel(form.forWeekOf)} to {dayLabel(addDays(form.forWeekOf, 6))}</div>
      <div style={{ ...GRID, marginTop: 8 }}>
        <NumberField label="Doors" value={values.doors} disabled={locked} onChange={(v) => setValues({ ...values, doors: v })} />
        <NumberField label="Claims" value={values.claims} disabled={locked} onChange={(v) => setValues({ ...values, claims: v })} />
        <NumberField label="Contracts" value={values.contracts} disabled={locked} onChange={(v) => setValues({ ...values, contracts: v })} />
        <NumberField label="Contract $" money value={values.contractDollars} disabled={locked} onChange={(v) => setValues({ ...values, contractDollars: v })} />
      </div>
      {!form.floorExempt && !error && (
        <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 8 }}>
          Your minimum is {MIN_WEEKLY_DOORS} doors or {MIN_WEEKLY_CLAIMS} claim a week. You can always commit to more.
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 14, color: "var(--text-primary)" }}>
        <input type="checkbox" checked={away} disabled={locked} onChange={(e) => setAway(e.target.checked)} />
        I'll be away (vacation, out of town)
      </label>
      {away && (
        <div style={{ ...GRID, marginTop: 8 }}>
          <label style={{ fontSize: 13, color: "var(--text-primary)" }}>
            From
            <input type="date" value={awayFrom} disabled={locked} onChange={(e) => setAwayFrom(e.target.value)} style={{ ...INPUT, marginTop: 5 }} />
          </label>
          <label style={{ fontSize: 13, color: "var(--text-primary)" }}>
            To
            <input type="date" value={awayTo} disabled={locked} onChange={(e) => setAwayTo(e.target.value)} style={{ ...INPUT, marginTop: 5 }} />
          </label>
          <label style={{ fontSize: 13, color: "var(--text-primary)" }}>
            Reason
            <input type="text" value={reason} maxLength={200} disabled={locked} onChange={(e) => setReason(e.target.value)} style={{ ...INPUT, marginTop: 5 }} />
          </label>
        </div>
      )}

      {error && <div style={{ marginTop: 12, fontSize: 14, color: "var(--trend-down)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
        {locked ? (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Next week's numbers locked at 5:00 PM Friday.</span>
        ) : (
          <button type="button" style={{ ...BTN, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
            {saving ? "Saving..." : form.commitment ? "Save changes" : "Submit"}
          </button>
        )}
        <button type="button" style={BTN_QUIET} onClick={props.onClose}>Close</button>
      </div>
    </div>
  );
}

function MonthlyForm(props: { me: PersonDmo; onSaved: () => void; onClose: () => void }) {
  const form = props.me.monthlyForm;
  const plan = form.plan;
  const [income, setIncome] = useState(plan ? String(plan.incomeGoal) : "");
  const [commission, setCommission] = useState(String(plan ? plan.commissionPerRoof : DEFAULT_COMMISSION_PER_ROOF));
  const [doors, setDoors] = useState(plan ? String(plan.doors) : "");
  const [claims, setClaims] = useState(plan ? String(plan.claims) : "");
  const [claimsTouched, setClaimsTouched] = useState(!!plan);
  const [dollars, setDollars] = useState(plan ? String(plan.contractDollars) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const calc = incomePlan(Number(income), Number(commission), daysInMonth(form.month));
  // Until the person types their own claims number, it follows the calculator.
  const shownClaims = claimsTouched ? claims : calc ? String(calc.claimsNeeded) : claims;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/dmo/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incomeGoal: Number(income),
          commissionPerRoof: Number(commission),
          doors: Number(doors),
          claims: Number(shownClaims),
          contractDollars: Number(dollars),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      props.onSaved();
    } catch (e: any) {
      setError(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...CARD, borderColor: "var(--brand-fill)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>Monthly DMO: {monthLabel(form.month)}</span>
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Due before midnight on the 1st</span>
      </div>
      <div style={{ ...GRID, marginTop: 14 }}>
        <NumberField label="Monthly income goal" money value={income} onChange={setIncome} />
        <NumberField label="Average commission per roof" money value={commission} onChange={setCommission} hint="About $5,000 for a solo deal" />
      </div>
      {calc && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "var(--surface-muted)", fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>
          {fmtMoney(Number(income))} / {fmtMoney(Number(commission))} per roof = <b>{calc.roofsNeeded} roofs</b>. About half of claims become roofs, so you need <b>{calc.claimsNeeded} claims</b> (about {calc.weeklyClaims} a week).
        </div>
      )}
      <div style={{ ...GRID, marginTop: 14 }}>
        <NumberField label="Doors this month" value={doors} onChange={setDoors} />
        <NumberField label="Claims this month" value={shownClaims} onChange={(v) => { setClaimsTouched(true); setClaims(v); }} />
        <NumberField label="Contract $ this month" money value={dollars} onChange={setDollars} />
      </div>
      {error && <div style={{ marginTop: 12, fontSize: 14, color: "var(--trend-down)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" style={{ ...BTN, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
          {saving ? "Saving..." : plan ? "Save changes" : "Submit"}
        </button>
        <button type="button" style={BTN_QUIET} onClick={props.onClose}>Close</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// My own DMO
// ---------------------------------------------------------------------------

function DueBanner(props: { text: string; overdue: boolean; action: string; onClick: () => void }) {
  return (
    <div style={{ ...CARD, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderColor: props.overdue ? "var(--trend-down)" : "var(--brand-fill)", marginBottom: 11 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: props.overdue ? "var(--trend-down)" : "var(--text-primary)" }}>{props.text}</span>
      <button type="button" style={BTN} onClick={props.onClick}>{props.action}</button>
    </div>
  );
}

function MyDmo(props: { me: PersonDmo; names: Record<string, string>; reload: () => void }) {
  const { me } = props;
  const [open, setOpen] = useState<"weekly" | "monthly" | null>(null);
  const w = me.weeklyForm;
  const m = me.monthlyForm;
  const saved = () => { setOpen(null); props.reload(); };

  return (
    <div style={{ display: "grid", gap: 11 }}>
      {open !== "monthly" && (m.state === "due" || m.state === "overdue") && (
        <DueBanner
          text={m.state === "overdue" ? `Your ${monthLabel(m.month)} DMO is late.` : `Your ${monthLabel(m.month)} DMO is due before midnight on the 1st.`}
          overdue={m.state === "overdue"}
          action="Fill it in"
          onClick={() => setOpen("monthly")}
        />
      )}
      {open !== "weekly" && (w.state === "due" || w.state === "overdue") && (
        <DueBanner
          text={w.state === "overdue" ? "Your weekly DMO was due Friday at 1:00 PM." : `Your weekly DMO is due ${timeLabel(w.due)}.`}
          overdue={w.state === "overdue"}
          action="Fill it in"
          onClick={() => setOpen("weekly")}
        />
      )}
      {open === "weekly" && <WeeklyForm me={me} onSaved={saved} onClose={() => setOpen(null)} />}
      {open === "monthly" && <MonthlyForm me={me} onSaved={saved} onClose={() => setOpen(null)} />}

      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={CAP}>Weekly minimum</span>
          <Chip person={me} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginTop: 10, flexWrap: "wrap" }}>
          {[
            { label: "Doors", value: `${fmtCount(me.minimum.doors)} / ${MIN_WEEKLY_DOORS}` },
            { label: "Claims filed", value: `${fmtCount(me.minimum.claims)} / ${MIN_WEEKLY_CLAIMS}` },
            { label: "Month average (last 90 days)", value: `${fmtMoney(me.minimum.monthlyContractAverage)} / $40K` },
          ].map((box, i) => (
            <div key={box.label} style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 160px" }}>
              {i > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-subtle)" }}>OR</span>}
              <div style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border-default)" }}>
                <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{box.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{box.value}</div>
              </div>
            </div>
          ))}
        </div>
        {me.chip.state !== "met" && me.chip.state !== "at-contract" && me.chip.doorsPace > 0 && (
          <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 8 }}>Pace for today: {fmtCount(Math.round(me.chip.doorsPace))} doors</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 11 }}>
        <div style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={CAP}>This week</span>
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{dayLabel(me.thisWeek.weekOf)} to {dayLabel(addDays(me.thisWeek.weekOf, 6))}</span>
          </div>
          {me.thisWeek.commitment ? (
            me.thisWeek.bars.map((b) => <BarRow key={b.field} bar={b} />)
          ) : (
            <div style={{ marginTop: 10, fontSize: 14, color: "var(--text-muted)" }}>No commitment for this week. Your weekly DMO on Friday sets next week's.</div>
          )}
        </div>
        <div style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={CAP}>{monthLabel(me.thisMonth.month)}</span>
            {me.thisMonth.plan && <button type="button" style={{ ...BTN_QUIET, padding: "2px 8px", fontSize: 12 }} onClick={() => setOpen("monthly")}>Edit</button>}
          </div>
          {me.thisMonth.plan ? (
            <>
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}>
                Income goal <b style={{ color: "var(--text-primary)" }}>{fmtMoney(me.thisMonth.plan.incomeGoal)}</b>
                {me.thisMonth.income && <>, which needs {plural(me.thisMonth.income.roofsNeeded, "roof")} and {plural(me.thisMonth.income.claimsNeeded, "claim")}</>}
              </div>
              {me.thisMonth.bars.map((b) => <BarRow key={b.field} bar={b} />)}
            </>
          ) : (
            <div style={{ marginTop: 10, fontSize: 14, color: "var(--text-muted)" }}>
              {me.thisMonth.month < FIRST_MONTH ? `Monthly DMOs start in ${monthName(FIRST_MONTH)}.` : "No monthly DMO for this month yet."}
            </div>
          )}
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={CAP}>Next week ({dayLabel(w.forWeekOf)})</span>
          <span style={{ fontSize: 12, color: w.state === "overdue" ? "var(--trend-down)" : "var(--text-subtle)" }}>{FORM_LABEL[w.state]}</span>
        </div>
        {w.commitment ? (
          <div style={{ marginTop: 10 }}><Commitment c={w.commitment} names={props.names} /></div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 14, color: "var(--text-muted)" }}>
            {w.state === "not-open" ? "Your weekly DMO opens Thursday and is due Friday at 1:00 PM." : "Not sent yet."}
          </div>
        )}
        {w.state !== "not-open" && open !== "weekly" && (!w.commitment || w.canAdjust) && (
          <button type="button" style={{ ...BTN_QUIET, marginTop: 12 }} onClick={() => setOpen("weekly")}>
            {w.commitment ? "Edit" : "Fill in your weekly DMO"}
          </button>
        )}
        {(m.state === "done" || m.state === "late") && open !== "monthly" && m.month !== me.thisMonth.month && (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-subtle)" }}>{monthLabel(m.month)} DMO sent.</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaders: the roll-up and everyone below
// ---------------------------------------------------------------------------

function GroupCard(props: { g: GroupDmo; title: string; ownerLabel?: string; active?: boolean; onClick?: () => void }) {
  const { g } = props;
  return (
    <div
      role={props.onClick ? "button" : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      onClick={props.onClick}
      onKeyDown={(e) => { if (props.onClick && (e.key === "Enter" || e.key === " ")) props.onClick(); }}
      style={{ ...CARD, cursor: props.onClick ? "pointer" : "default", borderColor: props.active ? "var(--brand-fill)" : "var(--border-default)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{props.title}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: colourVar(g.colour) }}>
          <Dot colour={g.colour} />
          {g.counted > 0 ? `${g.green} / ${g.counted} green` : "No reps past ramp"}
        </span>
      </div>
      {props.ownerLabel && <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>{props.ownerLabel}</div>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}>
        <span>Weekly DMOs <b style={{ color: "var(--text-primary)" }}>{g.weeklyDone} / {g.members}</b></span>
        {g.monthlyDue && <span>Monthly <b style={{ color: "var(--text-primary)" }}>{g.monthlyDone} / {g.members}</b></span>}
      </div>
      {g.thisWeek.bars.length > 0 ? (
        g.thisWeek.bars.map((b) => <BarRow key={b.field} bar={b} />)
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-subtle)" }}>No commitments for this week yet.</div>
      )}
      <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--border-default)", fontSize: 12, color: "var(--text-subtle)" }}>
        Next week so far ({g.nextWeek.submitted} sent): {plural(g.nextWeek.commitment.doors, "door")}, {plural(g.nextWeek.commitment.claims, "claim")}, {plural(g.nextWeek.commitment.contracts, "contract")}, {fmtMoney(g.nextWeek.commitment.contractDollars)}
      </div>
    </div>
  );
}

const TH: React.CSSProperties = { textAlign: "left", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-subtle)", fontWeight: 600, padding: "8px 10px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "10px", borderBottom: "1px solid var(--border-default)", fontSize: 13, color: "var(--text-muted)", verticalAlign: "top" };

function BarCell(props: { bars: Bar[]; field: WeeklyField; actual: number }) {
  const bar = props.bars.find((b) => b.field === props.field);
  if (!bar) return <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtField(props.field, props.actual)}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      <Dot colour={bar.colour} />
      {fmtField(bar.field, bar.actual)} / {fmtField(bar.field, bar.target)}
    </span>
  );
}

function AdjustRow(props: { person: PersonDmo; onDone: () => void }) {
  const c = props.person.weeklyForm.commitment!;
  const [values, setValues] = useState<Record<WeeklyField, string>>({
    doors: String(c.commitment.doors),
    claims: String(c.commitment.claims),
    contracts: String(c.commitment.contracts),
    contractDollars: String(c.commitment.contractDollars),
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/dmo/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: props.person.userId, ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      props.onDone();
    } catch (e: any) {
      setError(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }
  return (
    <tr>
      <td colSpan={8} style={{ ...TD, background: "var(--surface-subtle)" }}>
        <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600, marginBottom: 8 }}>
          Change {props.person.name}'s numbers for next week. They'll see what they committed and what you changed it to.
        </div>
        <div style={GRID}>
          {(Object.keys(FIELD_LABELS) as WeeklyField[]).map((f) => (
            <NumberField key={f} label={FIELD_LABELS[f]} money={f === "contractDollars"} value={values[f]} onChange={(v) => setValues({ ...values, [f]: v })} />
          ))}
        </div>
        {error && <div style={{ marginTop: 8, color: "var(--trend-down)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button type="button" style={{ ...BTN, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" style={BTN_QUIET} onClick={props.onDone}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}

function PeopleTable(props: { people: PersonDmo[]; canAdjust: boolean; viewerId: string; names: Record<string, string>; reload: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (props.people.length === 0) {
    return <div style={{ ...CARD, fontSize: 14, color: "var(--text-muted)" }}>Nobody here yet.</div>;
  }
  return (
    <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
        <thead>
          <tr>
            <th style={TH}>Name</th>
            <th style={TH}>Minimum</th>
            <th style={TH}>Doors</th>
            <th style={TH}>Claims</th>
            <th style={TH}>Contracts</th>
            <th style={TH}>Contract $</th>
            <th style={TH}>Weekly DMO</th>
            <th style={TH}>Next week</th>
          </tr>
        </thead>
        <tbody>
          {props.people.map((p) => {
            const next = p.weeklyForm.commitment;
            const changeable = props.canAdjust && p.userId !== props.viewerId && !!next && p.weeklyForm.canAdjust;
            return [
              <tr key={p.userId}>
                <td style={{ ...TD, color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>
                  {p.name}
                  <div style={{ fontSize: 12, fontWeight: 400, color: "var(--text-subtle)" }}>{p.team || "No team"}</div>
                </td>
                <td style={TD}><Chip person={p} /></td>
                <td style={TD}><BarCell bars={p.thisWeek.bars} field="doors" actual={p.thisWeek.actual.doors} /></td>
                <td style={TD}><BarCell bars={p.thisWeek.bars} field="claims" actual={p.thisWeek.actual.claims} /></td>
                <td style={TD}><BarCell bars={p.thisWeek.bars} field="contracts" actual={p.thisWeek.actual.contracts} /></td>
                <td style={TD}><BarCell bars={p.thisWeek.bars} field="contractDollars" actual={p.thisWeek.actual.contractDollars} /></td>
                <td style={{ ...TD, color: p.weeklyForm.state === "overdue" ? "var(--trend-down)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {FORM_LABEL[p.weeklyForm.state]}
                  {p.monthlyForm.state === "overdue" && <div style={{ fontSize: 12, color: "var(--trend-down)" }}>Monthly not done</div>}
                </td>
                <td style={{ ...TD, whiteSpace: "nowrap" }}>
                  {next ? (
                    <>
                      {plural(next.commitment.doors, "door")}, {plural(next.commitment.claims, "claim")}
                      {next.adjustments.length > 0 && <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>changed</div>}
                      {next.away && <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>away {dayLabel(next.away.from)} to {dayLabel(next.away.to)}</div>}
                    </>
                  ) : (
                    <span style={{ color: "var(--text-subtle)" }}>&ndash;</span>
                  )}
                  {changeable && editing !== p.userId && (
                    <div><button type="button" style={{ ...BTN_QUIET, padding: "2px 8px", fontSize: 12, marginTop: 4 }} onClick={() => setEditing(p.userId)}>Adjust</button></div>
                  )}
                </td>
              </tr>,
              editing === p.userId ? <AdjustRow key={`${p.userId}-edit`} person={p} onDone={() => { setEditing(null); props.reload(); }} /> : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function DmoPage() {
  const [data, setData] = useState<DmoBoard | null>(null);
  const [variant, setVariant] = useState<string>("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dmo");
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setVariant(json.variant || "");
      setData(json.dmo || null);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const level = data?.scope.level;
  const shown = useMemo(() => {
    if (!data) return [];
    if (!filter) return data.people;
    return data.people.filter((p) => (level === "company" ? p.branch : p.team) === filter);
  }, [data, filter, level]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }} />
          <div style={{ color: "var(--text-muted)" }}>Loading your DMO...</div>
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div style={{ ...CARD, margin: 16 }}>
        <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 6 }}>{variant && !data && !error ? "The DMO is for the sales team" : "The DMO could not load"}</div>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>{error ? "Refresh the page. If it keeps happening, tell an admin." : "Your account has no DMO of its own."}</div>
      </div>
    );
  }

  const leaders = level === "team" || level === "branch" || level === "company";
  const canAdjust = variant === "sales-team-lead" || variant === "branch-manager";

  return (
    <div style={{ padding: "4px 0 30px", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Week of {dayLabel(data.clock.weekOf)} to {dayLabel(addDays(data.clock.weekOf, 6))}
        </span>
      </div>

      {data.me && <MyDmo me={data.me} names={data.names} reload={load} />}

      {leaders && data.total && (
        <>
          <div style={{ ...CAP, marginTop: data.me ? 8 : 0 }}>
            {level === "team" ? "My team" : level === "branch" ? "My branch" : "Company"}
          </div>
          <GroupCard
            g={data.total}
            title={level === "team" ? `Team ${data.total.key}` : level === "branch" ? data.total.key : "Miller Storm"}
          />
        </>
      )}

      {data.slipping.length > 0 && (
        <div style={CARD}>
          <span style={CAP}>Slipping</span>
          {data.slipping.map((g) => (
            <div key={g.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-default)", fontSize: 14 }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Team {g.key}</span>
              <span style={{ color: "var(--text-muted)" }}>
                {g.green} / {g.counted} green. Team Lead: {g.owner}
                {g.branchOwner && g.branchOwner !== g.owner ? `. Branch Manager: ${g.branchOwner}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.groups.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span style={CAP}>{level === "company" ? "Branches" : "Teams"}</span>
            {filter && <button type="button" style={{ ...BTN_QUIET, padding: "2px 8px", fontSize: 12 }} onClick={() => setFilter(null)}>Show everyone</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 11 }}>
            {data.groups.map((g) => (
              <GroupCard
                key={g.key}
                g={g}
                title={level === "company" ? g.key : `Team ${g.key}`}
                ownerLabel={level === "company" ? (g.owner ? `Branch Manager: ${g.owner}` : undefined) : undefined}
                active={filter === g.key}
                onClick={() => setFilter(filter === g.key ? null : g.key)}
              />
            ))}
          </div>
        </>
      )}

      {leaders && (
        <>
          <div style={CAP}>{filter ? (level === "company" ? filter : `Team ${filter}`) : "Everyone"}, red first</div>
          <PeopleTable people={shown} canAdjust={canAdjust} viewerId={data.me?.userId || ""} names={data.names} reload={load} />
        </>
      )}
    </div>
  );
}
