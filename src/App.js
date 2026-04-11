import React, { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Download,
  RotateCcw,
  Upload,
  CloudUpload,
  CloudDownload,
} from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMES = ["Morning", "Afternoon", "Evening"];
const STATES = ["Flexible", "Imogen on duty", "Dodo on duty"];
const SLOT_TYPES = ["Swappable", "Fixed"];
const STORAGE_KEY = "family-shift-planner-v2";

const SUPABASE_URL = "https://agvuwtamocgrgaglipeu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-qvz4SmULEINKVkrtIPHYA_y6Gc-IIi";
const SHARED_PLANNER_ID = "family-main";

function makeInitialSlots() {
  const slots = {};
  for (const day of DAYS) {
    for (const time of TIMES) {
      const key = `${day}-${time}`;
      slots[key] = {
        day,
        time,
        state: "Flexible",
        slotType: "Swappable",
        note: "",
      };
    }
  }
  return slots;
}

function makeInitialData() {
  return {
    weekLabel: "This Week",
    baselineSlots: null,
    slots: makeInitialSlots(),
    selectedKey: "Mon-Morning",
  };
}

function cloneSlots(slots) {
  return JSON.parse(JSON.stringify(slots));
}

function getDutyOwner(state) {
  if (state === "Imogen on duty") return "Imogen";
  if (state === "Dodo on duty") return "Dodo";
  return null;
}

function countCreditsFromBaseline(slots, baselineSlots) {
  if (!baselineSlots) {
    return { imogen: 0, dodo: 0, changedSlots: 0 };
  }

  let imogen = 0;
  let dodo = 0;
  let changedSlots = 0;

  for (const key of Object.keys(slots)) {
    const current = slots[key];
    const baseline = baselineSlots[key];
    if (!current || !baseline) continue;

    const currentOwner = getDutyOwner(current.state);
    const baselineOwner = getDutyOwner(baseline.state);

    if (
      current.state !== baseline.state ||
      current.slotType !== baseline.slotType ||
      current.note !== baseline.note
    ) {
      changedSlots += 1;
    }

    if (current.slotType !== "Swappable" || baseline.slotType !== "Swappable") continue;
    if (currentOwner === baselineOwner) continue;

    if (currentOwner === "Imogen" && baselineOwner !== "Imogen") imogen += 1;
    if (currentOwner === "Dodo" && baselineOwner !== "Dodo") dodo += 1;
  }

  return {
    imogen: Math.max(0, imogen),
    dodo: Math.max(0, dodo),
    changedSlots,
  };
}

function nextState(current) {
  const idx = STATES.indexOf(current);
  return STATES[(idx + 1) % STATES.length];
}

function getSlotColors(state) {
  if (state === "Imogen on duty") {
    return { bg: "#dbeafe", border: "#93c5fd", text: "#0f172a" };
  }
  if (state === "Dodo on duty") {
    return { bg: "#fde68a", border: "#f59e0b", text: "#0f172a" };
  }
  return { bg: "#dcfce7", border: "#86efac", text: "#14532d" };
}

function getSlotBackground(state, slotType) {
  const c = getSlotColors(state);
  if (slotType === "Swappable") {
    return {
      backgroundImage: `repeating-linear-gradient(135deg, ${c.bg} 0px, ${c.bg} 10px, rgba(255,255,255,0.45) 10px, rgba(255,255,255,0.45) 18px)`,
      backgroundColor: c.bg,
    };
  }
  return { background: c.bg };
}

function buttonStyle(active) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: active ? "1px solid #0f172a" : "1px solid #cbd5e1",
    background: active ? "#0f172a" : "white",
    color: active ? "white" : "#0f172a",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  };
}

function miniCardStyle() {
  return {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
  };
}

async function pullSharedPlanner() {
  const url = `${SUPABASE_URL}/rest/v1/planner_state?id=eq.${encodeURIComponent(
    SHARED_PLANNER_ID
  )}&select=data`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

  if (!response.ok) throw new Error(`Pull failed: ${response.status}`);
  const rows = await response.json();
  return rows && rows[0] ? rows[0].data : null;
}

