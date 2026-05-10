'use strict';

(() => {

const Const = Object.freeze({
  INTERP_MODES: ['Linear', 'Cubic', 'Constant'],
  PAD_LEFT: 40,
  PAD_RIGHT: 20,
  PAD_TOP: 30,
  PAD_BOTTOM: 14,
  MIN_VIEW_MS: 1000,
  VIBRATE_CHUNK_MS: 40,
  AUDIO_FREQ_LOW: 38,
  AUDIO_FREQ_HIGH: 65,
  AUDIO_MAX_GAIN: 0.55,
});

const Presets = Object.freeze({
  rampUp: [
    { time: 0,   value: 0.3, interp: 'Linear' },
    { time: 100, value: 0.4, interp: 'Linear' },
    { time: 300, value: 0.8, interp: 'Linear' },
    { time: 400, value: 1.0, interp: 'Linear' },
  ],
  pulse: [
    { time: 0,   value: 0, interp: 'Linear' },
    { time: 50,  value: 1, interp: 'Linear' },
    { time: 150, value: 1, interp: 'Linear' },
    { time: 200, value: 0, interp: 'Linear' },
  ],
  heartbeat: [
    { time: 0,   value: 0,   interp: 'Cubic' },
    { time: 60,  value: 0.9, interp: 'Cubic' },
    { time: 120, value: 0.1, interp: 'Cubic' },
    { time: 200, value: 0.7, interp: 'Cubic' },
    { time: 280, value: 0,   interp: 'Linear' },
    { time: 800, value: 0,   interp: 'Linear' },
  ],
  explosion: [
    { time: 0,   value: 1.0, interp: 'Linear' },
    { time: 50,  value: 0.9, interp: 'Cubic' },
    { time: 200, value: 0.5, interp: 'Cubic' },
    { time: 500, value: 0.2, interp: 'Cubic' },
    { time: 800, value: 0,   interp: 'Linear' },
  ],
  rumble: [
    { time: 0,   value: 0.4, interp: 'Cubic' },
    { time: 100, value: 0.8, interp: 'Cubic' },
    { time: 200, value: 0.4, interp: 'Cubic' },
    { time: 300, value: 0.7, interp: 'Cubic' },
    { time: 400, value: 0.3, interp: 'Cubic' },
    { time: 500, value: 0.6, interp: 'Cubic' },
    { time: 600, value: 0,   interp: 'Linear' },
  ],
  click: [
    { time: 0,  value: 1, interp: 'Linear' },
    { time: 30, value: 0, interp: 'Linear' },
  ],
});

const BuiltinShapes = Object.freeze({
  UIHover: [
    { time: 0,  value: 0.35, interp: 'Linear' },
    { time: 30, value: 0,    interp: 'Linear' },
  ],
  UIClick: [
    { time: 0,  value: 0.85, interp: 'Linear' },
    { time: 25, value: 0,    interp: 'Linear' },
  ],
  UINotification: [
    { time: 0,   value: 0.6, interp: 'Linear' },
    { time: 60,  value: 0,   interp: 'Linear' },
    { time: 120, value: 0.6, interp: 'Linear' },
    { time: 180, value: 0,   interp: 'Linear' },
  ],
  GameplayExplosion: [
    { time: 0,   value: 1.0, interp: 'Cubic'  },
    { time: 80,  value: 0.6, interp: 'Cubic'  },
    { time: 250, value: 0.3, interp: 'Cubic'  },
    { time: 500, value: 0,   interp: 'Linear' },
  ],
  GameplayCollision: [
    { time: 0,   value: 0.95, interp: 'Linear' },
    { time: 90,  value: 0.2,  interp: 'Linear' },
    { time: 130, value: 0,    interp: 'Linear' },
  ],
});

const state = {
  type: 'UIClick',
  position: { x: 0, y: 0, z: 0 },
  radius: 3,
  looped: false,
  varName: 'effect',
  keys: clone(Presets.rampUp),
  codeMode: 'luau',
};

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

const $ = id => document.getElementById(id);

const dom = {
  canvas: $('waveCanvas'),
  canvasWrap: $('canvasWrap'),
  emptyMsg: $('emptyMsg'),
  keysList: $('keysList'),
  codeOut: $('codeOutput'),
  editorMode: $('editorMode'),
  toast: $('toast'),
  vibrateBtn: $('vibrateBtn'),
};

const ctx = dom.canvas.getContext('2d');

const Wave = {
  maxTime() {
    if (state.keys.length === 0) return Const.MIN_VIEW_MS;
    const last = Math.max(...state.keys.map(k => k.time));
    return Math.max(Const.MIN_VIEW_MS, last) * 1.05;
  },

  timeToX(t, w) {
    return Const.PAD_LEFT + (t / this.maxTime()) * (w - Const.PAD_LEFT - Const.PAD_RIGHT);
  },

  xToTime(x, w) {
    const usable = w - Const.PAD_LEFT - Const.PAD_RIGHT;
    return Math.max(0, ((x - Const.PAD_LEFT) / usable) * this.maxTime());
  },

  valueToY(v, h) {
    return Const.PAD_TOP + (1 - v) * (h - Const.PAD_TOP - Const.PAD_BOTTOM);
  },

  yToValue(y, h) {
    const usable = h - Const.PAD_TOP - Const.PAD_BOTTOM;
    return clamp01(1 - (y - Const.PAD_TOP) / usable);
  },

  sample(t, keys) {
    if (keys.length === 0) return 0;
    if (t <= keys[0].time) return keys[0].value;
    const last = keys[keys.length - 1];
    if (t >= last.time) return last.value;

    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t >= a.time && t <= b.time) {
        const span = b.time - a.time;
        if (span === 0) return b.value;
        const u = (t - a.time) / span;
        switch (a.interp) {
          case 'Constant': return a.value;
          case 'Cubic': {
            const s = u * u * (3 - 2 * u);
            return a.value + (b.value - a.value) * s;
          }
          default: return a.value + (b.value - a.value) * u;
        }
      }
    }
    return 0;
  },

  activeKeys() {
    const src = state.type === 'Custom' ? state.keys : (BuiltinShapes[state.type] || []);
    return [...src].sort((a, b) => a.time - b.time);
  },

  duration(keys) {
    return keys.length ? keys[keys.length - 1].time : 0;
  },
};

