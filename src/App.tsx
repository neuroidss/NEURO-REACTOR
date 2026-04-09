import React, { useEffect, useRef, useState } from 'react';

const RADIUS = 10;
const BUF_SIZE = 256;
const ANGLES = [-72, -36, 36, 72, 108, 144, -144, -108].map(d => d * Math.PI / 180);
const ELECTRODES = ANGLES.map(a => ({ x: Math.cos(a) * RADIUS, y: Math.sin(a) * RADIUS }));
const UV_SCALE = (1.2 / 4.0 / 8388607.0) * 1e6;

// === ТЕТА-ГАММА PAC ===
const THETA_BIN = 6;
const GAMMA_BIN = 80;
const NUM_SLOTS = 7;

const PAIRS = [];
const PAIR_MIDS = [];
for (let i = 0; i < 8; i++) {
  for (let j = i + 1; j < 8; j++) {
    PAIRS.push([i, j]);
    let mx = (ELECTRODES[i].x + ELECTRODES[j].x) / 2;
    let my = (ELECTRODES[i].y + ELECTRODES[j].y) / 2;
    PAIR_MIDS.push({ x: mx, y: my });
  }
}

function fft(re, im) {
  const n = re.length;
  for (let i = 0, j = 0; i < n; i++) {
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }
  for (let s = 2; s <= n; s <<= 1) {
    let m = s >> 1, t = -2 * Math.PI / s, wr = Math.cos(t), wi = Math.sin(t);
    for (let i = 0; i < n; i += s) {
      let ar = 1, ai = 0;
      for (let j = 0; j < m; j++) {
        let u = i + j, v = u + m;
        let tr = ar * re[v] - ai * im[v], ti = ar * im[v] + ai * re[v];
        re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti;
        [ar, ai] = [ar * wr - ai * wi, ar * wi + ai * wr];
      }
    }
  }
}

function applyNotchFilters(re, im) {
  for (let k of [51, 102]) {
    for (let i = -1; i <= 1; i++) {
      if (re[k + i] !== undefined) re[k + i] = im[k + i] = 0;
    }
  }
}

class NeuroReactorAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.voices = ELECTRODES.map((pos, i) => {
      let osc = this.ctx.createOscillator();
      let gain = this.ctx.createGain();
      let pan = this.ctx.createStereoPanner();
      osc.type = 'triangle';
      osc.frequency.value = 40 + i * 10;
      gain.gain.value = 0;
      pan.pan.value = pos.x / RADIUS;
      osc.connect(gain).connect(pan).connect(this.masterGain);
      osc.start();
      return { osc, gain, baseFreq: 40 + i * 10 };
    });
  }
  update(vx, vy, tq, stability, electrodePressure) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      let targetGain = (electrodePressure[i] / 15) * (0.2 + stability * 0.8);
      v.gain.gain.setTargetAtTime(targetGain * 0.3, t, 0.1);
      v.osc.frequency.setTargetAtTime(v.baseFreq + (vx + vy) * 10 + tq * 15, t, 0.1);
    });
  }
}

class Maze {
  constructor(dim) {
    this.dim = dim;
    this.optimalDist = 0;
    this.chests = [];
    this.grid = Array.from({ length: dim }, () => Array(dim).fill(1));
    let attempts = 0, isValid = false, bestExit = null, bestGrid = null;

    while (!isValid && attempts < 200) {
      attempts++;
      this.grid = Array.from({ length: dim }, () => Array(dim).fill(1));
      this.gen(1, 1);

      let exitParams = this.findHardestExit();
      if (!bestExit || (exitParams.d + exitParams.turns > bestExit.d + bestExit.turns)) {
        bestExit = exitParams;
        bestGrid = this.grid.map(row => [...row]);
      }
      if (exitParams.d >= 20 && exitParams.turns >= 5) { isValid = true; }
    }

    this.grid = bestGrid;
    this.grid[bestExit.y][bestExit.x] = 2;
    this.optimalDist = bestExit.d;

    for (let y = 1; y < dim - 1; y++) {
      for (let x = 1; x < dim - 1; x++) {
        if (this.grid[y][x] === 0 && (x !== 1 || y !== 1)) {
          let walls = 0;
          if (this.grid[y + 1][x] === 1) walls++;
          if (this.grid[y - 1][x] === 1) walls++;
          if (this.grid[y][x + 1] === 1) walls++;
          if (this.grid[y][x - 1] === 1) walls++;

          if (walls >= 3) {
            this.chests.push({
              x: x + 0.5,
              y: y + 0.5,
              isMimic: Math.random() > 0.5,
              state: 'closed',
              scanProgress: 0
            });
          }
        }
      }
    }
  }

