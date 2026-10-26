// 패치노트 카드뉴스 생성기: patchnotes/<버전>.json → <버전>.html + <버전>.pdf (+ 카드별 PNG)
//
//   node patchnotes/build.mjs patchnotes/0.2.5.json          # HTML + PDF
//   node patchnotes/build.mjs patchnotes/0.2.5.json --png    # 카드마다 PNG 도 (patchnotes/0.2.5/01.png …)
//
// 그림은 게임의 픽셀 스프라이트(src/render/art)를 그대로 SVG 로 그린다. 폰트는 게임과 같은 Galmuri.
// PDF·PNG 는 Playwright(Chromium)가 있어야 한다: npm i -D playwright && npx playwright install chromium
// 없으면 HTML 만 만들고 알려 준다 (브라우저에서 열어 인쇄 → PDF 로 저장해도 된다).
//
// 카드 종류(type): cover · summary · agent-new · changes · guns · extra · chart · outro — 0.2.5.json 이 예시.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { PAL } from '../src/render/palette.js';
import { CHAMBER_ART } from '../src/render/art/chamber.js';
import { KILLJOY_ART } from '../src/render/art/killjoy.js';
import { REYNA_ART } from '../src/render/art/reyna.js';
import { BRIMSTONE_ART } from '../src/render/art/brimstone.js';
import { GECKO_ART } from '../src/render/art/gecko.js';
import { ASTRA_ART } from '../src/render/art/astra.js';
import { GUN_ART } from '../src/render/art/guns.js';
import { ENEMY_ART } from '../src/render/art/enemies.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ART = { ...CHAMBER_ART, ...KILLJOY_ART, ...REYNA_ART, ...BRIMSTONE_ART, ...GECKO_ART, ...ASTRA_ART, ...GUN_ART, ...ENEMY_ART };

// ── 색 ───────────────────────────────────────────────────────────────
const C = {
  ink: '#0b0f14', navy: '#141c25', navy2: '#1f2a36', line: '#2e3d4f', white: '#ece8e1', dim: '#8b96a3',
  red: '#ff4655', gold: '#d9a441', teal: '#3ee6c4', purple: '#b07bff',
};
const AGENT = {
  chamber: { name: '체임버', color: '#d9a441', sprite: 'chamber_s0' },
  killjoy: { name: '킬조이', color: '#f2c230', sprite: 'killjoy0' },
  reyna: { name: '레이나', color: '#e14fd0', sprite: 'reyna0' },
  brimstone: { name: '브림스톤', color: '#ff8a3d', sprite: 'brimstone0' },
  gecko: { name: '게코', color: '#b8e830', sprite: 'gecko0' },
  astra: { name: '아스트라', color: '#b07bff', sprite: 'astra0' },
};
const TAG = {
  buff: { label: '상향', mark: '▲', color: C.teal },
  nerf: { label: '하향', mark: '▼', color: C.red },
  change: { label: '변경', mark: '◆', color: C.gold },
  new: { label: '신규', mark: '★', color: C.purple },
};

// ── 픽셀 스프라이트 → SVG (색마다 path 하나) ─────────────────────────
function sprite(name, scale, { flip = false, cls = '' } = {}) {
  const rows = ART[name];
  if (!rows) throw new Error(`스프라이트 없음: ${name}`);
  const h = rows.length;
  const w = rows[0].length;
  const paths = {};
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const col = PAL[ch];
      if (!col) return;
      const px = flip ? w - 1 - x : x;
      (paths[col] ??= []).push(`M${px} ${y}h1v1h-1z`);
    });
  });
  const body = Object.entries(paths).map(([col, d]) => `<path fill="${col}" d="${d.join('')}"/>`).join('');
  return `<svg class="px ${cls}" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
}

// ── 글 ──────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const tagChip = (tag) => {
  const t = TAG[tag];
  return t ? `<span class="chip" style="--c:${t.color}">${t.mark} ${t.label}</span>` : '';
};

// ── 카드 ────────────────────────────────────────────────────────────
function frame(doc, i, n, inner, { accent = C.red, cls = '' } = {}) {
  return `<section class="card ${cls}" style="--accent:${accent}">
  <div class="grain"></div>
  <header class="top"><span class="brand">집중포화 <i>CROSSFIRE</i></span><span class="ver">PATCH ${esc(doc.version)}</span></header>
  <div class="body">${inner}</div>
  <footer class="bottom"><span>${esc(doc.date)}</span><span class="page">${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span></footer>
</section>`;
}

function stars(seed, count, w, h) {
  // 결정적인 별 배경 (같은 패치는 같은 그림)
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  let out = '';
  for (let k = 0; k < count; k++) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    const big = rnd() < 0.12;
    out += `<rect x="${x}" y="${y}" width="${big ? 2 : 1}" height="${big ? 2 : 1}" fill="${rnd() < 0.3 ? C.purple : C.white}" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`;
  }
  return `<svg class="stars" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges">${out}</svg>`;
}