const Renderer = {
  resize() {
    const rect = dom.canvasWrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dom.canvas.width = rect.width * dpr;
    dom.canvas.height = rect.height * dpr;
    dom.canvas.style.width = rect.width + 'px';
    dom.canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  },

  draw() {
    const w = dom.canvas.clientWidth;
    const h = dom.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    if (state.type !== 'Custom') {
      dom.emptyMsg.style.display = 'flex';
      return;
    }
    dom.emptyMsg.style.display = 'none';

    const keys = [...state.keys].sort((a, b) => a.time - b.time);
    if (keys.length === 0) return;

    const max = Wave.maxTime();
    const samples = 200;

    this._drawTimeMarkers(w, h, max);
    this._drawFill(keys, w, h, max, samples);
    this._drawCurve(keys, w, h, max, samples);
    this._drawValueGuides(w, h);
    this._drawKeys(keys, w, h);

    const ph = Haptics.getPlayhead();
    if (ph) this._drawPlayhead(ph.time, w, h);
  },

  _drawValueGuides(w, h) {
    const xStart = Const.PAD_LEFT;
    const xEnd = w - Const.PAD_RIGHT;
    const y1 = Wave.valueToY(1, h);
    const y0 = Wave.valueToY(0, h);
    const yMid = Wave.valueToY(0.5, h);

    ctx.strokeStyle = 'rgba(139, 139, 150, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(xStart, y1); ctx.lineTo(xEnd, y1);
    ctx.moveTo(xStart, yMid); ctx.lineTo(xEnd, yMid);
    ctx.moveTo(xStart, y0); ctx.lineTo(xEnd, y0);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#8b8b96';
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('1.0', xStart - 8, y1);
    ctx.fillText('0.5', xStart - 8, yMid);
    ctx.fillText('0.0', xStart - 8, y0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
  },

  _drawPlayhead(time, w, h) {
    const x = Wave.timeToX(time, w);
    const top = Const.PAD_TOP;
    const bottom = h - Const.PAD_BOTTOM;

    ctx.strokeStyle = 'rgba(196, 240, 0, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.fillStyle = '#c4f000';
    ctx.beginPath();
    ctx.moveTo(x - 5, top - 1);
    ctx.lineTo(x + 5, top - 1);
    ctx.lineTo(x, top + 6);
    ctx.closePath();
    ctx.fill();
  },

  _drawFill(keys, w, h, max, samples) {
    const grad = ctx.createLinearGradient(0, Wave.valueToY(1, h), 0, Wave.valueToY(0, h));
    grad.addColorStop(0, 'rgba(196, 240, 0, 0.4)');
    grad.addColorStop(1, 'rgba(196, 240, 0, 0.02)');

    ctx.beginPath();
    ctx.moveTo(Wave.timeToX(0, w), Wave.valueToY(0, h));
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * max;
      const v = Wave.sample(t, keys);
      ctx.lineTo(Wave.timeToX(t, w), Wave.valueToY(v, h));
    }
    ctx.lineTo(Wave.timeToX(max, w), Wave.valueToY(0, h));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  },

  _drawCurve(keys, w, h, max, samples) {
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * max;
      const v = Wave.sample(t, keys);
      const x = Wave.timeToX(t, w);
      const y = Wave.valueToY(v, h);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#c4f000';
    ctx.lineWidth = 2;
    ctx.stroke();
  },

  _drawTimeMarkers(w, h, max) {
    ctx.fillStyle = '#555560';
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const lineTop = Const.PAD_TOP;
    const lineBottom = h - Const.PAD_BOTTOM;
    for (let i = 1; i <= 4; i++) {
      const t = (i / 4) * max;
      const x = Wave.timeToX(t, w);
      ctx.fillText(Math.round(t) + 'ms', x, 14);
      ctx.strokeStyle = 'rgba(53, 53, 65, 0.5)';
      ctx.beginPath();
      ctx.moveTo(x, lineTop);
      ctx.lineTo(x, lineBottom);
      ctx.stroke();
    }
  },

  _drawKeys(keys, w, h) {
    keys.forEach((k, i) => {
      const x = Wave.timeToX(k.time, w);
      const y = Wave.valueToY(k.value, h);

      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0d';
      ctx.fill();
      ctx.strokeStyle = '#c4f000';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#c4f000';
      ctx.fill();

      ctx.fillStyle = '#8b8b96';
      ctx.font = "10px 'Space Mono', monospace";
      ctx.fillText(i, x, y - 12);
    });
  },
};

