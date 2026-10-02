"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import states from "@/lib/content/entryMap.json";
import scenes from "@/lib/content/entryTracts.json";
import censusFacts from "@/lib/content/entryTractFacts.json";
import censusGrowth from "@/lib/content/entryTractGrowth.json";

const tractFacts: Record<string, { county: string; population: number | null; medianHouseholdIncome: number | null }> = censusFacts.tracts;
const countFormat = new Intl.NumberFormat("en-US");
const dollarFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const tractGrowth: Record<string, { populationChange: number | null; incomeChange: number | null }> = censusGrowth.tracts;
function Change({ value }: { value: number | null | undefined }) {
  if (value == null) return <small className="entry-estimate-change">change unavailable</small>;
  const rounded = Math.round(value * 10) / 10;
  return <small className="entry-estimate-change">{rounded > 0 ? "↑" : rounded < 0 ? "↓" : "→"} {Math.abs(rounded).toFixed(1)}%</small>;
}

function PointerHalo() {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const halo = element.current; if (!halo) return;
    const motion = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    function hide() { cancelAnimationFrame(frame); halo!.style.opacity = "0"; }
    function move(event: PointerEvent) {
      if (!motion.matches || event.pointerType === "touch" || !(event.target instanceof Node) || !halo!.closest(".entry-screen")?.contains(event.target)) { hide(); return; }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { halo!.style.transform = `translate3d(${event.clientX - 16}px, ${event.clientY - 16}px, 0)`; halo!.style.opacity = "1"; });
    }
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("mouseleave", hide); document.addEventListener("keydown", hide); window.addEventListener("blur", hide);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointermove", move); document.removeEventListener("mouseleave", hide); document.removeEventListener("keydown", hide); window.removeEventListener("blur", hide); };
  }, []);
  return <div className="entry-pointer-halo" ref={element} aria-hidden="true" />;
}