/** 카드 아래 장식: 스프라이트 이름 목록 → 바닥 위에 나란히 (크기는 그림마다 자동) */
function showcase(names) {
  if (!names?.length) return '';
  const items = names.map((n, k) => {
    const h = ART[n].length;
    const scale = Math.max(3, Math.min(10, Math.floor(200 / h)));
    return sprite(n, scale, { flip: k % 2 === 1 && !n.startsWith('gun_') });
  }).join('');
  return `<div class="showcase">${items}</div>`;
}

const RENDER = {
  cover(doc, c) {
    const lineup = c.agents.filter((a) => a !== c.hero).map((a, k) => `<div class="mate" style="--d:${k}">${sprite(AGENT[a].sprite, 7, { flip: k % 2 === 1 })}</div>`).join('');
    const hero = AGENT[c.hero];
    return {
      accent: hero.color,
      cls: 'cover',
      html: `${stars(7, 260, 270, 337)}
      <div class="cover-top">
        <div class="kicker">PATCH NOTES</div>
        <div class="bigver">${esc(doc.version)}</div>
        <h1 class="title">${esc(doc.title)}</h1>
        <p class="subtitle">${esc(doc.subtitle)}</p>
      </div>
      <div class="stage">
        <div class="lineup">${lineup}</div>
        <div class="hero">${sprite('star', 9, { cls: 'halo' })}${sprite(hero.sprite, 12)}</div>
        <div class="floor"></div>
      </div>`,
    };
  },

  summary(doc, c) {
    const items = c.items.map((it) => `<li>${tagChip(it.tag)}<span>${md(it.text)}</span></li>`).join('');
    return {
      html: `<h2 class="h">${esc(c.heading)}</h2>
      <ul class="summary">${items}</ul>
      ${c.comment ? `<blockquote class="dev"><div class="from">— ${esc(c.comment.from)}</div><p>${md(c.comment.text)}</p></blockquote>` : ''}`,
    };
  },

  'agent-new'(doc, c) {
    const a = AGENT[c.agent];
    const skills = c.skills.map((s) => `<div class="skill">
        <div class="ico">${sprite(s.icon, 4)}<span class="key">${esc(s.key)}</span></div>
        <div><div class="sname">${esc(s.name)}</div><div class="stext">${md(s.text)}</div></div>
      </div>`).join('');
    return {
      accent: a.color,
      cls: 'agentnew',
      html: `${stars(11, 160, 270, 337)}
      <div class="newhead">
        <div class="portrait">${sprite(a.sprite, 11)}</div>
        <div class="who">
          <span class="chip" style="--c:${C.purple}">★ 신규 요원</span>
          <h2 class="agentname">${esc(c.name)}</h2>
          <div class="role">${esc(c.role)}</div>
          ${c.quote ? `<p class="quote">“${esc(c.quote)}”</p>` : ''}
        </div>
      </div>
      <div class="skills">${skills}</div>
      <div class="pair">
        <div class="box ult"><div class="sname">${esc(c.extra.name)}</div><div class="stext">${md(c.extra.text)}</div></div>
        <div class="box"><div class="sname">패시브 · ${esc(c.passive.name)}</div><div class="stext">${md(c.passive.text)}</div></div>
      </div>`,
    };
  },

  changes(doc, c) {
    const a = c.agent ? AGENT[c.agent] : null;
    const rows = c.items.map((it) => {
      const lines = it.lines.map((l) => l.text != null
        ? `<div class="ln"><span class="lb">${esc(l.label)}</span><span class="tx">${md(l.text)}</span></div>`
        : `<div class="ln"><span class="lb">${esc(l.label)}</span><span class="was">${esc(l.before)}</span><span class="arrow">→</span><span class="now" style="color:${TAG[it.tag]?.color ?? C.white}">${esc(l.after)}</span></div>`).join('');
      const ico = it.icon ? sprite(it.icon, 4) : it.agent ? sprite(AGENT[it.agent].sprite, 3) : `<div class="noico">P</div>`;
      return `<div class="change" style="--c:${TAG[it.tag]?.color ?? C.white}">
        <div class="cico">${ico}</div>
        <div class="cbody">
          <div class="chead"><span class="cname">${esc(it.skill)}</span>${tagChip(it.tag)}</div>
          ${lines}
          ${it.note ? `<p class="cnote">${md(it.note)}</p>` : ''}
        </div>
      </div>`;
    }).join('');
    const dense = c.items.length >= 5 ? 'dense' : '';
    return {
      accent: a?.color ?? C.red,
      cls: `changes ${dense}`,
      html: `<div class="agenthead">
        ${a ? `<div class="mini">${sprite(a.sprite, 6)}</div>` : `<div class="mini duo">${c.items.map((it) => it.agent ? sprite(AGENT[it.agent].sprite, 5) : '').join('')}</div>`}
        <div><div class="kicker">요원 업데이트</div><h2 class="h">${esc(c.heading)}</h2></div>
      </div>
      ${c.intro ? `<p class="intro">${md(c.intro)}</p>` : ''}
      <div class="changelist">${rows}</div>
      ${showcase(c.showcase)}`,
    };
  },

  guns(doc, c) {
    const rows = c.guns.map((g) => `<div class="gun">
        <div class="gimg">${sprite(`gun_${g.id}`, 5)}</div>
        <div class="gbody">
          <div class="chead"><span class="cname">${esc(g.name)}</span>${g.tag ? tagChip(g.tag) : ''}</div>
          <div class="stext">${md(g.text)}</div>
          ${g.change ? `<div class="gchange" style="color:${TAG[g.tag]?.color ?? C.white}">${esc(g.change)}</div>` : ''}
        </div>
      </div>`).join('');
    return {
      accent: C.gold,
      html: `<div class="kicker">무기</div><h2 class="h">${esc(c.heading)}</h2>
      ${c.intro ? `<p class="intro">${md(c.intro)}</p>` : ''}
      <div class="guns">${rows}</div>`,
    };
  },

  extra(doc, c) {
    return {
      html: `<div class="kicker">시스템</div><h2 class="h">${esc(c.heading)}</h2>
      <ul class="extra">${c.items.map((t) => `<li>${md(t)}</li>`).join('')}</ul>
      <div class="extra-art">${['chaser0', 'charger0', 'ranged0', 'carapace0', 'resonator0'].map((n, k) => sprite(n, 5, { flip: k % 2 === 0 })).join('')}</div>`,
    };
  },

  chart(doc, c) {
    const max = Math.max(50, ...c.rows.map((r) => r.value)) ;
    const [lo, hi] = c.target;
    const pct = (v) => `${(v / max) * 100}%`;
    const bars = c.rows.map((r) => {
      const a = AGENT[r.agent];
      const inBand = r.value >= lo && r.value <= hi;
      return `<div class="bar">
        <div class="bwho">${sprite(a.sprite, 3)}<span>${esc(r.name)}</span>${r.badge ? `<span class="chip" style="--c:${C.purple}">${esc(r.badge)}</span>` : ''}</div>
        <div class="btrack">
          <div class="band" style="left:${pct(lo)};width:${pct(hi - lo)}"></div>
          <div class="bfill" style="width:${pct(r.value)};background:${a.color}"></div>
          <span class="bval ${inBand ? '' : 'out'}">${r.value}%</span>
        </div>
        <div class="bbefore">${r.before ? `이전 ${esc(r.before)}%` : ''}</div>
      </div>`;
    }).join('');
    return {
      html: `<div class="kicker">밸런스 리포트</div><h2 class="h">${esc(c.heading)}</h2>
      <p class="intro">${md(c.caption)}</p>
      <div class="chart">${bars}
        <div class="axis"><span style="left:${pct(lo)}">${lo}%</span><span style="left:${pct(hi)}">${hi}%</span><span style="left:100%">${max}%</span></div>
      </div>
      ${c.note ? `<p class="cnote big">${md(c.note)}</p>` : ''}`,
    };
  },

  outro(doc, c) {
    return {
      cls: 'outro',
      html: `${stars(23, 200, 270, 337)}
      <div class="kicker">PREVIEW</div><h2 class="h">${esc(c.heading)}</h2>
      <ol class="next">${c.items.map((t) => `<li>${md(t)}</li>`).join('')}</ol>
      <div class="signoff">${esc(c.signoff)}</div>
      <div class="lineup end">${Object.values(AGENT).map((a, k) => sprite(a.sprite, 6, { flip: k >= 3 })).join('')}</div>`,
    };
  },
};