const KeysList = {
  rebuild() {
    if (state.type !== 'Custom') {
      dom.keysList.innerHTML = '';
      return;
    }

    state.keys.sort((a, b) => a.time - b.time);

    dom.keysList.innerHTML = state.keys.map((k, i) => `
      <div class="key-row">
        <span class="idx">${String(i).padStart(2, '0')}</span>
        <input type="number" min="0" step="10" value="${k.time}" data-i="${i}" data-f="time" title="Time (ms)">
        <input type="number" min="0" max="1" step="0.05" value="${k.value}" data-i="${i}" data-f="value" title="Value (0–1)">
        <select data-i="${i}" data-f="interp" title="Interpolation">
          ${Const.INTERP_MODES.map(m => `<option ${m === k.interp ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <button class="del" data-i="${i}" title="Delete key">×</button>
      </div>
    `).join('');

    dom.keysList.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', this._onFieldChange);
    });
    dom.keysList.querySelectorAll('.del').forEach(el => {
      el.addEventListener('click', this._onDelete);
    });
  },

  _onFieldChange(e) {
    const i = +e.target.dataset.i;
    const f = e.target.dataset.f;
    if (f === 'interp') {
      state.keys[i][f] = e.target.value;
    } else {
      state.keys[i][f] = parseFloat(e.target.value) || 0;
    }
    Renderer.draw();
    CodeGen.update();
  },

  _onDelete(e) {
    const i = +e.currentTarget.dataset.i;
    state.keys.splice(i, 1);
    render();
  },
};

const CodeGen = {
  generate() {
    return state.codeMode === 'ts' ? this._generateTs() : this._generateLuau();
  },

  _generateLuau() {
    const v = state.varName;
    const p = state.position;
    const out = [];

    out.push(`local Workspace = game:GetService("Workspace")`);
    out.push(``);
    out.push(`local ${v} = Instance.new("HapticEffect")`);

    if (state.type !== 'UIClick') {
      out.push(`${v}.Type = Enum.HapticEffectType.${state.type}`);
    }
    if (p.x !== 0 || p.y !== 0 || p.z !== 0) {
      out.push(`${v}.Position = Vector3.new(${p.x}, ${p.y}, ${p.z})`);
    }
    if (state.radius !== 3) {
      out.push(`${v}.Radius = ${state.radius}`);
    }
    if (state.looped !== false) {
      out.push(`${v}.Looped = ${state.looped}`);
    }

    if (state.type === 'Custom' && state.keys.length > 0) {
      const sorted = [...state.keys].sort((a, b) => a.time - b.time);
      out.push(``);
      out.push(`-- Custom waveform: time(ms), value(0-1), interpolation`);
      out.push(`local waveform = {`);
      sorted.forEach((k, i) => {
        const sep = i < sorted.length - 1 ? ',' : '';
        out.push(`\tFloatCurveKey.new(${k.time}, ${k.value}, Enum.KeyInterpolationMode.${k.interp})${sep}`);
      });
      out.push(`}`);
      out.push(`${v}:SetWaveformKeys(waveform)`);
    }

    out.push(``);
    out.push(`${v}.Parent = Workspace`);
    out.push(``);
    out.push(`-- Play the haptic effect`);
    out.push(`${v}:Play()`);

    if (!state.looped) {
      out.push(``);
      out.push(`-- Auto-cleanup when finished`);
      out.push(`${v}.Ended:Once(function()`);
      out.push(`\t${v}:Destroy()`);
      out.push(`end)`);
    }

    return out.join('\n');
  },

  _generateTs() {
    const v = state.varName;
    const p = state.position;
    const out = [];

    out.push(`const Workspace = game.GetService("Workspace");`);
    out.push(``);
    out.push(`const ${v} = new Instance("HapticEffect");`);

    if (state.type !== 'UIClick') {
      out.push(`${v}.Type = Enum.HapticEffectType.${state.type};`);
    }
    if (p.x !== 0 || p.y !== 0 || p.z !== 0) {
      out.push(`${v}.Position = new Vector3(${p.x}, ${p.y}, ${p.z});`);
    }
    if (state.radius !== 3) {
      out.push(`${v}.Radius = ${state.radius};`);
    }
    if (state.looped !== false) {
      out.push(`${v}.Looped = ${state.looped};`);
    }

    if (state.type === 'Custom' && state.keys.length > 0) {
      const sorted = [...state.keys].sort((a, b) => a.time - b.time);
      out.push(``);
      out.push(`// Custom waveform: time(ms), value(0-1), interpolation`);
      out.push(`const waveform = [`);
      sorted.forEach((k, i) => {
        const sep = i < sorted.length - 1 ? ',' : '';
        out.push(`\tnew FloatCurveKey(${k.time}, ${k.value}, Enum.KeyInterpolationMode.${k.interp})${sep}`);
      });
      out.push(`];`);
      out.push(`${v}.SetWaveformKeys(waveform);`);
    }

    out.push(``);
    out.push(`${v}.Parent = Workspace;`);
    out.push(``);
    out.push(`// Play the haptic effect`);
    out.push(`${v}.Play();`);

    if (!state.looped) {
      out.push(``);
      out.push(`// Auto-cleanup when finished`);
      out.push(`${v}.Ended.Once(() => ${v}.Destroy());`);
    }

    return out.join('\n');
  },

  highlight(code) {
    const isTs = state.codeMode === 'ts';
    const KW = isTs
      ? ['const','let','var','function','if','else','return','new','true','false','null','undefined','async','await']
      : ['local','function','end','if','then','else','true','false','nil','return'];
    const GL = ['game','Workspace','Instance','Vector3','Enum','FloatCurveKey'];
    const DOT_FN = ['new','GetService','Connect','Destroy','Once','Play','SetWaveformKeys'];
    const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const wrap = (cls, text) => cls ? `<span class="${cls}">${escape(text)}</span>` : escape(text);

    let out = '';
    let i = 0;
    const n = code.length;

    while (i < n) {
      const c = code[i];
      const c2 = code[i + 1];
      const isLuauComment = !isTs && c === '-' && c2 === '-';
      const isTsComment = isTs && c === '/' && c2 === '/';

      if (isLuauComment || isTsComment) {
        let j = i;
        while (j < n && code[j] !== '\n') j++;
        out += wrap('com', code.slice(i, j));
        i = j;
      } else if (c === '"') {
        let j = i + 1;
        while (j < n && code[j] !== '"') j++;
        if (j < n) j++;
        out += wrap('str', code.slice(i, j));
        i = j;
      } else if (/\d/.test(c)) {
        let j = i;
        while (j < n && /[\d.]/.test(code[j])) j++;
        out += wrap('num', code.slice(i, j));
        i = j;
      } else if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < n && /\w/.test(code[j])) j++;
        const word = code.slice(i, j);
        const prev = i > 0 ? code[i - 1] : '';
        let cls = '';
        if (KW.includes(word)) cls = 'kw';
        else if (GL.includes(word)) cls = 'glob';
        else if (prev === ':') cls = 'fn';
        else if (prev === '.' && DOT_FN.includes(word)) cls = 'fn';
        out += wrap(cls, word);
        i = j;
      } else {
        out += escape(c);
        i++;
      }
    }

    return out;
  },

  update() {
    const code = this.generate();
    dom.codeOut.innerHTML = this.highlight(code);
    dom.codeOut.dataset.raw = code;
  },
};