export default function EntryAtmosphere() {
  const [paused, setPaused] = useState(false);
  const [inactive, setInactive] = useState(false);
  const backdrop = useRef<HTMLDivElement>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const scene = scenes[sceneIndex]; const tracts = scene.tracts;
  const facts = tractFacts[scene.selected.id];
  const growth = tractGrowth[scene.selected.id];
  const tractTop = Math.min(...[...scene.selected.path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((point) => Number(point[2])));
  useEffect(() => {
    let visible = true;
    const update = () => setInactive(document.hidden || !visible);
    // Observe the artwork itself: long legal content can extend well below it.
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    const artwork = backdrop.current?.querySelector(".entry-atlas");
    if (artwork) observer.observe(artwork);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  const camera = (point: { x: number; y: number }, scale: number) => `translate(${(500 - point.x * scale) / 10}%, ${(310 - point.y * scale) / 6.2}%) scale(${scale})`;
  const wide = "translate(0px, 0px) scale(1)";
  const cameraStyle = {
    "--camera-from": sceneIndex === 0 ? wide : camera(scenes[sceneIndex - 1].focus, 1.65),
    "--camera-to": camera(scene.focus, 1.65),
    "--camera-close": camera(scene.focus, 4.5),
    "--camera-end": sceneIndex === scenes.length - 1 ? wide : camera(scene.focus, 1.65),
  } as CSSProperties;
  return <>
    <PointerHalo />
    <div ref={backdrop} className={`entry-atmosphere${paused || inactive ? " is-paused" : ""}`} aria-hidden="true">
      <div className="entry-atlas" style={cameraStyle}>
      <svg className="entry-atlas-definitions" width="0" height="0" fill="none" focusable="false">
        <defs>
          <linearGradient id="entry-land" x1="0" y1="0" x2="900" y2="620" gradientUnits="userSpaceOnUse"><stop stopColor="#274c5c" /><stop offset="1" stopColor="#173747" /></linearGradient>
          <pattern id="entry-land-grain" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".55" fill="#b9d4d6" opacity=".17" /><circle cx="9" cy="8" r=".4" fill="#9fbfc9" opacity=".12" /><path d="M0 12H12" stroke="#081c2a" strokeOpacity=".15" strokeWidth=".5" /></pattern>
          <pattern id="entry-land-texture" width="1000" height="620" patternUnits="userSpaceOnUse"><rect width="1000" height="620" fill="url(#entry-land)" /><rect width="1000" height="620" fill="url(#entry-land-grain)" /><rect width="1000" height="620" fill="url(#entry-grid)" /></pattern>
          <clipPath id="entry-tract-mask">{tracts.map((tract) => <path key={tract.id} d={tract.path} fillRule="evenodd" />)}</clipPath>
          <linearGradient id="entry-scan-light"><stop stopColor="#8bebdd" stopOpacity="0" /><stop offset=".85" stopColor="#8bebdd" stopOpacity=".16" /><stop offset="1" stopColor="#8bebdd" stopOpacity="0" /></linearGradient>
          <pattern id="entry-grid" width="42" height="42" patternUnits="userSpaceOnUse"><path d="M42 0H0V42" stroke="#7caec5" strokeOpacity=".11" strokeWidth=".6" /></pattern>
        </defs>
      </svg>
        <div className="entry-atlas-camera" onAnimationIteration={(event) => { if (event.animationName === "entry-camera") setSceneIndex((index) => (index + 1) % scenes.length); }}>
          <svg viewBox="0 0 1000 620" fill="none" focusable="false">
          <g className="entry-land-pieces">{states.map((state) => <path className="entry-land-piece" key={state.id} d={state.path} fill="url(#entry-land-texture)" fillRule="evenodd" stroke="#8daeba" strokeWidth=".85" />)}</g>
          <image className="entry-population-lights" href="/entry-population-lights.svg" width="1000" height="620" />
          </svg>
        </div>
        <div className="entry-tract-detail">
          <svg viewBox="0 0 1000 620" fill="none" focusable="false">
          {tracts.map((tract) => <path key={tract.id} d={tract.path} fill="url(#entry-land-texture)" fillOpacity=".8" stroke="#8fc8d5" strokeOpacity=".55" strokeWidth=".7" fillRule="evenodd" />)}
          <path className="entry-selected-tract" d={scene.selected.path} fillRule="evenodd" />
          <g clipPath="url(#entry-tract-mask)"><rect className="entry-data-scan" x="-240" y="0" width="240" height="620" fill="url(#entry-scan-light)" /></g>
          </svg>
          {facts && <div className="entry-tract-popup-anchor" style={{ left: `${scene.selected.x / 10}%`, top: `${tractTop / 6.2}%` }}>
            <div className="entry-demo-stats">
              <p className="entry-demo-disclaimer">Census ACS {censusFacts.period} · estimates</p>
              <h3>{facts.county}</h3>
              <p className="entry-tract-id">Tract {scene.selected.id}</p>
              <dl className="entry-demo-metrics">
                <div><dt>Population</dt><dd>{facts.population == null ? "Not available" : countFormat.format(facts.population)}<Change value={growth?.populationChange} /></dd></div>
                <div><dt>Median household income</dt><dd>{facts.medianHouseholdIncome == null ? "Not available" : dollarFormat.format(facts.medianHouseholdIncome)}<Change value={growth?.incomeChange} /></dd></div>
              </dl>
              <p className="entry-tract-source">U.S. Census Bureau · B01003 / B19013<br />Change: {censusGrowth.baselinePeriod} → {censusGrowth.currentPeriod}<br />Overlapping estimates · income change not inflation-adjusted</p>
            </div>
          </div>}
        </div>
      </div>
      <div className="entry-atmosphere-shade" />
      <div className="entry-process-captions">Population lights · Census ACS 2020–2024 · Illustrative, not satellite imagery<br />{String(sceneIndex + 1).padStart(2, "0")} / {scene.name} · Illustrative selection, not eligibility or a recommendation</div>
    </div>
    <button type="button" className="entry-motion-toggle" onClick={() => setPaused(!paused)} aria-label={paused ? "Play background animation" : "Pause background animation"}><span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>{paused ? "Play motion" : "Pause motion"}</button>
  </>;
}
