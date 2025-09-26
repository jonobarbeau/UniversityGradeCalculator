import React, { useEffect, useMemo, useState } from "react";

const toPct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : "—");
const clamp0_100 = (v) => (v == null || v === "" ? "" : Math.min(100, Math.max(0, Number(v))));
const toNumOrNull = (v) => (v === "" || v == null ? null : Number(v));
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const emptyItem = (name = "") => ({ id: uid(), name, weight: "", score: "" });
const defaultItems = () => [
  emptyItem("A1S1"),
  emptyItem("A2S1"),
  emptyItem("A1S2"),
  emptyItem("A2S2"),
  emptyItem("AF1"),
  emptyItem("AF2"),
];

const DEFAULT_COURSE = () => ({
  id: uid(),
  name: "New Course",
  target: 50,
  items: defaultItems(),
});

export default function App() {
  const [courses, setCourses] = useState([DEFAULT_COURSE()]);
  const [selectedId, setSelectedId] = useState(null);

  // Load
  useEffect(() => {
    const raw = localStorage.getItem("grade_goal_calc_multicourse_v1");
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (Array.isArray(s.courses) && s.courses.length) {
          setCourses(s.courses);
          setSelectedId(s.selectedId ?? s.courses[0].id);
          return;
        }
      } catch {}
    }
    // Seed like your screenshot
    const seed = DEFAULT_COURSE();
    seed.name = "Man Acc 288";
    seed.items = seed.items.map((it) => {
      if (it.name === "A1S1") return { ...it, weight: 10, score: 47 };
      if (it.name === "A2S1") return { ...it, weight: 10, score: 60 };
      if (it.name === "A1S2") return { ...it, weight: 10, score: 38 };
      if (it.name === "A2S2") return { ...it, weight: 20, score: "" };
      if (it.name === "AF1") return { ...it, weight: 25, score: 95 };
      if (it.name === "AF2") return { ...it, weight: 25, score: 90 };
      return it;
    });
    setCourses([seed]);
    setSelectedId(seed.id);
  }, []);

  // Save
  useEffect(() => {
    localStorage.setItem(
      "grade_goal_calc_multicourse_v1",
      JSON.stringify({ courses, selectedId })
    );
  }, [courses, selectedId]);

  const setCourse = (id, patch) =>
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addCourse = () => {
    const c = DEFAULT_COURSE();
    setCourses((prev) => [...prev, c]);
    setSelectedId(c.id);
  };

  const duplicateCourse = (id) => {
    const src = courses.find((c) => c.id === id);
    if (!src) return;
    const copy = {
      ...src,
      id: uid(),
      name: `${src.name} (Copy)`,
      items: src.items.map((it) => ({ ...it, id: uid() })),
    };
    setCourses((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const deleteCourse = (id) => {
    if (courses.length === 1) {
      alert("Keep at least one course.");
      return;
    }
    const c = courses.find((x) => x.id === id);
    if (!confirm(`Delete course "${c?.name ?? "Course"}"? This cannot be undone.`)) return;
    const next = courses.filter((x) => x.id !== id);
    setCourses(next);
    setSelectedId(next[0].id);
  };

  const selected = courses.find((c) => c.id === selectedId) || courses[0];

  const calc = (course) => {
    const rows = course.items.map((it) => ({
      ...it,
      nW: toNumOrNull(it.weight),
      nS: toNumOrNull(it.score),
    }));
    const totalW = rows.reduce((a, r) => a + (r.nW ?? 0), 0);
    const completed = rows.filter((r) => r.nS != null);
    const completedW = completed.reduce((a, r) => a + (r.nW ?? 0), 0);
    const weightedPoints = completed.reduce(
      (a, r) => a + ((r.nW ?? 0) * (r.nS ?? 0)) / 100,
      0
    );
    const currentAvg = completedW > 0 ? (weightedPoints / completedW) * 100 : 0;

    const remainingW = Math.max(0, totalW - completedW);
    const goal = Number(course.target);
    const neededAvgRemaining =
      remainingW > 0 && Number.isFinite(goal)
        ? ((goal / 100) * totalW - weightedPoints) / remainingW * 100
        : null;

    const projected = rows.reduce(
      (a, r) => a + ((r.nW ?? 0) * (r.nS ?? 0)) / 100,
      0
    );
    const projectedFinal = totalW > 0 ? (projected / totalW) * 100 : 0;

    return {
      rows,
      totalW,
      completedW,
      remainingW,
      currentAvg,
      neededAvgRemaining,
      projectedFinal,
    };
  };

  const data = selected ? calc(selected) : null;

  const updateItem = (id, patch) =>
    setCourse(selected.id, {
      items: selected.items.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  const addRow = () =>
    setCourse(selected.id, { items: [...selected.items, emptyItem("")] });
  const removeRow = (id) =>
    setCourse(selected.id, { items: selected.items.filter((r) => r.id !== id) });

  // Export/Import helpers (fixed)
  const exportCourse = (course) => {
    const safe = String(course.name || "course")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim() || "course";
    const blob = new Blob([JSON.stringify(course, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safe + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ courses }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "all-courses.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCourse = (e, replaceAll = false) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        if (replaceAll && Array.isArray(json.courses)) {
          setCourses(json.courses);
          setSelectedId(json.courses[0]?.id ?? null);
          return;
        }
        if (json && json.id && json.name) {
          setCourses((prev) => [...prev, json]);
          setSelectedId(json.id);
        } else {
          alert("Invalid course file");
        }
      } catch {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(f);
  };

  if (!selected || !data) return null;

  const { totalW, completedW, remainingW, currentAvg, neededAvgRemaining, projectedFinal } =
    data;

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 h-max">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm text-zinc-400">Classes</div>
            <button
              className="text-xs border border-zinc-700 rounded-lg px-2 py-1 hover:bg-zinc-900"
              onClick={addCourse}
            >
              + Add
            </button>
          </div>
          <div className="space-y-1">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left rounded-xl px-3 py-2 border ${
                  c.id === selectedId
                    ? "border-orange-500/40 bg-orange-500/10"
                    : "border-zinc-800 hover:bg-zinc-900"
                }`}
              >
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-zinc-400">Target {c.target}%</div>
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <button
              className="border border-zinc-700 rounded-lg px-2 py-1 hover:bg-zinc-900"
              onClick={() => duplicateCourse(selected.id)}
            >
              Duplicate
            </button>
            <button
              className="border border-zinc-700 rounded-lg px-2 py-1 hover:bg-zinc-900"
              onClick={() => deleteCourse(selected.id)}
            >
              Delete
            </button>
            <label className="border border-zinc-700 rounded-lg px-2 py-1 hover:bg-zinc-900 cursor-pointer text-center">
              Import
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => importCourse(e, false)}
              />
            </label>
            <button
              className="border border-zinc-700 rounded-lg px-2 py-1 hover:bg-zinc-900"
              onClick={() => exportCourse(selected)}
            >
              Export
            </button>
            <label className="border border-zinc-700 rounded-lg px-2 py-1 hover:bg-zinc-900 cursor-pointer col-span-1">
              Import All
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => importCourse(e, true)}
              />
            </label>
            <button
              className="border border-zinc-700 rounded-lg px-2 py-1 hover:bg-zinc-900"
              onClick={exportAll}
            >
              Export All
            </button>
          </div>
        </aside>

        {/* Main */}
        <main>
          <div className="mb-4 flex items-center gap-3">
            <input
              className="flex-1 bg-transparent text-xl font-semibold outline-none border-b border-zinc-800 focus:border-zinc-600"
              value={selected.name}
              onChange={(e) => setCourse(selected.id, { name: e.target.value })}
            />
            <div className="text-xs text-zinc-500">Total weight: {totalW}%</div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
              <div className="text-zinc-400 text-sm">current grade</div>
              <div className="mt-1 text-4xl font-bold text-orange-400">
                {toPct(currentAvg)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                completed weight: {completedW || 0}%
              </div>
            </div>
            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
              <div className="text-zinc-400 text-sm">target grade</div>
              <div className="mt-1 flex items-baseline gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-24 bg-transparent text-4xl font-bold text-orange-400 outline-none"
                  value={selected.target}
                  onChange={(e) =>
                    setCourse(selected.id, { target: clamp0_100(e.target.value) })
                  }
                />
                <span className="text-orange-400 text-4xl font-bold">%</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                remaining weight: {remainingW || 0}%
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-950 border border-zinc-800">
            {selected.items.map((it, idx) => {
              const isLast = idx === selected.items.length - 1;
              const nS = toNumOrNull(it.score);
              const isPending = nS == null;
              const need =
                isPending && Number.isFinite(neededAvgRemaining)
                  ? Math.max(0, neededAvgRemaining)
                  : null;

              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-3 px-4 ${
                    isLast ? "" : "border-b border-zinc-800"
                  } py-4`}
                >
                  <input
                    className="w-28 bg-transparent text-base font-medium outline-none"
                    value={it.name}
                    onChange={(e) => updateItem(it.id, { name: e.target.value })}
                    placeholder={`Item ${idx + 1}`}
                  />

                  <div className="ml-auto flex items-center gap-3">
                    <div className="text-zinc-500 text-xs">
                      weight
                      <input
                        type="number"
                        className="ml-2 w-16 bg-transparent border-b border-zinc-800 focus:border-zinc-600 outline-none text-zinc-200"
                        value={it.weight}
                        onChange={(e) =>
                          updateItem(it.id, { weight: clamp0_100(e.target.value) })
                        }
                        placeholder="%"
                      />
                    </div>

                    <div
                      className={`rounded-2xl px-3 py-2 text-sm border ${
                        isPending
                          ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
                          : "border-zinc-700 bg-zinc-900 text-zinc-200"
                      }`}
                    >
                      {isPending ? (
                        <div className="flex items-center gap-1">
                          <span className="uppercase tracking-wide">need</span>
                          <span
                            className={`font-semibold ${
                              Number(need) > 100 ? "text-red-400" : ""
                            }`}
                          >
                            {need == null ? "—" : `${need.toFixed(0)}%`}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-zinc-400">got</span>
                          <span className="font-semibold">{`${nS}/100`}</span>
                        </div>
                      )}
                    </div>

                    <input
                      type="number"
                      className="w-20 bg-transparent border-b border-zinc-800 focus:border-zinc-600 outline-none text-zinc-200"
                      value={it.score}
                      onChange={(e) =>
                        updateItem(it.id, { score: clamp0_100(e.target.value) })
                      }
                      placeholder="score"
                    />

                    <button
                      className="text-xs text-zinc-400 hover:text-red-400"
                      onClick={() => removeRow(it.id)}
                    >
                      delete
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
              <button
                onClick={addRow}
                className="text-sm border border-zinc-700 rounded-xl px-3 py-1.5 hover:bg-zinc-900"
              >
                + Add item
              </button>
              <div className="text-xs text-zinc-400">
                Projected final with entered scores:{" "}
                <span className="text-zinc-200 font-medium">
                  {toPct(projectedFinal)}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Tip: leave the score blank for future items — the pill shows a uniform %
            needed to hit your target across the remaining weight.
          </p>
        </main>
      </div>
    </div>
  );
}