const Haptics = (() => {
  let activePlayback = null;
  let playback = null;
  let rafId = null;

  function startPlayheadLoop() {
    if (rafId !== null) return;
    const tick = () => {
      if (!playback) {
        rafId = null;
        Renderer.draw();
        return;
      }
      const elapsed = performance.now() - playback.start;
      if (elapsed > playback.duration) {
        playback = null;
        Renderer.draw();
        rafId = null;
        return;
      }
      Renderer.draw();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function getPlayhead() {
    if (!playback) return null;
    const elapsed = performance.now() - playback.start;
    if (elapsed > playback.duration) return null;
    return { time: elapsed, duration: playback.duration };
  }

  function chunkify(keys, totalDuration, chunkMs) {
    const chunks = [];
    for (let start = 0; start < totalDuration; start += chunkMs) {
      const end = Math.min(totalDuration, start + chunkMs);
      const mid = (start + end) / 2;
      chunks.push({ start, duration: end - start, intensity: clamp01(Wave.sample(mid, keys)) });
    }
    return chunks;
  }

  let sharedAudioCtx = null;

  function getAudioContext() {
    if (!sharedAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
      try {
        const buf = sharedAudioCtx.createBuffer(1, 1, 22050);
        const src = sharedAudioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(sharedAudioCtx.destination);
        src.start(0);
      } catch (_) {}
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  }

  function createAudioRumble() {
    const ac = getAudioContext();
    if (!ac) return null;

    const osc1 = ac.createOscillator();
    const osc2 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = Const.AUDIO_FREQ_LOW;
    osc2.type = 'triangle';
    osc2.frequency.value = Const.AUDIO_FREQ_HIGH;

    const gain = ac.createGain();
    gain.gain.value = 0;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ac.destination);
    osc1.start();
    osc2.start();

    let stopped = false;
    return {
      setIntensity(v) {
        if (stopped) return;
        const target = clamp01(v) * Const.AUDIO_MAX_GAIN;
        gain.gain.cancelScheduledValues(ac.currentTime);
        gain.gain.linearRampToValueAtTime(target, ac.currentTime + 0.02);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        gain.gain.cancelScheduledValues(ac.currentTime);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.05);
        setTimeout(() => {
          try {
            osc1.stop();
            osc2.stop();
            osc1.disconnect();
            osc2.disconnect();
            gain.disconnect();
          } catch (_) {}
        }, 100);
      },
    };
  }

  function buildVibratePattern(chunks) {
    const pattern = [];
    for (const c of chunks) {
      const on = Math.round(c.duration * c.intensity);
      const off = c.duration - on;
      pattern.push(on, off);
    }
    return pattern;
  }

  function getConnectedGamepads() {
    if (typeof navigator.getGamepads !== 'function') return [];
    return Array.from(navigator.getGamepads()).filter(p => p && p.vibrationActuator);
  }

  function play() {
    if (activePlayback) {
      activePlayback.stop();
      activePlayback = null;
    }

    const keys = Wave.activeKeys();
    const duration = Wave.duration(keys);
    if (!keys.length || duration <= 0) {
      Toast.warn('NOTHING TO PLAY');
      return;
    }

    const chunks = chunkify(keys, duration, Const.VIBRATE_CHUNK_MS);
    const channels = [];

    const pads = getConnectedGamepads();
    if (pads.length > 0) channels.push(`GAMEPAD×${pads.length}`);

    const canVibrate = typeof navigator.vibrate === 'function';
    if (canVibrate) {
      try {
        navigator.vibrate(buildVibratePattern(chunks));
        channels.push('DEVICE');
      } catch (_) {}
    }

    const audio = createAudioRumble();
    if (audio) channels.push('AUDIO');

    const timers = [];
    chunks.forEach(c => {
      timers.push(setTimeout(() => {
        for (const pad of pads) {
          try {
            pad.vibrationActuator.playEffect('dual-rumble', {
              startDelay: 0,
              duration: c.duration + 8,
              strongMagnitude: c.intensity,
              weakMagnitude: c.intensity * 0.7,
            });
          } catch (_) {}
        }
        if (audio) audio.setIntensity(c.intensity);
      }, c.start));
    });

    const stopTimer = setTimeout(() => {
      if (audio) audio.stop();
      activePlayback = null;
      playback = null;
      dom.vibrateBtn.classList.remove('playing');
    }, duration + 80);

    activePlayback = {
      stop() {
        timers.forEach(clearTimeout);
        clearTimeout(stopTimer);
        if (audio) audio.stop();
        if (canVibrate) { try { navigator.vibrate(0); } catch (_) {} }
        playback = null;
        dom.vibrateBtn.classList.remove('playing');
      },
    };

    playback = { start: performance.now(), duration };
    startPlayheadLoop();
    dom.vibrateBtn.classList.add('playing');

    if (channels.length === 0) {
      Toast.warn('NO HAPTIC OUTPUT AVAILABLE');
    } else {
      Toast.show(`▸ PLAYING · ${channels.join(' + ')}`);
    }
  }

  return { play, getPlayhead };
})();

const Share = (() => {
  const VERSION = 1;

  function b64UrlEncode(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function b64UrlDecode(str) {
    let padded = str.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4) padded += '=';
    return decodeURIComponent(escape(atob(padded)));
  }

  function encodeState() {
    const payload = {
      v: VERSION,
      t: state.type,
      p: [state.position.x, state.position.y, state.position.z],
      r: state.radius,
      l: state.looped ? 1 : 0,
      n: state.varName,
      k: state.keys.map(k => [k.time, k.value, Const.INTERP_MODES.indexOf(k.interp)]),
    };
    return b64UrlEncode(JSON.stringify(payload));
  }

  function decodeState(str) {
    try {
      const data = JSON.parse(b64UrlDecode(str));
      if (data.v !== VERSION || !Array.isArray(data.p) || !Array.isArray(data.k)) return null;
      return {
        type: data.t,
        position: { x: data.p[0] || 0, y: data.p[1] || 0, z: data.p[2] || 0 },
        radius: data.r || 0,
        looped: !!data.l,
        varName: data.n || 'effect',
        keys: data.k.map(([time, value, interpIdx]) => ({
          time: time || 0,
          value: clamp01(value || 0),
          interp: Const.INTERP_MODES[interpIdx] || 'Linear',
        })),
      };
    } catch (_) {
      return null;
    }
  }

  function buildUrl() {
    const url = new URL(window.location.href);
    url.hash = 's=' + encodeState();
    return url.toString();
  }

  function applyFromHash() {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    const data = params.get('s');
    if (!data) return false;
    const decoded = decodeState(data);
    if (!decoded) return false;
    Object.assign(state, decoded);
    return true;
  }

  async function share() {
    const url = buildUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Haptic 650', text: 'Roblox haptic effect', url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      Toast.show('SHARE LINK COPIED');
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
      Toast.show('SHARE LINK COPIED');
    }
  }

  return { share, applyFromHash };
})();