// ── 문서 ────────────────────────────────────────────────────────────
function css(fontBase) {
  return `
@font-face { font-family: G; src: url('${fontBase}/Galmuri11.woff2') format('woff2'); font-weight: 400; }
@font-face { font-family: G; src: url('${fontBase}/Galmuri11-Bold.woff2') format('woff2'); font-weight: 700; }
@font-face { font-family: G9; src: url('${fontBase}/Galmuri9.woff2') format('woff2'); }
@page { size: 1080px 1350px; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #05070a; }
body { font-family: G, sans-serif; color: ${C.white}; -webkit-font-smoothing: none; word-break: keep-all; overflow-wrap: anywhere; }
.card { position: relative; width: 1080px; height: 1350px; overflow: hidden; background: ${C.ink}; break-after: page; display: flex; flex-direction: column; }
.card::before { content: ''; position: absolute; inset: 0; background:
  linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent) 0, transparent 38%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.018) 0 2px, transparent 2px 6px); pointer-events: none; }
.grain { position: absolute; inset: 0; background-image: linear-gradient(${C.navy2} 1px, transparent 1px), linear-gradient(90deg, ${C.navy2} 1px, transparent 1px); background-size: 54px 54px; opacity: .35; pointer-events: none; }
.stars { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1; }
.px { display: block; image-rendering: pixelated; }
.top, .bottom { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; padding: 0 64px; font-size: 26px; }
.top { height: 110px; border-bottom: 4px solid var(--accent); }
.brand { font-weight: 700; letter-spacing: 2px; }
.brand i { font-style: normal; color: var(--accent); margin-left: 10px; font-family: G9; font-size: 22px; letter-spacing: 6px; }
.ver { font-family: G9; letter-spacing: 4px; color: ${C.ink}; background: var(--accent); padding: 8px 16px; }
.bottom { height: 84px; margin-top: auto; color: ${C.dim}; font-family: G9; letter-spacing: 3px; border-top: 2px solid ${C.line}; }
.page { color: ${C.white}; }
.body { position: relative; z-index: 1; flex: 1; padding: 56px 64px 40px; display: flex; flex-direction: column; }
.kicker { font-family: G9; letter-spacing: 8px; color: var(--accent); font-size: 26px; margin-bottom: 14px; }
.h { font-size: 76px; font-weight: 700; line-height: 1.05; margin-bottom: 34px; text-shadow: 6px 6px 0 rgba(0,0,0,.55); }
.intro { font-size: 30px; line-height: 1.55; color: #c9c4bb; margin-bottom: 36px; border-left: 8px solid var(--accent); padding-left: 24px; }
b { color: var(--accent); font-weight: 700; }
.chip { display: inline-flex; align-items: center; gap: 6px; font-family: G9; font-size: 22px; letter-spacing: 2px; color: ${C.ink}; background: var(--c); padding: 6px 12px; white-space: nowrap; }

/* 표지 */
.cover .body { padding-top: 40px; }
.cover-top { position: relative; z-index: 2; }
.cover .kicker { font-size: 34px; letter-spacing: 14px; }
.bigver { font-size: 250px; font-weight: 700; line-height: .9; color: var(--accent); text-shadow: 12px 12px 0 #2a1740, 12px 12px 0 rgba(0,0,0,.6); letter-spacing: -4px; }
.title { font-size: 92px; margin-top: 26px; text-shadow: 6px 6px 0 rgba(0,0,0,.6); }
.subtitle { font-size: 32px; color: #c9c4bb; margin-top: 18px; }
.stage { position: relative; margin-top: auto; height: 520px; }
.lineup { display: flex; justify-content: space-between; align-items: flex-end; position: absolute; left: 0; right: 0; bottom: 46px; }
.lineup .mate:nth-child(n+3) { order: 2; }
.lineup::after { content: ''; order: 1; width: 330px; }
.mate { filter: drop-shadow(0 10px 0 rgba(0,0,0,.5)); opacity: .9; }
.hero { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; }
.hero .halo { position: absolute; top: -70px; opacity: .9; filter: drop-shadow(0 0 30px ${C.purple}); }
.hero > svg:last-child { position: relative; filter: drop-shadow(0 0 40px color-mix(in srgb, var(--accent) 70%, transparent)) drop-shadow(10px 12px 0 rgba(0,0,0,.6)); }
.floor { position: absolute; left: -64px; right: -64px; bottom: 0; height: 46px; background: repeating-linear-gradient(90deg, ${C.navy2} 0 36px, ${C.navy} 36px 72px); border-top: 6px solid var(--accent); }

/* 요약 */
.summary { list-style: none; display: flex; flex-direction: column; gap: 26px; }
.summary li { display: flex; gap: 22px; align-items: flex-start; font-size: 34px; line-height: 1.45; background: ${C.navy}; padding: 26px 28px; border-left: 6px solid ${C.line}; }
.summary .chip { margin-top: 4px; }
.dev { margin-top: auto; background: ${C.navy2}; padding: 32px 36px; position: relative; border: 3px solid ${C.line}; }
.dev .from { font-family: G9; color: var(--accent); letter-spacing: 4px; font-size: 24px; margin-bottom: 12px; }
.dev p { font-size: 29px; line-height: 1.6; color: #d8d3ca; }

/* 신규 요원 */
.newhead { display: flex; gap: 40px; align-items: flex-end; margin-bottom: 40px; }
.portrait { background: radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--accent) 45%, transparent), transparent 65%); padding: 10px 20px 0; filter: drop-shadow(8px 10px 0 rgba(0,0,0,.6)); }
.agentname { font-size: 120px; font-weight: 700; line-height: 1; margin: 18px 0 10px; color: var(--accent); text-shadow: 8px 8px 0 rgba(0,0,0,.6); }
.role { font-family: G9; letter-spacing: 4px; font-size: 26px; color: ${C.dim}; }
.quote { margin-top: 22px; font-size: 28px; line-height: 1.5; color: #d8d3ca; }
.skills { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.skill { display: flex; gap: 18px; background: ${C.navy}; padding: 20px; border-top: 4px solid var(--accent); }
.ico { position: relative; flex: none; }
.key { position: absolute; right: -8px; bottom: -8px; background: ${C.white}; color: ${C.ink}; font-family: G9; font-size: 20px; padding: 2px 8px; }
.sname { font-size: 31px; font-weight: 700; margin-bottom: 8px; }
.stext { font-size: 25px; line-height: 1.5; color: #c9c4bb; }
.pair { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; }
.box { background: ${C.navy2}; padding: 22px; border: 3px solid ${C.line}; }
.box.ult { border-color: var(--accent); }

/* 변경 목록 */
.agenthead { display: flex; align-items: flex-end; gap: 34px; margin-bottom: 8px; }
.agenthead .h { margin-bottom: 18px; color: var(--accent); }
.mini { filter: drop-shadow(6px 8px 0 rgba(0,0,0,.6)); }
.mini.duo { display: flex; gap: 10px; }
.changelist { display: flex; flex-direction: column; gap: 22px; }
.change { display: flex; gap: 26px; background: ${C.navy}; padding: 26px; border-left: 8px solid var(--c); }
.cico { flex: none; width: 88px; display: flex; justify-content: center; }
.noico { width: 88px; height: 88px; display: grid; place-items: center; background: ${C.navy2}; font-size: 44px; font-weight: 700; color: var(--c); border: 3px solid var(--c); }
.cbody { flex: 1; }
.chead { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
.cname { font-size: 36px; font-weight: 700; }
.ln { display: flex; align-items: baseline; gap: 18px; font-size: 31px; padding: 8px 0; border-top: 2px dashed ${C.line}; }
.ln:first-of-type { border-top: 0; }
.lb { width: 230px; flex: none; color: ${C.dim}; font-size: 27px; }
.was { color: #6e7884; text-decoration: line-through; text-decoration-thickness: 3px; }
.arrow { color: ${C.dim}; }
.now { font-weight: 700; }
.tx { font-size: 28px; line-height: 1.5; color: #d8d3ca; }
.cnote { margin-top: 12px; font-size: 25px; line-height: 1.5; color: ${C.dim}; }
.cnote.big { font-size: 28px; margin-top: auto; }
.dense .change { padding: 18px 24px; }
.dense .chead { margin-bottom: 6px; }
.dense .intro { font-size: 27px; margin-bottom: 26px; }
.dense .changelist { gap: 16px; }

.showcase { margin: auto -64px -40px; padding: 30px 64px 0; display: flex; justify-content: space-evenly; align-items: flex-end; gap: 30px;
  background: linear-gradient(180deg, transparent 0, transparent calc(100% - 40px), ${C.navy2} calc(100% - 40px)); border-bottom: 0; }
.showcase .px { filter: drop-shadow(8px 8px 0 rgba(0,0,0,.55)); margin-bottom: 24px; }

/* 총 */
.guns { display: grid; grid-template-columns: 1fr; gap: 16px; }
.gun { display: flex; align-items: center; gap: 28px; background: ${C.navy}; padding: 18px 24px; }
.gimg { width: 200px; flex: none; display: flex; justify-content: center; filter: drop-shadow(5px 6px 0 rgba(0,0,0,.6)); }
.gbody { flex: 1; }
.gun .chead { margin-bottom: 4px; }
.gun .cname { font-size: 32px; }
.gchange { font-size: 25px; margin-top: 6px; font-weight: 700; }

/* 기타 */
.extra { list-style: none; display: flex; flex-direction: column; gap: 24px; }
.extra li { font-size: 33px; line-height: 1.55; padding-left: 40px; position: relative; }
.extra li::before { content: '■'; position: absolute; left: 0; color: var(--accent); font-size: 22px; top: 8px; }
.extra-art { margin-top: auto; display: flex; justify-content: space-around; align-items: flex-end; opacity: .85; padding-top: 40px; }

/* 차트 */
.chart { position: relative; display: flex; flex-direction: column; gap: 26px; margin-top: 10px; padding-bottom: 50px; }
.bar { display: grid; grid-template-columns: 300px 1fr; grid-template-rows: auto auto; column-gap: 20px; align-items: center; }
.bwho { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; }
.btrack { position: relative; height: 56px; background: ${C.navy}; }
.band { position: absolute; top: -8px; bottom: -8px; background: rgba(62,230,196,.10); border-left: 3px dashed ${C.teal}; border-right: 3px dashed ${C.teal}; }
.bfill { position: absolute; left: 0; top: 10px; bottom: 10px; box-shadow: 6px 6px 0 rgba(0,0,0,.5); }
.bval { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); font-size: 30px; font-weight: 700; }
.bval.out { color: ${C.red}; }
.bbefore { grid-column: 2; font-size: 22px; color: ${C.dim}; margin-top: 6px; min-height: 22px; font-family: G9; letter-spacing: 1px; }
.axis { position: absolute; left: 320px; right: 0; bottom: 0; height: 30px; font-family: G9; font-size: 22px; color: ${C.teal}; }
.axis span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.axis span:last-child { color: ${C.dim}; transform: translateX(-100%); }

/* 마무리 */
.next { list-style: none; counter-reset: n; display: flex; flex-direction: column; gap: 26px; position: relative; z-index: 2; }
.next li { counter-increment: n; font-size: 36px; line-height: 1.5; display: flex; gap: 26px; background: rgba(20,28,37,.85); padding: 26px 30px; }
.next li::before { content: counter(n, decimal-leading-zero); font-family: G9; color: var(--accent); font-size: 30px; padding-top: 6px; }
.signoff { margin-top: 56px; font-size: 64px; font-weight: 700; text-align: center; color: var(--accent); text-shadow: 6px 6px 0 rgba(0,0,0,.6); position: relative; z-index: 2; }
.lineup.end { position: static; margin-top: auto; display: flex; justify-content: center; gap: 22px; align-items: flex-end; }
.lineup.end::after { display: none; }
`;
}