async function pushSharedPlanner(data) {
  const url = `${SUPABASE_URL}/rest/v1/planner_state`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([
      {
        id: SHARED_PLANNER_ID,
        data,
      },
    ]),
  });

  if (!response.ok) throw new Error(`Push failed: ${response.status}`);
}

export default function App() {
  const [data, setData] = useState(makeInitialData());
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteTargetKey, setNoteTargetKey] = useState(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.slots && parsed?.selectedKey) setData(parsed);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const selected = data.slots[data.selectedKey];

  const summary = useMemo(() => {
    let imogenDuty = 0;
    let dodoDuty = 0;
    let flexible = 0;
    let fixed = 0;

    Object.values(data.slots).forEach((slot) => {
      if (slot.state === "Imogen on duty") imogenDuty += 1;
      if (slot.state === "Dodo on duty") dodoDuty += 1;
      if (slot.state === "Flexible") flexible += 1;
      if (slot.slotType === "Fixed") fixed += 1;
    });

    return { imogenDuty, dodoDuty, flexible, fixed };
  }, [data.slots]);

  const creditSummary = useMemo(() => {
    return countCreditsFromBaseline(data.slots, data.baselineSlots);
  }, [data.slots, data.baselineSlots]);

  function updateSlot(key, patch) {
    const current = data.slots[key];
    if (!current) return;

    const isChangingState = typeof patch.state !== "undefined" && patch.state !== current.state;
    const isChangingType = typeof patch.slotType !== "undefined" && patch.slotType !== current.slotType;

    if (
      current.slotType === "Fixed" &&
      (isChangingState || (isChangingType && patch.slotType === "Fixed"))
    ) {
      const confirmed = window.confirm(
        "This is a fixed appointment. Are you sure you want to change it?"
      );
      if (!confirmed) return;
    }

    setData((prev) => ({
      ...prev,
      slots: {
        ...prev.slots,
        [key]: {
          ...prev.slots[key],
          ...patch,
        },
      },
    }));
  }

  function resetPlanner() {
    setData(makeInitialData());
  }

  function saveBaseline() {
    setData((prev) => ({
      ...prev,
      baselineSlots: cloneSlots(prev.slots),
    }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "family-shift-planner.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || "{}"));
        if (parsed?.slots && parsed?.selectedKey) {
          setData(parsed);
        } else {
          alert("That file could not be imported.");
        }
      } catch {
        alert("That file could not be imported.");
      }
    };
    reader.readAsText(file);
  }

  function openNoteDialog(key) {
    setNoteTargetKey(key);
    setNoteDraft(data.slots[key]?.note || "");
    setNoteDialogOpen(true);
  }

  function saveNoteDialog() {
    if (noteTargetKey) {
      updateSlot(noteTargetKey, { note: noteDraft });
    }
    setNoteDialogOpen(false);
    setNoteTargetKey(null);
    setNoteDraft("");
  }

  async function handlePushShared() {
    setSyncBusy(true);
    setSyncMessage("");
    try {
      await pushSharedPlanner(data);
      setSyncMessage("Shared planner updated.");
    } catch (error) {
      setSyncMessage("Could not push to shared planner yet.");
      console.error(error);
    } finally {
      setSyncBusy(false);
    }
  }

  async function handlePullShared() {
    setSyncBusy(true);
    setSyncMessage("");
    try {
      const sharedData = await pullSharedPlanner();
      if (sharedData?.slots && sharedData?.selectedKey) {
        setData(sharedData);
        setSyncMessage("Latest shared planner loaded.");
      } else {
        setSyncMessage("No shared planner found yet. Push one first.");
      }
    } catch (error) {
      setSyncMessage("Could not pull shared planner yet.");
      console.error(error);
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        padding: 12,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ ...miniCardStyle(), padding: 16, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.1 }}>Family Shift Planner</h1>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={data.weekLabel}
                  onChange={(e) => setData((prev) => ({ ...prev, weekLabel: e.target.value }))}
                  placeholder="Week label"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    fontSize: 14,
                    minWidth: 160,
                    background: "white",
                  }}
                />
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    background: data.baselineSlots ? "#0f172a" : "#e2e8f0",
                    color: data.baselineSlots ? "white" : "#334155",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {data.baselineSlots ? "Baseline saved" : "No baseline yet"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={buttonStyle(false)} onClick={saveBaseline}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <Camera size={16} /> Set baseline
                </span>
              </button>
              <button style={buttonStyle(false)} onClick={resetPlanner}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <RotateCcw size={16} /> Reset
                </span>
              </button>
              <button style={buttonStyle(false)} onClick={exportData}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <Download size={16} /> Export
                </span>
              </button>
              <label style={buttonStyle(false)}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <Upload size={16} /> Import
                </span>
                <input type="file" accept="application/json" onChange={importData} style={{ display: "none" }} />
              </label>
              <button style={buttonStyle(false)} onClick={handlePullShared} disabled={syncBusy}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <CloudDownload size={16} /> Pull latest
                </span>
              </button>
              <button style={buttonStyle(true)} onClick={handlePushShared} disabled={syncBusy}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <CloudUpload size={16} /> Push to shared
                </span>
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 8, color: "#475569", fontSize: 14 }}>
            Save a baseline once your planned week is set. Credits are then calculated from later changes to swappable slots.
          </div>
          <div style={{ marginBottom: 14, color: syncMessage ? "#0f172a" : "#64748b", fontSize: 13 }}>
            {syncMessage || "Shared mode: push your changes, then pull on the other device."}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ ...miniCardStyle(), padding: 12 }}>
              <div style={{ fontSize: 13, color: "#64748b" }}>Imogen on duty</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#0369a1", marginTop: 4 }}>{summary.imogenDuty}</div>
            </div>
            <div style={{ ...miniCardStyle(), padding: 12 }}>
              <div style={{ fontSize: 13, color: "#64748b" }}>Dodo on duty</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#b45309", marginTop: 4 }}>{summary.dodoDuty}</div>
            </div>
            <div style={{ ...miniCardStyle(), padding: 12 }}>
              <div style={{ fontSize: 13, color: "#64748b" }}>Flexible</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#15803d", marginTop: 4 }}>{summary.flexible}</div>
            </div>
            <div style={{ ...miniCardStyle(), padding: 12 }}>
              <div style={{ fontSize: 13, color: "#64748b" }}>Fixed slots</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{summary.fixed}</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ ...miniCardStyle(), padding: 12 }}>
              <div style={{ fontWeight: 700 }}>Imogen free shifts</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>Extra swappable duty since baseline</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#0369a1", marginTop: 4 }}>{creditSummary.imogen}</div>
            </div>
            <div style={{ ...miniCardStyle(), padding: 12 }}>
              <div style={{ fontWeight: 700 }}>Dodo free shifts</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>Extra swappable duty since baseline</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#b45309", marginTop: 4 }}>{creditSummary.dodo}</div>
            </div>
            <div style={{ ...miniCardStyle(), padding: 12 }}>
              <div style={{ fontWeight: 700 }}>Changed slots</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>Since baseline</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{creditSummary.changedSlots}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#475569" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 16, height: 16, borderRadius: 6, background: "#dbeafe", border: "1px solid #93c5fd", display: "inline-block" }}></span>
              Imogen
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 16, height: 16, borderRadius: 6, background: "#fde68a", border: "1px solid #f59e0b", display: "inline-block" }}></span>
              Dodo
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 16, height: 16, borderRadius: 6, background: "#dcfce7", border: "1px solid #86efac", display: "inline-block" }}></span>
              Flexible
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 6,
                  border: "1px solid #94a3b8",
                  backgroundImage: "repeating-linear-gradient(135deg, #cbd5e1 0px, #cbd5e1 6px, rgba(255,255,255,0.65) 6px, rgba(255,255,255,0.65) 12px)",
                  display: "inline-block",
                }}
              ></span>
              Swappable
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 16, height: 16, borderRadius: 6, background: "#cbd5e1", border: "1px solid #94a3b8", display: "inline-block" }}></span>
              Fixed
            </div>
          </div>
        </div>

        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <div
            style={{
              minWidth: 880,
              border: "1px solid #e2e8f0",
              borderRadius: 20,
              overflow: "hidden",
              background: "white",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "95px repeat(7, minmax(105px, 1fr))",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <div style={{ padding: 10 }}></div>
              {DAYS.map((day) => (
                <div key={day} style={{ padding: 10, textAlign: "center" }}>
                  {day}
                </div>
              ))}
            </div>

            {TIMES.map((time) => (
              <div
                key={time}
                style={{
                  display: "grid",
                  gridTemplateColumns: "95px repeat(7, minmax(105px, 1fr))",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    padding: 10,
                    fontWeight: 600,
                    background: "#f8fafc",
                    borderRight: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {time}
                </div>

                {DAYS.map((day) => {
                  const key = `${day}-${time}`;
                  const slot = data.slots[key];
                  const isSelected = data.selectedKey === key;
                  const colors = getSlotColors(slot.state);
                  const backgroundStyles = getSlotBackground(slot.state, slot.slotType);

                  return (
                    <button
                      key={key}
                      onClick={() => setData((prev) => ({ ...prev, selectedKey: key }))}
                      onDoubleClick={() => updateSlot(key, { state: nextState(slot.state) })}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setData((prev) => ({ ...prev, selectedKey: key }));
                        openNoteDialog(key);
                      }}
                      style={{
                        padding: 6,
                        minHeight: 112,
                        border: "none",
                        borderRight: "1px solid #e2e8f0",
                        background: "white",
                        textAlign: "left",
                        cursor: "pointer",
                        boxShadow: isSelected ? "inset 0 0 0 2px #64748b" : "none",
                      }}
                      title="Double-click to change state · Right-click to edit note"
                    >
                      <div
                        style={{
                          borderRadius: 16,
                          minHeight: 98,
                          border: `1px solid ${colors.border}`,
                          padding: 8,
                          color: colors.text,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          ...backgroundStyles,
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.08 }}>
                          {slot.state}
                        </div>
                        <div
                          style={{
                            minHeight: 24,
                            fontSize: 11,
                            lineHeight: 1.25,
                            color: "rgba(15, 23, 42, 0.78)",
                            overflow: "hidden",
                          }}
                        >
                          {slot.note || ""}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#475569", marginTop: 6 }}>{slot.slotType}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...miniCardStyle(), padding: 16 }}>
          <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>Edit slot</h2>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>Slot</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {selected.day} {selected.time}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>State</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              {STATES.map((state) => (
                <button
                  key={state}
                  style={buttonStyle(selected.state === state)}
                  onClick={() => updateSlot(data.selectedKey, { state })}
                >
                  {state}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Slot style</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SLOT_TYPES.map((slotType) => (
                <button
                  key={slotType}
                  style={buttonStyle(selected.slotType === slotType)}
                  onClick={() => updateSlot(data.selectedKey, { slotType })}
                >
                  {slotType}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Note</div>
            <textarea
              value={selected.note}
              onChange={(e) => updateSlot(data.selectedKey, { note: e.target.value })}
              placeholder="Dodo uni, Karen visiting, Haushaltshilfe, Imo dr appt..."
              style={{
                width: "100%",
                minHeight: 110,
                resize: "vertical",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                padding: 12,
                fontSize: 14,
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      </div>

      {noteDialogOpen && (
        <div
          onClick={() => setNoteDialogOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "white",
              borderRadius: 20,
              padding: 20,
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Add note</h2>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Dodo uni, Karen visiting, Haushaltshilfe, Imo dr appt..."
              style={{
                width: "100%",
                minHeight: 140,
                resize: "vertical",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                padding: 12,
                fontSize: 14,
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button style={buttonStyle(false)} onClick={() => setNoteDialogOpen(false)}>
                Cancel
              </button>
              <button style={buttonStyle(true)} onClick={saveNoteDialog}>
                Save note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
