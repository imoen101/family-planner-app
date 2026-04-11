import React, { useEffect, useMemo, useState } from "react";
import { Camera, Download, RotateCcw, Upload, CloudUpload, CloudDownload } from "lucide-react";

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
      slots[key] = { day, time, state: "Flexible", slotType: "Swappable", note: "" };
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

function getSlotColors(state) {
  if (state === "Imogen on duty") return { bg: "#dbeafe", border: "#93c5fd" };
  if (state === "Dodo on duty") return { bg: "#fde68a", border: "#f59e0b" };
  return { bg: "#dcfce7", border: "#86efac" };
}

function getSlotBackground(state, type) {
  const c = getSlotColors(state);
  if (type === "Swappable") {
    return {
      backgroundImage: `repeating-linear-gradient(135deg, ${c.bg} 0px, ${c.bg} 10px, rgba(255,255,255,0.4) 10px, rgba(255,255,255,0.4) 18px)`,
      backgroundColor: c.bg,
    };
  }
  return { background: c.bg };
}

function nextState(current) {
  const idx = STATES.indexOf(current);
  return STATES[(idx + 1) % STATES.length];
}

export default function App() {
  const [data, setData] = useState(makeInitialData());

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setData(JSON.parse(raw));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  function updateSlot(key, patch) {
    const current = data.slots[key];
    const isChangingState = patch.state && patch.state !== current.state;

    if (current.slotType === "Fixed" && isChangingState) {
      if (!window.confirm("This is a fixed appointment. Change it?")) return;
    }

    setData(prev => ({
      ...prev,
      slots: { ...prev.slots, [key]: { ...prev.slots[key], ...patch } }
    }));
  }

  const selected = data.slots[data.selectedKey];

  return (
    <div style={{ padding: 12, fontFamily: "Inter, sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>

        {/* HEADER */}
        <h1 style={{ marginBottom: 12 }}>Family Planner</h1>

        {/* GRID FIRST (FULL WIDTH) */}
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <div style={{ minWidth: 800, background: "white", borderRadius: 16, overflow: "hidden" }}>

            <div style={{ display: "grid", gridTemplateColumns: "100px repeat(7,1fr)", background: "#f8fafc" }}>
              <div />
              {DAYS.map(d => <div key={d} style={{ padding: 8, textAlign: "center" }}>{d}</div>)}
            </div>

            {TIMES.map(time => (
              <div key={time} style={{ display: "grid", gridTemplateColumns: "100px repeat(7,1fr)" }}>
                <div style={{ padding: 8, fontWeight: 600 }}>{time}</div>

                {DAYS.map(day => {
                  const key = `${day}-${time}`;
                  const slot = data.slots[key];
                  const colors = getSlotColors(slot.state);

                  return (
                    <div
                      key={key}
                      onClick={() => setData(p => ({ ...p, selectedKey: key }))}
                      onDoubleClick={() => updateSlot(key, { state: nextState(slot.state) })}
                      style={{ padding: 6 }}
                    >
                      <div
                        style={{
                          borderRadius: 12,
                          border: `1px solid ${colors.border}`,
                          padding: 8,
                          minHeight: 70,
                          fontSize: 13,
                          ...getSlotBackground(slot.state, slot.slotType)
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{slot.state}</div>
                        <div style={{ fontSize: 11 }}>{slot.note}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* CONTROLS UNDERNEATH */}
        <div style={{ background: "white", padding: 16, borderRadius: 16 }}>
          <h2 style={{ marginTop: 0 }}>Edit Slot</h2>

          <div style={{ marginBottom: 12 }}>
            <strong>{selected.day} {selected.time}</strong>
          </div>

          <div style={{ marginBottom: 12 }}>
            {STATES.map(s => (
              <button key={s} onClick={() => updateSlot(data.selectedKey, { state: s })} style={{ marginRight: 6 }}>
                {s}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            {SLOT_TYPES.map(t => (
              <button key={t} onClick={() => updateSlot(data.selectedKey, { slotType: t })} style={{ marginRight: 6 }}>
                {t}
              </button>
            ))}
          </div>

          <textarea
            value={selected.note}
            onChange={e => updateSlot(data.selectedKey, { note: e.target.value })}
            style={{ width: "100%", minHeight: 80 }}
          />
        </div>

      </div>
    </div>
  );
}