export function renderDoc(doc, { fontBase }) {
  const n = doc.cards.length;
  const cards = doc.cards.map((c, i) => {
    const r = RENDER[c.type];
    if (!r) throw new Error(`알 수 없는 카드 종류: ${c.type}`);
    const out = r(doc, c);
    return frame(doc, i, n, out.html, { accent: out.accent, cls: out.cls });
  }).join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>집중포화 패치 ${esc(doc.version)} — ${esc(doc.title)}</title>
<style>${css(fontBase)}</style></head><body>${cards}</body></html>`;
}

async function loadPlaywright() {
  const tries = [() => import('playwright')];
  try {
    const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
    tries.push(() => import(pathToFileURL(createRequire(join(g, 'x.js')).resolve('playwright')).href));
  } catch {}
  if (process.env.PLAYWRIGHT_MODULE) tries.push(() => import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href));
  for (const t of tries) {
    try {
      const m = await t();
      const chromium = m.chromium ?? m.default?.chromium;
      if (chromium) return { chromium };
    } catch {}
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--'));
  if (!src) throw new Error('사용법: node patchnotes/build.mjs patchnotes/<버전>.json [--png]');
  const doc = JSON.parse(readFileSync(src, 'utf8'));
  const outDir = dirname(resolve(src));
  const stem = basename(src, '.json');
  const htmlPath = join(outDir, `${stem}.html`);
  const fontBase = relative(outDir, join(ROOT, 'assets/fonts')).split('\\').join('/');
  writeFileSync(htmlPath, renderDoc(doc, { fontBase }));
  console.log(`HTML: ${relative(process.cwd(), htmlPath)}`);

  const pw = await loadPlaywright();
  if (!pw) {
    console.log('Playwright 가 없어 PDF 는 건너뜀: npm i -D playwright && npx playwright install chromium');
    return;
  }
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(() => document.fonts.ready);
  const pdfPath = join(outDir, `${stem}.pdf`);
  await page.pdf({ path: pdfPath, width: '1080px', height: '1350px', printBackground: true, preferCSSPageSize: true });
  console.log(`PDF: ${relative(process.cwd(), pdfPath)}`);
  if (args.includes('--png')) {
    const dir = join(outDir, stem);
    mkdirSync(dir, { recursive: true });
    const cards = await page.$$('.card');
    for (let i = 0; i < cards.length; i++) await cards[i].screenshot({ path: join(dir, `${String(i + 1).padStart(2, '0')}.png`) });
    console.log(`PNG: ${relative(process.cwd(), dir)}/ (${cards.length}장)`);
  }
  await browser.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