  gen(x, y) {
    this.grid[y][x] = 0;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5).forEach(([dx, dy]) => {
      let nx = x + dx * 2, ny = y + dy * 2;
      if (nx > 0 && nx < this.dim - 1 && ny > 0 && ny < this.dim - 1 && this.grid[ny][nx] === 1) {
        this.grid[y + dy][x + dx] = 0; this.gen(nx, ny);
      }
    });
  }

  findHardestExit() {
    let q = [{ x: 1, y: 1, d: 0, dx: 0, dy: 0, turns: 0 }];
    let visited = Array.from({ length: this.dim }, () => Array(this.dim).fill(false));
    visited[1][1] = true;
    let best = { x: 1, y: 1, d: 0, turns: 0 }, maxScore = 0;

    while (q.length > 0) {
      let curr = q.shift();
      let score = curr.d + curr.turns * 3;
      if (score > maxScore && (curr.x !== 1 || curr.y !== 1)) {
        maxScore = score; best = curr;
      }

      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
        let nx = curr.x + dx, ny = curr.y + dy;
        if (nx > 0 && nx < this.dim - 1 && ny > 0 && ny < this.dim - 1) {
          if (!visited[ny][nx] && this.grid[ny][nx] === 0) {
            visited[ny][nx] = true;
            let isTurn = (curr.dx !== 0 || curr.dy !== 0) && (curr.dx !== dx || curr.dy !== dy);
            q.push({ x: nx, y: ny, d: curr.d + 1, dx: dx, dy: dy, turns: curr.turns + (isTurn ? 1 : 0) });
          }
        }
      });
    }
    return best;
  }
}