const Toast = (() => {
  let timer;
  function show(msg, opts = {}) {
    dom.toast.textContent = msg;
    dom.toast.classList.toggle('warn', !!opts.warn);
    dom.toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => dom.toast.classList.remove('show'), opts.duration || 1800);
  }
  return {
    show,
    warn: msg => show(msg, { warn: true }),
  };
})();

const Preview = (() => {
  const MOTORS = [
    { name: 'Phone\nMotor',         x: 0,    y: 0,    z: 0, color: '#ff7849' },
    { name: 'VR Left\nHand Motor',  x: -1,   y: 0,    z: 0, color: '#3a8b9c' },
    { name: 'VR Right\nHand Motor', x: 1,    y: 0,    z: 0, color: '#3a8b9c' },
    { name: 'Gamepad\nSmall Left',  x: -0.5, y: 0.5,  z: 0, color: '#5a4cad' },
    { name: 'Gamepad\nSmall Right', x: 0.5,  y: 0.5,  z: 0, color: '#5a4cad' },
    { name: 'Gamepad\nLarge Left',  x: -0.5, y: -0.5, z: 0, color: '#5a4cad' },
    { name: 'Gamepad\nLarge Right', x: 0.5,  y: -0.5, z: 0, color: '#5a4cad' },
  ];

  const VIEW_HALF = 2.0;
  const MOTOR_W = 76;
  const MOTOR_H = 38;
  const BOUNDARY_EPSILON = 0.001;

  let canvas, pctx, panel;
  let isOpen = false;
  let observer = null;
  let dragMode = null;

  function init() {
    canvas = $('previewCanvas');
    pctx = canvas.getContext('2d');
    panel = $('previewPanel');
    $('previewBtn').addEventListener('click', toggle);
    $('previewClose').addEventListener('click', close);
    document.addEventListener('keydown', e => {
      if (isOpen && e.key === 'Escape') close();
    });
    bindInteraction();
  }

  function getViewParams() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    return {
      w, h,
      cx: w / 2,
      cy: h / 2,
      scale: Math.min(w, h) / (VIEW_HALF * 2),
    };
  }

  function eventToPixels(e) {
    const rect = canvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  function pixelsToWorld(px, py) {
    const { cx, cy, scale } = getViewParams();
    return { x: (px - cx) / scale, y: (cy - py) / scale };
  }

  function detectHit(e) {
    const { px, py } = eventToPixels(e);
    const { cx, cy, scale } = getViewParams();
    const pos = state.position;
    const posPxX = cx + pos.x * scale;
    const posPxY = cy - pos.y * scale;
    const distFromPos = Math.hypot(px - posPxX, py - posPxY);
    if (distFromPos < 12) return 'position';
    if (state.radius > 0 && Math.abs(distFromPos - state.radius * scale) < 8) return 'radius';
    return null;
  }

  function applyDrag(e) {
    const { px, py } = eventToPixels(e);
    const { cx, cy, scale } = getViewParams();

    if (dragMode === 'radius') {
      const posPxX = cx + state.position.x * scale;
      const posPxY = cy - state.position.y * scale;
      const distPx = Math.hypot(px - posPxX, py - posPxY);
      const next = Math.max(0, Math.min(10, distPx / scale));
      state.radius = +next.toFixed(2);
    } else if (dragMode === 'position') {
      const { x, y } = pixelsToWorld(px, py);
      const clamp = v => Math.max(-VIEW_HALF, Math.min(VIEW_HALF, +v.toFixed(2)));
      state.position.x = clamp(x);
      state.position.y = clamp(y);
    }

    syncDom();
    CodeGen.update();
    draw();
  }

  function bindInteraction() {
    $('previewCanvas').addEventListener('mousedown', e => {
      e.preventDefault();
      const hit = detectHit(e);
      dragMode = hit === 'radius' ? 'radius' : 'position';
      applyDrag(e);
    });

    window.addEventListener('mousemove', e => {
      if (dragMode) {
        applyDrag(e);
        return;
      }
      if (!isOpen) return;
      const hit = detectHit(e);
      canvas.style.cursor = hit === 'radius' ? 'ew-resize' : hit === 'position' ? 'grab' : 'crosshair';
    });

    window.addEventListener('mouseup', () => {
      if (dragMode) dragMode = null;
    });
  }

  function toggle() { isOpen ? close() : open(); }

  function open() {
    panel.hidden = false;
    isOpen = true;
    if (!observer) {
      observer = new ResizeObserver(() => draw());
      observer.observe(canvas);
    } else {
      draw();
    }
  }

  function close() {
    panel.hidden = true;
    isOpen = false;
  }

  function update() {
    if (isOpen) draw();
  }

  function distance(motor, p) {
    const dx = motor.x - p.x;
    const dy = motor.y - p.y;
    const dz = motor.z - p.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function drawArrow(x, y, dir) {
    pctx.fillStyle = 'rgba(255, 110, 110, 0.7)';
    const s = 7;
    pctx.beginPath();
    if (dir === 'right')     { pctx.moveTo(x, y); pctx.lineTo(x - s, y - s/2); pctx.lineTo(x - s, y + s/2); }
    else if (dir === 'left') { pctx.moveTo(x, y); pctx.lineTo(x + s, y - s/2); pctx.lineTo(x + s, y + s/2); }
    else if (dir === 'up')   { pctx.moveTo(x, y); pctx.lineTo(x - s/2, y + s); pctx.lineTo(x + s/2, y + s); }
    else                     { pctx.moveTo(x, y); pctx.lineTo(x - s/2, y - s); pctx.lineTo(x + s/2, y - s); }
    pctx.closePath();
    pctx.fill();
  }

  function drawAxisTag(x, y, text) {
    pctx.font = "9px 'JetBrains Mono', monospace";
    const tw = pctx.measureText(text).width + 10;
    const th = 14;
    pctx.fillStyle = 'rgba(220, 50, 50, 0.85)';
    pctx.fillRect(x - tw / 2, y - th / 2, tw, th);
    pctx.fillStyle = '#fff';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillText(text, x, y);
  }

  function drawMotor(x, y, label, baseColor, status) {
    let fill, stroke, textColor;
    if (status === 'in') {
      fill = hexToRgba(baseColor, 0.95);
      stroke = baseColor;
      textColor = '#fff';
    } else if (status === 'boundary') {
      fill = hexToRgba(baseColor, 0.45);
      stroke = hexToRgba(baseColor, 0.8);
      textColor = 'rgba(255, 255, 255, 0.85)';
    } else {
      fill = 'rgba(60, 60, 78, 0.5)';
      stroke = 'rgba(100, 100, 120, 0.6)';
      textColor = 'rgba(220, 220, 230, 0.55)';
    }

    pctx.fillStyle = fill;
    pctx.strokeStyle = stroke;
    pctx.lineWidth = 1;
    pctx.fillRect(x - MOTOR_W / 2, y - MOTOR_H / 2, MOTOR_W, MOTOR_H);
    pctx.strokeRect(x - MOTOR_W / 2, y - MOTOR_H / 2, MOTOR_W, MOTOR_H);

    pctx.fillStyle = textColor;
    pctx.font = "9px 'JetBrains Mono', monospace";
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';

    const lines = label.split('\n');
    const lineH = 11;
    const startY = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => pctx.fillText(line, x, startY + i * lineH));

    pctx.fillStyle = status === 'out' ? 'rgba(255, 255, 255, 0.25)' : '#fff';
    pctx.beginPath();
    pctx.arc(x, y, 1.8, 0, Math.PI * 2);
    pctx.fill();
  }

  function draw() {
    if (!isOpen) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) / (VIEW_HALF * 2);

    const tx = x => cx + x * scale;
    const ty = y => cy - y * scale;
    const ts = d => d * scale;

    pctx.fillStyle = '#0a0a0d';
    pctx.fillRect(0, 0, w, h);

    pctx.strokeStyle = 'rgba(53, 53, 65, 0.35)';
    pctx.lineWidth = 1;
    for (let i = -1; i <= 1; i += 0.5) {
      if (i === 0) continue;
      pctx.beginPath();
      pctx.moveTo(tx(-VIEW_HALF), ty(i));
      pctx.lineTo(tx(VIEW_HALF), ty(i));
      pctx.moveTo(tx(i), ty(-VIEW_HALF));
      pctx.lineTo(tx(i), ty(VIEW_HALF));
      pctx.stroke();
    }

    pctx.strokeStyle = 'rgba(255, 110, 110, 0.7)';
    pctx.lineWidth = 1.5;
    pctx.beginPath();
    pctx.moveTo(tx(-VIEW_HALF), ty(0));
    pctx.lineTo(tx(VIEW_HALF), ty(0));
    pctx.moveTo(tx(0), ty(-VIEW_HALF));
    pctx.lineTo(tx(0), ty(VIEW_HALF));
    pctx.stroke();

    drawArrow(tx(VIEW_HALF), ty(0), 'right');
    drawArrow(tx(-VIEW_HALF), ty(0), 'left');
    drawArrow(tx(0), ty(VIEW_HALF), 'up');
    drawArrow(tx(0), ty(-VIEW_HALF), 'down');

    const pos = state.position;
    const radius = state.radius;
    let hits = 0;
    let boundary = 0;
    for (const m of MOTORS) {
      const d = distance(m, pos);
      let status;
      if (d < radius - BOUNDARY_EPSILON) { status = 'in'; hits++; }
      else if (d <= radius + BOUNDARY_EPSILON) { status = 'boundary'; boundary++; }
      else status = 'out';
      drawMotor(tx(m.x), ty(m.y), m.name, m.color, status);
    }

    if (radius > 0) {
      pctx.strokeStyle = 'rgba(196, 240, 0, 0.7)';
      pctx.fillStyle = 'rgba(196, 240, 0, 0.08)';
      pctx.lineWidth = 1.5;
      pctx.setLineDash([5, 5]);
      pctx.beginPath();
      pctx.arc(tx(pos.x), ty(pos.y), ts(radius), 0, Math.PI * 2);
      pctx.fill();
      pctx.stroke();
      pctx.setLineDash([]);
    }

    pctx.fillStyle = '#c4f000';
    pctx.strokeStyle = '#0a0a0d';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.arc(tx(pos.x), ty(pos.y), 5, 0, Math.PI * 2);
    pctx.fill();
    pctx.stroke();

    drawAxisTag(tx(VIEW_HALF) - 36, ty(0) - 14, '(1, 0, 0)');
    drawAxisTag(tx(-VIEW_HALF) + 38, ty(0) - 14, '(-1, 0, 0)');
    drawAxisTag(tx(0), ty(VIEW_HALF) + 16, '(0, 1, 0)');
    drawAxisTag(tx(0), ty(-VIEW_HALF) - 16, '(0, -1, 0)');

    $('previewPos').textContent = `${pos.x}, ${pos.y}, ${pos.z}`;
    $('previewRad').textContent = radius;
    const hitText = boundary > 0 ? `${hits}+${boundary} / ${MOTORS.length}` : `${hits} / ${MOTORS.length}`;
    $('previewHit').textContent = hitText;
  }

  return { init, open, close, toggle, update };
})();