export default function App() {
  const canvasRef = useRef(null);
  const reqRef = useRef(null);

  // UI Refs for fast updates without React re-renders
  const scoreRef = useRef(null);
  const floorRef = useRef(null);
  const synapseFillRef = useRef(null);
  const focusFillRef = useRef(null);
  const pointerRef = useRef(null);
  const damageFlashRef = useRef(null);
  const wsStatusRef = useRef(null);

  const [uiVisible, setUiVisible] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [invertDevice, setInvertDevice] = useState(false);
  const [isVR, setIsVR] = useState(false);

  // Game State
  const state = useRef({
    isConnected: false,
    skillLevel: 0.05,
    zoomLevel: 80,
    holoThr: 0.50,
    synapticPersistence: 0,
    smooth_focus: 0,
    scorePenalty: 0,
    effortDist: 0,
    scoresHistory: [],
    lastTargetX: 0,
    lastTargetY: 0,
    ctrl: { moveX: 0, moveY: 0, torque: 0 },
    player: { x: 1.5, y: 1.5, angle: 0 },
    maze: null,
    reactor: null,
    lastEegProcess: 0,
    target_vx: 0,
    target_vy: 0,
    target_tq: 0,
    eegBuffer: Array.from({ length: 8 }, () => new Float32Array(BUF_SIZE)),
    reArr: Array.from({ length: 8 }, () => new Float32Array(BUF_SIZE)),
    imArr: Array.from({ length: 8 }, () => new Float32Array(BUF_SIZE)),
    centered: Array.from({ length: 8 }, () => new Float32Array(BUF_SIZE)),
    electrodePressure: new Float32Array(8),
    gamma_slots: new Float32Array(NUM_SLOTS),
    ws: null,
    floor: 1
  });

  useEffect(() => {
    state.current.ws = new WebSocket("ws://localhost:8765");
    state.current.ws.onopen = () => {
      if (wsStatusRef.current) {
        wsStatusRef.current.innerText = "ONLINE";
        wsStatusRef.current.style.color = "#0f0";
      }
    };
    return () => {
      if (state.current.ws) state.current.ws.close();
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, []);

  const get_ciPLV = (idxA, idxB) => {
    let sum_re = 0, sum_im = 0;
    for (let k = 18; k <= 36; k++) {
      let mA = Math.sqrt(state.current.reArr[idxA][k] ** 2 + state.current.imArr[idxA][k] ** 2) || 1e-6;
      let mB = Math.sqrt(state.current.reArr[idxB][k] ** 2 + state.current.imArr[idxB][k] ** 2) || 1e-6;
      let uAr = state.current.reArr[idxA][k] / mA, uAi = state.current.imArr[idxA][k] / mA,
          uBr = state.current.reArr[idxB][k] / mB, uBi = -state.current.imArr[idxB][k] / mB;
      sum_re += (uAr * uBr - uAi * uBi);
      sum_im += (uAr * uBi + uAi * uBr);
    }
    let mRe = sum_re / 19, mIm = sum_im / 19, denom = Math.sqrt(Math.max(0, 1.0 - mRe * mRe));
    return denom < 0.001 ? 0 : mIm / denom;
  };

  const takeDamage = () => {
    state.current.scorePenalty += 500;
    if (damageFlashRef.current) {
      damageFlashRef.current.style.opacity = '1';
      setTimeout(() => {
        if (damageFlashRef.current) damageFlashRef.current.style.opacity = '0';
      }, 200);
    }
  };

  const drawScene = (ctx, width, height, playerDisparity) => {
    const s = state.current;
    const cellSize = s.zoomLevel;

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-s.player.angle);
    ctx.translate(-s.player.x * cellSize, -s.player.y * cellSize);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-cellSize, -cellSize, (s.maze.dim + 2) * cellSize, (s.maze.dim + 2) * cellSize);

    for (let r = 0; r < s.maze.dim; r++) {
      for (let c = 0; c < s.maze.dim; c++) {
        if (s.maze.grid[r][c] === 1) {
          ctx.fillStyle = `rgb(10, ${20 + s.synapticPersistence * 80}, 30)`;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize + 1, cellSize + 1);
          ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
          ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
        } else if (s.maze.grid[r][c] === 2) {
          ctx.fillStyle = '#0f0';
          ctx.beginPath();
          ctx.arc(c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Chests
    for (let chest of s.maze.chests) {
      if (chest.state === 'looted') continue;

      let cx = chest.x * cellSize;
      let cy = chest.y * cellSize;
      let cSize = cellSize * 0.4;

      if (chest.state === 'closed') {
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(cx - cSize / 2, cy - cSize / 2, cSize, cSize);

        if (chest.scanProgress > 0) {
          ctx.strokeStyle = '#f0f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, cSize, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * chest.scanProgress));
          ctx.stroke();
        }
      } else if (chest.state === 'revealed') {
        if (chest.isMimic) {
          ctx.fillStyle = '#f00';
          ctx.beginPath();
          ctx.moveTo(cx - cSize / 2, cy - cSize / 2);
          ctx.lineTo(cx + cSize / 2, cy - cSize / 2);
          ctx.lineTo(cx, cy + cSize / 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#0f0';
          ctx.beginPath();
          ctx.moveTo(cx, cy - cSize / 2);
          ctx.lineTo(cx + cSize / 2, cy);
          ctx.lineTo(cx, cy + cSize / 2);
          ctx.lineTo(cx - cSize / 2, cy);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(width / 2 + playerDisparity, height / 2);

    let pSize = cellSize * 0.25;

    // PAC Hologram
    let sum_g = 0;
    for (let i = 0; i < NUM_SLOTS; i++) sum_g += s.gamma_slots[i];
    let mean_g = sum_g / NUM_SLOTS;

    for (let i = 0; i < NUM_SLOTS; i++) {
      let val = (mean_g > 0) ? (s.gamma_slots[i] / mean_g) : 1;
      let startAngle = (i / NUM_SLOTS) * Math.PI * 2;
      let endAngle = ((i + 1) / NUM_SLOTS) * Math.PI * 2;
      let hue = Math.floor((i * 360) / NUM_SLOTS);

      let alpha = Math.min(1.0, val * 0.3);

      ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      let petalLength = pSize * 1.5 + (val * 10 * s.smooth_focus);
      ctx.arc(0, 0, petalLength, startAngle, endAngle);
      ctx.lineTo(0, 0);
      ctx.fill();
    }

    if (s.smooth_focus > s.holoThr) {
      ctx.strokeStyle = `rgba(255, 0, 255, ${Math.min(1, s.smooth_focus)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, pSize * 2.5 + s.smooth_focus * 15, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player
    ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(0, 0, pSize, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -pSize * 1.5); ctx.lineTo(-pSize * 0.7, pSize * 0.5); ctx.lineTo(pSize * 0.7, pSize * 0.5); ctx.fill();
    ctx.restore();

    if (isVR) {
      ctx.save();
      ctx.translate(width / 2 - 75, height - 80);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(0, 0, 150, 60);

      ctx.fillStyle = '#0f0'; ctx.font = '12px monospace'; ctx.fillText('SYNAPTIC STABILITY', 10, 15);
      ctx.fillStyle = '#111'; ctx.fillRect(10, 22, 130, 6);
      ctx.fillStyle = '#0ff'; ctx.fillRect(10, 22, 130 * s.synapticPersistence, 6);

      let liveScore = scoreRef.current ? scoreRef.current.innerText : "0";
      ctx.fillStyle = scoreRef.current ? scoreRef.current.style.color : "#0f0";
      ctx.font = '14px monospace'; ctx.fillText('NE-SCORE: ' + liveScore, 10, 45);
      ctx.restore();
    }
  };

  const renderCanvas = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    if (isVR) {
      const halfW = cvs.width / 2;
      const playerDisparity = 3;

      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, halfW, cvs.height); ctx.clip();
      drawScene(ctx, halfW, cvs.height, playerDisparity);
      ctx.restore();

      ctx.save();
      ctx.beginPath(); ctx.rect(halfW, 0, halfW, cvs.height); ctx.clip();
      ctx.translate(halfW, 0);
      drawScene(ctx, halfW, cvs.height, -playerDisparity);
      ctx.restore();

      ctx.fillStyle = '#020202';
      ctx.fillRect(halfW - 2, 0, 4, cvs.height);
    } else {
      drawScene(ctx, cvs.width, cvs.height, 0);
    }
  };

  const gameLoop = (time) => {
    const s = state.current;
    if (!s.isConnected) {
      reqRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    if (time - s.lastEegProcess > 33) {
      s.lastEegProcess = time;

      for (let t = 0; t < BUF_SIZE; t++) {
        let avg = 0;
        for (let c = 0; c < 8; c++) avg += s.eegBuffer[c][t];
        avg *= 0.125;
        for (let c = 0; c < 8; c++) s.centered[c][t] = s.eegBuffer[c][t] - avg;
      }
      for (let c = 0; c < 8; c++) {
        for (let t = 0; t < BUF_SIZE; t++) {
          s.reArr[c][t] = s.centered[c][t];
          s.imArr[c][t] = 0;
        }
        fft(s.reArr[c], s.imArr[c]);
        applyNotchFilters(s.reArr[c], s.imArr[c]);
      }

      // 1. АВТОПИЛОТ (АЛЬФА/БЕТА)
      s.target_vx = 0; s.target_vy = 0; s.target_tq = 0; s.electrodePressure.fill(0);
      for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
          let val = get_ciPLV(i, j);
          let dx = ELECTRODES[j].x - ELECTRODES[i].x, dy = ELECTRODES[j].y - ELECTRODES[i].y;
          s.target_vx += val * dx; s.target_vy += val * dy;
          s.target_tq += (val * (ELECTRODES[i].x * dy - ELECTRODES[i].y * dx)) / (RADIUS * 10);
          s.electrodePressure[i] += Math.abs(val); s.electrodePressure[j] += Math.abs(val);
        }
      }

      let mag = Math.sqrt(s.target_vx ** 2 + s.target_vy ** 2);
      let dot = s.target_vx * s.lastTargetX + s.target_vy * s.lastTargetY;
      let cosTheta = dot / (mag * Math.sqrt(s.lastTargetX ** 2 + s.lastTargetY ** 2) + 1e-6);
      if (mag > 0.05 && cosTheta > 0.8) s.synapticPersistence = Math.min(1, s.synapticPersistence + 0.05);
      else s.synapticPersistence *= 0.95;
      s.lastTargetX = s.target_vx; s.lastTargetY = s.target_vy;
      if (s.reactor) s.reactor.update(s.target_vx, s.target_vy, s.target_tq, s.synapticPersistence, s.electrodePressure);

      // 2. РАБОЧАЯ ПАМЯТЬ (ТЕТА-ГАММА PAC)
      let sumThetaRe = 0, sumThetaIm = 0;
      for (let c = 0; c < 8; c++) {
        sumThetaRe += s.reArr[c][THETA_BIN];
        sumThetaIm += s.imArr[c][THETA_BIN];
      }
      let global_theta_phase = Math.atan2(sumThetaIm, sumThetaRe);
      let normalized_phase = (global_theta_phase + Math.PI) / (2 * Math.PI);
      let current_slot = Math.floor(normalized_phase * NUM_SLOTS);
      if (current_slot >= NUM_SLOTS) current_slot = NUM_SLOTS - 1;

      let global_gamma_power = 0;
      for (let c = 0; c < 8; c++) {
        global_gamma_power += Math.sqrt(s.reArr[c][GAMMA_BIN] ** 2 + s.imArr[c][GAMMA_BIN] ** 2);
      }
      global_gamma_power /= 8;

      for (let i = 0; i < NUM_SLOTS; i++) {
        if (i === current_slot) {
          s.gamma_slots[i] = s.gamma_slots[i] * 0.95 + global_gamma_power * 0.05;
        }
      }

      let max_g = 0, min_g = Infinity, sum_g = 0;
      for (let i = 0; i < NUM_SLOTS; i++) {
        let val = s.gamma_slots[i];
        if (val > max_g) max_g = val;
        if (val < min_g) min_g = val;
        sum_g += val;
      }

      let mean_g = sum_g / NUM_SLOTS;
      let focus_intent = (mean_g > 0) ? (max_g - min_g) / mean_g : 0;
      s.smooth_focus = s.smooth_focus * 0.9 + (focus_intent / 2.0) * 0.1;

      // 3. ЛОГИКА ВЗЛОМА СУНДУКОВ
      for (let chest of s.maze.chests) {
        if (chest.state === 'looted') continue;

        let dx = chest.x - s.player.x;
        let dy = chest.y - s.player.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.5) {
          if (chest.state === 'closed' || chest.state === 'revealed') {
            if (chest.isMimic) takeDamage();
            else s.scorePenalty -= 500;
          }
          chest.state = 'looted';
          continue;
        }

        if (dist < 3.0 && chest.state === 'closed') {
          if (s.smooth_focus > s.holoThr) {
            chest.scanProgress += (s.smooth_focus - s.holoThr) * 0.05;
            if (chest.scanProgress >= 1.0) {
              chest.state = 'revealed';
            }
          } else {
            if (chest.scanProgress > 0) chest.scanProgress -= 0.01;
          }
        }
      }
    }

    // 4. ФИЗИКА ДВИЖЕНИЯ АВАТАРА
    let out_vx = invertDevice ? -s.target_vx : s.target_vx;
    let out_vy = invertDevice ? -s.target_vy : s.target_vy;
    let smooth = 0.98 - (s.skillLevel * 0.1), gain = s.skillLevel * 1.5, boost = (1.0 + s.synapticPersistence * 4.0);

    s.ctrl.moveX = s.ctrl.moveX * smooth + out_vx * gain * (1 - smooth);
    s.ctrl.moveY = s.ctrl.moveY * smooth + out_vy * gain * (1 - smooth);
    s.ctrl.torque = s.ctrl.torque * smooth + s.target_tq * gain * 0.5 * (1 - smooth);

    if (s.ws && s.ws.readyState === WebSocket.OPEN) {
      s.ws.send(JSON.stringify({ mx: (s.ctrl.moveX * boost) / 10.0, my: (-s.ctrl.moveY * boost) / 10.0, tq: (s.ctrl.torque * boost) / 10.0 }));
    }

    s.player.angle += s.ctrl.torque * boost * 0.5;

    let forwardSpeed = -s.ctrl.moveY * boost * 0.2;
    let strafeSpeed = s.ctrl.moveX * boost * 0.2;

    let rawDx = Math.sin(s.player.angle) * forwardSpeed + Math.cos(s.player.angle) * strafeSpeed;
    let rawDy = -Math.cos(s.player.angle) * forwardSpeed + Math.sin(s.player.angle) * strafeSpeed;

    s.effortDist += Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    const MAX_SPEED = 0.15;
    let intendedMove = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    let targetDx = rawDx, targetDy = rawDy;
    if (intendedMove > MAX_SPEED) {
      targetDx = (rawDx / intendedMove) * MAX_SPEED;
      targetDy = (rawDy / intendedMove) * MAX_SPEED;
    }

    const hit = (tx, ty) => {
      let gx = Math.floor(tx), gy = Math.floor(ty);
      if (gy < 0 || gy >= s.maze.dim || gx < 0 || gx >= s.maze.dim) return true;
      return s.maze.grid[gy][gx] === 1;
    };

    let steps = Math.ceil(Math.max(Math.abs(targetDx), Math.abs(targetDy)) / 0.05);
    if (steps < 1) steps = 1;
    let sdx = targetDx / steps, sdy = targetDy / steps;

    for (let i = 0; i < steps; i++) {
      if (!hit(s.player.x + sdx + Math.sign(sdx) * 0.2, s.player.y)) { s.player.x += sdx; }
      if (!hit(s.player.x, s.player.y + sdy + Math.sign(sdy) * 0.2)) { s.player.y += sdy; }
    }

    let wastedRatio = Math.max(1, s.effortDist / s.maze.optimalDist);
    let neScore = (1000 - 144.27 * Math.log(wastedRatio)) - s.scorePenalty;
    if (neScore < 0) neScore = 0;

    if (scoreRef.current) {
      scoreRef.current.innerText = neScore.toFixed(1);
      scoreRef.current.style.color = neScore > 900 ? '#0f0' : (neScore > 700 ? '#ff0' : '#f00');
    }

    if (s.maze.grid[Math.floor(s.player.y)][Math.floor(s.player.x)] === 2) {
      s.scoresHistory.push(neScore);
      s.floor += 1;
      if (floorRef.current) floorRef.current.innerText = s.floor;
      s.maze = new Maze(11);
      s.player.x = 1.5;
      s.player.y = 1.5;
      s.effortDist = 0;
      s.scorePenalty = 0;
    }

    if (uiVisible) {
      if (synapseFillRef.current) synapseFillRef.current.style.width = (s.synapticPersistence * 100) + '%';
      if (focusFillRef.current) focusFillRef.current.style.width = Math.min(100, s.smooth_focus * 100) + '%';
      if (pointerRef.current) {
        pointerRef.current.style.left = (50 + s.ctrl.moveX * 5) + '%';
        pointerRef.current.style.top = (50 + s.ctrl.moveY * 5) + '%';
      }
    }

    renderCanvas();
    reqRef.current = requestAnimationFrame(gameLoop);
  };

  const startSimulation = () => {
    state.current.maze = new Maze(11);
    state.current.effortDist = 0;
    state.current.scorePenalty = 0;
    state.current.scoresHistory = [];
    state.current.isConnected = true;
    state.current.lastEegProcess = performance.now();
    setGameStarted(true);

    // Mock data generator for testing without BLE
    setInterval(() => {
      for (let i = 0; i < 8; i++) {
        state.current.eegBuffer[i].set(state.current.eegBuffer[i].subarray(1));
        // Inject some random noise and fake alpha/gamma
        state.current.eegBuffer[i][255] = (Math.random() - 0.5) * 50 + Math.sin(Date.now() * 0.02) * 20;
      }
    }, 4); // ~250Hz

    reqRef.current = requestAnimationFrame(gameLoop);
  };

  const startBLE = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ["4fafc201-1fb5-459e-8fcc-c5c9c331914b"] }] });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService("4fafc201-1fb5-459e-8fcc-c5c9c331914b");
      const dataChar = await service.getCharacteristic("beb5483e-36e1-4688-b7f5-ea07361b26a8");
      const cmdChar = await service.getCharacteristic("c0de0001-36e1-4688-b7f5-ea07361b26a8");

      await cmdChar.writeValue(new Uint8Array([0x04, 0x22, 0x22]));
      await new Promise(r => setTimeout(r, 100));
      await cmdChar.writeValue(new Uint8Array([0x05, 0x22, 0x22]));

      await dataChar.startNotifications();
      dataChar.addEventListener('characteristicvaluechanged', (e) => {
        let b = new Uint8Array(e.target.value.buffer);
        if (b[0] === 0xA0) {
          for (let i = 0; i < 8; i++) {
            let v = (b[2 + i * 3] << 16) | (b[3 + i * 3] << 8) | b[4 + i * 3];
            if (v & 0x800000) v -= 0x1000000;
            state.current.eegBuffer[i].set(state.current.eegBuffer[i].subarray(1));
            state.current.eegBuffer[i][255] = v * UV_SCALE;
          }
        }
      });
      state.current.reactor = new NeuroReactorAudio();
      
      state.current.maze = new Maze(11);
      state.current.effortDist = 0;
      state.current.scorePenalty = 0;
      state.current.scoresHistory = [];
      state.current.isConnected = true;
      state.current.lastEegProcess = performance.now();
      setGameStarted(true);
      reqRef.current = requestAnimationFrame(gameLoop);

    } catch (e) {
      alert("Ошибка BLE: " + e);
    }
  };

  const toggleVR = () => {
    const nextVR = !isVR;
    setIsVR(nextVR);
    if (nextVR) {
      setUiVisible(false);
      document.body.style.cursor = 'none';
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    } else {
      setUiVisible(true);
      document.body.style.cursor = 'default';
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    }
  };

  return (
    <div className="bg-[#050505] text-[#0f0] font-mono h-screen w-screen overflow-hidden select-none">
      <div ref={damageFlashRef} className="absolute inset-0 bg-red-600/60 z-50 opacity-0 pointer-events-none transition-opacity duration-100"></div>

      {/* UI Overlay */}
      <div className={`absolute top-2 left-2 z-10 bg-black/85 p-4 border-2 border-[#0f0] rounded-lg w-60 transition-all duration-300 max-h-[90vh] overflow-y-auto ${uiVisible ? 'translate-x-0 opacity-100' : '-translate-x-[120%] opacity-0 pointer-events-none'}`}>
        <div className="text-xs mb-1 flex justify-between items-center uppercase">
          FLOOR: <span ref={floorRef} className="text-white text-sm font-bold">1</span>
        </div>

        <div className="mt-4 pt-4 border-t-2 border-dashed border-[#0f0]">
          <div className="text-xs mb-1 flex justify-between items-center uppercase text-[#0ff]">
            NE-SCORE: <span ref={scoreRef} className="text-white text-base font-bold">1000.0</span>
          </div>
        </div>

        <div className="text-xs mb-1 flex justify-between items-center uppercase mt-4 text-[#0ff]">MOVE (ALPHA/BETA):</div>
        <div className="w-full h-1.5 bg-[#111] my-2 border border-[#333]">
          <div ref={synapseFillRef} className="h-full bg-[#0ff] w-0 shadow-[0_0_10px_#0ff] transition-all duration-100"></div>
        </div>

        <div className="text-xs mb-1 flex justify-between items-center uppercase mt-2 text-[#f0f]">FOCUS (THETA-GAMMA):</div>
        <div className="w-full h-1.5 bg-[#111] my-2 border border-[#333]">
          <div ref={focusFillRef} className="h-full bg-[#f0f] w-0 shadow-[0_0_10px_#f0f] transition-all duration-100"></div>
        </div>

        <div className="w-[100px] h-[100px] border border-[#444] rounded-full my-2 mx-auto relative bg-[#080808]">
          <div ref={pointerRef} className="w-2 h-2 bg-white rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_#fff] z-10"></div>
          {ELECTRODES.map((e, i) => (
            <div key={i} className="w-1 h-1 bg-[#333] absolute rounded-full" style={{ left: `${50 + e.x * 4 * (invertDevice ? -1 : 1)}%`, top: `${50 + e.y * 4 * (invertDevice ? -1 : 1)}%` }}></div>
          ))}
        </div>

        <div className="text-xs mb-1 flex justify-between items-center uppercase">
          WS: <span ref={wsStatusRef} className="text-red-500">OFF</span>
        </div>

        <div className="mt-2 border-t border-[#333] pt-2">
          <div className="text-[10px] mb-1 flex justify-between items-center uppercase">
            <span className="text-[#0ff]">MOVE SENSITIVITY</span>
            <span>{state.current.skillLevel.toFixed(3)}</span>
          </div>
          <input type="range" min="0.001" max="1.0" step="0.001" defaultValue="0.05" className="w-full accent-[#0f0] cursor-pointer"
            onChange={(e) => { state.current.skillLevel = parseFloat(e.target.value); e.target.previousElementSibling.lastChild.textContent = state.current.skillLevel.toFixed(3); }} />
        </div>

        <div className="mt-2 border-t border-[#333] pt-2">
          <div className="text-[10px] mb-1 flex justify-between items-center uppercase">
            <span className="text-[#f0f]">FOCUS THRESHOLD</span>
            <span>{state.current.holoThr.toFixed(2)}</span>
          </div>
          <input type="range" min="0.1" max="2.0" step="0.05" defaultValue="0.50" className="w-full accent-[#0f0] cursor-pointer"
            onChange={(e) => { state.current.holoThr = parseFloat(e.target.value); e.target.previousElementSibling.lastChild.textContent = state.current.holoThr.toFixed(2); }} />
        </div>

        <div className="mt-2 border-t border-[#333] pt-2">
          <div className="text-[10px] mb-1 flex justify-between items-center uppercase">
            <span className="text-[#0f0]">CAMERA ZOOM</span>
            <span>{state.current.zoomLevel}</span>
          </div>
          <input type="range" min="20" max="150" step="1" defaultValue="80" className="w-full accent-[#0f0] cursor-pointer"
            onChange={(e) => { state.current.zoomLevel = parseInt(e.target.value); e.target.previousElementSibling.lastChild.textContent = state.current.zoomLevel; }} />
        </div>

        <button onClick={() => setInvertDevice(!invertDevice)} className={`w-full mt-2 py-2 px-4 border-2 rounded-lg font-mono transition-colors ${invertDevice ? 'bg-black text-[#ff0] border-[#ff0] shadow-[0_0_10px_#ff0]' : 'bg-black text-[#0f0] border-[#0f0] shadow-[0_0_10px_#0f0]'}`}>
          USB CABLE: {invertDevice ? 'BOTTOM' : 'TOP'}
        </button>
        <button onClick={toggleVR} className="w-full mt-4 py-2 px-4 bg-black text-[#f0f] border-2 border-[#f0f] rounded-lg font-mono shadow-[0_0_10px_#f0f] active:bg-[#f0f] active:text-black">
          ENTER VR MODE
        </button>
      </div>

      <div onClick={() => setUiVisible(!uiVisible)} className="absolute bottom-5 right-5 z-20 bg-black border-2 border-[#0f0] text-[#0f0] rounded-full w-12 h-12 text-xl cursor-pointer shadow-[0_0_10px_#0f0] flex justify-center items-center select-none" style={{ opacity: uiVisible ? 1 : 0.5 }}>
        👁️
      </div>

      {/* Start Screen Overlay */}
      {!gameStarted && (
        <div className="absolute inset-0 bg-black/95 flex flex-col justify-center items-center z-[100] text-center">
          <h1 className="text-[#0ff] text-4xl mb-4 font-bold shadow-[#0ff]" style={{ textShadow: '0 0 20px #0ff' }}>NEURO REACTOR v10.0</h1>
          <p className="text-[#888] max-w-md text-sm mb-5">
            "Frieren's Chests" - PAC Focus Edition.<br /><br />
            1. <b>Move:</b> Auto-move via Alpha/Beta symmetry.<br />
            2. <b>Hack:</b> Stand near a chest. <b>Focus your mind</b> (calculate, stare, concentrate) to trigger Theta-Gamma PAC and reveal the chest!<br />
            3. Touch unrevealed chests at your own risk.
          </p>
          <button onClick={startBLE} className="bg-black text-[#0f0] border-2 border-[#0f0] px-8 py-4 text-xl cursor-pointer rounded-lg shadow-[0_0_10px_#0f0] m-2 font-mono hover:bg-[#0f0] hover:text-black transition-colors">
            CONNECT BLE
          </button>
          <button onClick={startSimulation} className="bg-black text-[#aaa] border-2 border-[#555] px-5 py-2 text-sm cursor-pointer rounded-lg m-2 font-mono hover:bg-[#333] transition-colors">
            TEST WITHOUT BLE
          </button>
        </div>
      )}

      <canvas ref={canvasRef} onClick={() => isVR && toggleVR()} className="block w-screen h-screen absolute z-0" />
    </div>
  );
}