function render() {
  Renderer.draw();
  KeysList.rebuild();
  CodeGen.update();
}

function syncDom() {
  $('typeSelect').value = state.type;
  $('posX').value = state.position.x;
  $('posY').value = state.position.y;
  $('posZ').value = state.position.z;
  $('radiusRange').value = state.radius;
  $('radiusNum').value = state.radius;
  $('varName').value = state.varName;
  $('loopedToggle').classList.toggle('on', state.looped);
  dom.editorMode.textContent = state.type;
}

const UI = {
  bind() {
    this._bindCanvas();
    this._bindForm();
    this._bindEditorTools();
    this._bindPresets();
    this._bindHeader();
    new ResizeObserver(() => Renderer.resize()).observe(dom.canvasWrap);
  },

  _bindCanvas() {
    let dragging = -1;

    const localPos = e => {
      const rect = dom.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const findKeyAt = (mx, my) => {
      const w = dom.canvas.clientWidth, h = dom.canvas.clientHeight;
      const sorted = [...state.keys].sort((a, b) => a.time - b.time);
      for (let i = sorted.length - 1; i >= 0; i--) {
        const k = sorted[i];
        const x = Wave.timeToX(k.time, w), y = Wave.valueToY(k.value, h);
        if (Math.hypot(mx - x, my - y) < 10) return state.keys.indexOf(k);
      }
      return -1;
    };

    dom.canvas.addEventListener('mousedown', e => {
      if (state.type !== 'Custom') return;
      const { x, y } = localPos(e);
      const idx = findKeyAt(x, y);
      if (idx >= 0) {
        dragging = idx;
        return;
      }
      const w = dom.canvas.clientWidth, h = dom.canvas.clientHeight;
      state.keys.push({
        time: Math.round(Wave.xToTime(x, w)),
        value: parseFloat(Wave.yToValue(y, h).toFixed(3)),
        interp: 'Linear',
      });
      render();
    });

    window.addEventListener('mousemove', e => {
      if (dragging < 0) return;
      const { x, y } = localPos(e);
      const w = dom.canvas.clientWidth, h = dom.canvas.clientHeight;
      state.keys[dragging].time = Math.max(0, Math.round(Wave.xToTime(x, w)));
      state.keys[dragging].value = parseFloat(Wave.yToValue(y, h).toFixed(3));
      Renderer.draw();
      KeysList.rebuild();
      CodeGen.update();
    });

    window.addEventListener('mouseup', () => { dragging = -1; });

    dom.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (state.type !== 'Custom') return;
      const { x, y } = localPos(e);
      const idx = findKeyAt(x, y);
      if (idx >= 0) {
        state.keys.splice(idx, 1);
        render();
      }
    });
  },

  _bindForm() {
    $('typeSelect').addEventListener('change', e => {
      state.type = e.target.value;
      dom.editorMode.textContent = state.type;
      render();
    });

    ['posX', 'posY', 'posZ'].forEach(id => {
      $(id).addEventListener('input', e => {
        state.position[id.slice(-1).toLowerCase()] = parseFloat(e.target.value) || 0;
        CodeGen.update();
        Preview.update();
      });
    });

    const radiusRange = $('radiusRange');
    const radiusNum = $('radiusNum');
    radiusRange.addEventListener('input', e => {
      state.radius = parseFloat(e.target.value);
      radiusNum.value = state.radius;
      CodeGen.update();
      Preview.update();
    });
    radiusNum.addEventListener('input', e => {
      state.radius = parseFloat(e.target.value) || 0;
      radiusRange.value = state.radius;
      CodeGen.update();
      Preview.update();
    });

    $('loopedToggle').addEventListener('click', () => {
      state.looped = !state.looped;
      $('loopedToggle').classList.toggle('on', state.looped);
      CodeGen.update();
    });

    $('varName').addEventListener('input', e => {
      state.varName = e.target.value.trim() || 'effect';
      CodeGen.update();
    });
  },

  _bindEditorTools() {
    $('addKeyBtn').addEventListener('click', () => {
      if (state.type !== 'Custom') {
        state.type = 'Custom';
        $('typeSelect').value = 'Custom';
        dom.editorMode.textContent = 'Custom';
      }
      const lastT = state.keys.length ? state.keys[state.keys.length - 1].time : 0;
      state.keys.push({ time: lastT + 100, value: 0.5, interp: 'Linear' });
      render();
    });

    $('clearBtn').addEventListener('click', () => {
      state.keys = [];
      render();
    });
  },

  _bindPresets() {
    document.querySelectorAll('.preset').forEach(b => {
      b.addEventListener('click', () => {
        state.keys = clone(Presets[b.dataset.preset]);
        if (state.type !== 'Custom') {
          state.type = 'Custom';
          $('typeSelect').value = 'Custom';
          dom.editorMode.textContent = 'Custom';
        }
        render();
      });
    });
  },

  _bindHeader() {
    dom.vibrateBtn.addEventListener('click', () => Haptics.play());

    $('shareBtn').addEventListener('click', () => Share.share());

    document.querySelectorAll('.code-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.codeMode = tab.dataset.mode;
        document.querySelectorAll('.code-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.mode === state.codeMode);
        });
        $('codeFileName').textContent = state.codeMode === 'ts' ? 'output.ts' : 'output.luau';
        CodeGen.update();
      });
    });

    $('copyBtn').addEventListener('click', async () => {
      const text = dom.codeOut.dataset.raw || CodeGen.generate();
      try {
        await navigator.clipboard.writeText(text);
        Toast.show('COPIED TO CLIPBOARD');
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
        Toast.show('COPIED TO CLIPBOARD');
      }
    });
  },
};

function init() {
  const loaded = Share.applyFromHash();
  syncDom();
  UI.bind();
  Preview.init();
  KeysList.rebuild();
  CodeGen.update();
  if (loaded) Toast.show('SHARED EFFECT LOADED');
}

init();

})();
