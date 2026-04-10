import React, { useEffect, useRef, useState } from 'react';
import { BUF_SIZE, ANGLES, RADIUS, ELECTRODES, UV_SCALE, THETA_BIN, NUM_SLOTS, fft, applyNotchFilters, get_ciPLV, get_band_ciPLV } from './lib/eeg-math';
import { Maze } from './lib/maze';
import { NeuroReactorAudio } from './lib/audio';

export default function App() {
  const canvasRef = useRef(null);
  const reqRef = useRef(null);
  const audioRef = useRef(null);

  const initAudio = () => {
    if (!audioRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle'; // Richer harmonics for biofeedback
      osc.frequency.value = 100;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      audioRef.current = { ctx, osc, gain };
    }
    if (audioRef.current.ctx.state === 'suspended') {
      audioRef.current.ctx.resume();
    }
  };

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
    slow_gamma_slots: Array.from({ length: 8 }, () => new Float32Array(NUM_SLOTS)),
    fast_gamma_slots: Array.from({ length: 8 }, () => new Float32Array(NUM_SLOTS)),
    intent_angle: 0,
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
        ctx.fillStyle = chest.isTargeted ? '#ff00ff' : '#ffd700';
        ctx.shadowColor = chest.isTargeted ? '#ff00ff' : 'transparent';
        ctx.shadowBlur = chest.isTargeted ? 15 : 0;
        ctx.fillRect(cx - cSize / 2, cy - cSize / 2, cSize, cSize);
        ctx.shadowBlur = 0;

        if (chest.isTargeted) {
          ctx.strokeStyle = `rgba(255, 0, 255, ${(s.smooth_focus - s.holoThr) * 2})`;
          ctx.lineWidth = 2 + Math.random() * 4;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(s.player.x * cellSize, s.player.y * cellSize);
          ctx.stroke();
        }

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

    // Orbs & Telekinesis Beams
    for (let orb of s.maze.orbs) {
      if (orb.collected) continue;
      
      let ox = orb.x * cellSize;
      let oy = orb.y * cellSize;
      
      // Draw Orb (меняет цвет, если на нее направлено внимание)
      ctx.fillStyle = orb.isTargeted ? '#ff00ff' : '#00ffff';
      ctx.shadowColor = orb.isTargeted ? '#ff00ff' : '#00ffff';
      ctx.shadowBlur = orb.isTargeted ? 20 : 10;
      ctx.beginPath();
      ctx.arc(ox, oy, cellSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      // Draw Telekinesis Beam if being pulled
      if (orb.isTargeted) {
        ctx.strokeStyle = `rgba(255, 0, 255, ${(s.smooth_focus - s.holoThr) * 2})`;
        ctx.lineWidth = 2 + Math.random() * 4; // Flickering effect
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        // Player is at (s.player.x * cellSize, s.player.y * cellSize) in this coordinate space
        ctx.lineTo(s.player.x * cellSize, s.player.y * cellSize);
        ctx.stroke();
      }
    }

    ctx.restore();

    ctx.save();
    ctx.translate(width / 2 + playerDisparity, height / 2);

    let pSize = cellSize * 0.25;

    // 8-Channel Structural Analytics (Radar)
    let max_slow_ch = 0, max_fast_ch = 0;
    let ch_slow = new Float32Array(8);
    let ch_fast = new Float32Array(8);
    
    for(let c=0; c<8; c++) {
      let past_slow = Math.abs(s.slow_gamma_slots[c][1] + s.slow_gamma_slots[c][2] + s.slow_gamma_slots[c][3]);
      let future_fast = Math.abs(s.fast_gamma_slots[c][4] + s.fast_gamma_slots[c][5] + s.fast_gamma_slots[c][6]);
      ch_slow[c] = past_slow;
      ch_fast[c] = future_fast;
      if (past_slow > max_slow_ch) max_slow_ch = past_slow;
      if (future_fast > max_fast_ch) max_fast_ch = future_fast;
    }

    // Draw 8-Channel Radar (Past vs Future)
    ctx.lineWidth = 1;
    
    // Past (Slow Gamma) - Cyan
    ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
    ctx.beginPath();
    for(let c=0; c<=8; c++) {
      let idx = c % 8;
      let val = max_slow_ch > 0 ? ch_slow[idx] / max_slow_ch : 0;
      let angle = Math.atan2(ELECTRODES[idx].y, ELECTRODES[idx].x);
      let r = pSize * 2 + val * 30;
      let x = Math.cos(angle) * r;
      let y = Math.sin(angle) * r;
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.fill();
    ctx.stroke();

    // Future (Fast Gamma) - Magenta
    ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)';
    ctx.beginPath();
    for(let c=0; c<=8; c++) {
      let idx = c % 8;
      let val = max_fast_ch > 0 ? ch_fast[idx] / max_fast_ch : 0;
      let angle = Math.atan2(ELECTRODES[idx].y, ELECTRODES[idx].x);
      let r = pSize * 2 + val * 30;
      let x = Math.cos(angle) * r;
      let y = Math.sin(angle) * r;
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.fill();
    ctx.stroke();

    // Directional Intent Cone (Future / Fast Gamma Vector)
    if (s.smooth_focus > s.holoThr) {
      let draw_angle = s.intent_angle - Math.PI/2; // Align 0 with UP (nose)
      let cone_angle = Math.PI / 4 * (1.5 - s.sharpness); // Sharpness narrows the cone

      ctx.fillStyle = `rgba(255, 0, 255, ${(s.smooth_focus - s.holoThr) * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, pSize * 6, draw_angle - cone_angle, draw_angle + cone_angle);
      ctx.lineTo(0, 0);
      ctx.fill();

      // Population Vector Line (The exact predicted trajectory)
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(draw_angle) * pSize * 6, Math.sin(draw_angle) * pSize * 6);
      ctx.stroke();

      ctx.strokeStyle = `rgba(0, 255, 0, ${Math.min(1, s.smooth_focus)})`;
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
          let val = get_ciPLV(s.reArr, s.imArr, i, j);
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

      // 2. РАБОЧАЯ ПАМЯТЬ И НАМЕРЕНИЕ (ТЕТА-ГАММА АСИММЕТРИЯ И ВЕКТОР)
      let global_intent = 0;
      let fast_vec_x = 0, fast_vec_y = 0;
      
      let max_fast_future = 0;
      let sum_fast_future = 0;

      for (let c = 0; c < 8; c++) {
        let thetaRe = s.reArr[c][THETA_BIN];
        let thetaIm = s.imArr[c][THETA_BIN];
        let phase = Math.atan2(thetaIm, thetaRe); // -PI to PI
        let normalized_phase = (phase + Math.PI) / (2 * Math.PI);
        let slot = Math.floor(normalized_phase * NUM_SLOTS) % NUM_SLOTS;

        let slow_flow = 0;
        let fast_flow = 0;

        for (let j = 0; j < 8; j++) {
          if (c === j) continue;
          let i = Math.min(c, j);
          let k = Math.max(c, j);
          let sign = (c === i) ? 1 : -1;
          
          let slow_val = get_band_ciPLV(s.reArr, s.imArr, i, k, 31, 51);
          let fast_val = get_band_ciPLV(s.reArr, s.imArr, i, k, 61, 102);
          
          slow_flow += slow_val * sign;
          fast_flow += fast_val * sign;
        }

        // БЕЗ СГЛАЖИВАНИЯ (MAX REALTIME)
        s.slow_gamma_slots[c][slot] = slow_flow;
        s.fast_gamma_slots[c][slot] = fast_flow;

        // Оценка асимметрии: Медленная гамма в прошлом (слоты 1,2,3), Быстрая в будущем (слоты 4,5,6)
        let past_slow = s.slow_gamma_slots[c][1] + s.slow_gamma_slots[c][2] + s.slow_gamma_slots[c][3];
        let future_fast = s.fast_gamma_slots[c][4] + s.fast_gamma_slots[c][5] + s.fast_gamma_slots[c][6];

        let validity = Math.abs(past_slow) + Math.abs(future_fast);
        global_intent += validity;

        // Вектор Намерения (Population Vector Coding) на основе Быстрой Гаммы (Будущего)
        fast_vec_x += future_fast * ELECTRODES[c].x;
        fast_vec_y += future_fast * ELECTRODES[c].y;
        
        let abs_fast = Math.abs(future_fast);
        if (abs_fast > max_fast_future) max_fast_future = abs_fast;
        sum_fast_future += abs_fast;
      }
      global_intent /= 8; // Усредняем по 8 каналам
      
      // Calculate Sharpness (Focus Quality)
      let mean_fast_future = sum_fast_future / 8;
      // If max is much higher than mean, sharpness is high (1 channel dominates). If max == mean, sharpness is 0 (diffuse).
      let current_sharpness = mean_fast_future > 0 ? ((max_fast_future / mean_fast_future) - 1) / 7 : 0; 
      
      // БЕЗ СГЛАЖИВАНИЯ (MAX REALTIME)
      s.sharpness = current_sharpness;
      s.smooth_focus = global_intent;
      s.intent_angle = Math.atan2(fast_vec_y, fast_vec_x);

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

        chest.isTargeted = false;

        if (dist < 3.0 && chest.state === 'closed') {
          let chest_abs_angle = Math.atan2(dy, dx);
          let intent_world_angle = s.player.angle - Math.PI/2 + s.intent_angle;
          let focus_diff = Math.atan2(Math.sin(chest_abs_angle - intent_world_angle), Math.cos(chest_abs_angle - intent_world_angle));
          
          let cone_angle = Math.PI / 4 * (1.5 - s.sharpness);

          if (s.smooth_focus > s.holoThr && Math.abs(focus_diff) < cone_angle) {
            chest.isTargeted = true;
            chest.scanProgress += (s.smooth_focus - s.holoThr) * 0.05 * (1 + s.sharpness);
            if (chest.scanProgress >= 1.0) {
              chest.state = 'revealed';
            }
          } else {
            if (chest.scanProgress > 0) chest.scanProgress -= 0.01;
          }
        }
      }

      // 4. ЛОГИКА ТЕЛЕКИНЕЗА (СБОР СФЕР)
      for (let orb of s.maze.orbs) {
        if (orb.collected) continue;

        let dx = orb.x - s.player.x; // Вектор от игрока к сфере
        let dy = orb.y - s.player.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.5) {
          orb.collected = true;
          s.scorePenalty -= 100; // Bonus for collecting
          continue;
        }

        let orb_abs_angle = Math.atan2(dy, dx);
        // Нос игрока в мировых координатах смотрит на -Math.PI/2 (вверх)
        let intent_world_angle = s.player.angle - Math.PI/2 + s.intent_angle;
        
        // Разница между направлением на сферу и вектором намерения
        let focus_diff = Math.atan2(Math.sin(orb_abs_angle - intent_world_angle), Math.cos(orb_abs_angle - intent_world_angle));

        orb.isTargeted = false;

        // Если сфера близко, фокус выше порога И она находится в конусе внимания -> притягиваем
        // Sharpness narrows the cone and increases pull force
        let cone_angle = Math.PI / 4 * (1.5 - s.sharpness); 
        if (dist < 4.0 && s.smooth_focus > s.holoThr && Math.abs(focus_diff) < cone_angle) {
          orb.isTargeted = true;
          let pullForce = (s.smooth_focus - s.holoThr) * 0.15 * (1 + s.sharpness);
          orb.x -= (dx / dist) * pullForce; // Притягиваем к игроку
          orb.y -= (dy / dist) * pullForce;
        }
      }
    }

    // 5. ФИЗИКА ДВИЖЕНИЯ АВАТАРА
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

    // 6. AUDIO BIOFEEDBACK (The Brain's Mirror)
    if (audioRef.current) {
      let isTargeting = s.maze.orbs.some(o => o.isTargeted) || s.maze.chests.some(c => c.isTargeted);
      
      // Theta pulse (6Hz amplitude modulation)
      let theta_pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.001 * 6 * Math.PI * 2);
      
      // Volume depends on global intent (PAC) and pulses at Theta frequency
      let targetVol = Math.max(0, (s.smooth_focus - s.holoThr) * 0.3) * theta_pulse;
      
      // Pitch changes when locked onto a target, waveform changes with sharpness
      let targetFreq = isTargeting ? 432 : 150 + (s.smooth_focus * 100);
      
      // If attention is diffuse (low sharpness), sound is noisier/harsher. If sharp, it's pure.
      audioRef.current.osc.type = s.sharpness > 0.6 ? 'sine' : (s.sharpness > 0.4 ? 'triangle' : 'sawtooth');

      audioRef.current.gain.gain.setTargetAtTime(targetVol, audioRef.current.ctx.currentTime, 0.05);
      audioRef.current.osc.frequency.setTargetAtTime(targetFreq, audioRef.current.ctx.currentTime, 0.1);
    }

    reqRef.current = requestAnimationFrame(gameLoop);
  };

  const startSimulation = () => {
    initAudio();
    state.current.maze = new Maze(11);
    state.current.effortDist = 0;
    state.current.scorePenalty = 0;
    state.current.scoresHistory = [];
    state.current.isConnected = true;
    state.current.lastEegProcess = performance.now();
    setGameStarted(true);

    // Mock data generator for testing without BLE
    setInterval(() => {
      let t = Date.now() * 0.001;
      let theta_phase = (t * 6 * Math.PI * 2) % (Math.PI * 2);
      if (theta_phase > Math.PI) theta_phase -= Math.PI * 2; // -PI to PI
      
      let is_focused = true; // В симуляции всегда держим фокус, чтобы показать радар
      let sim_intent_angle = Math.sin(t * 0.8) * Math.PI; // Вектор внимания плавно сканирует как радар (180 градусов)

      for (let i = 0; i < 8; i++) {
        state.current.eegBuffer[i].set(state.current.eegBuffer[i].subarray(1));
        
        let val = (Math.random() - 0.5) * 50; // Шум
        val += Math.sin(t * 6 * Math.PI * 2) * 20; // Тета-волна (6 Гц)
        
        if (is_focused) {
          let electrode_angle = Math.atan2(ELECTRODES[i].y, ELECTRODES[i].x);
          // Симуляция асимметрии: Медленная гамма до пика, Быстрая после пика (широкополосная для фазовой когерентности)
          if (theta_phase > -Math.PI/2 && theta_phase < 0) {
            for(let f=31; f<=51; f+=5) val += Math.sin(t * f * Math.PI * 2 + electrode_angle) * 5; // Прошлое
          } else if (theta_phase > 0 && theta_phase < Math.PI/2) {
            // Будущее (Быстрая гамма) строго направлено!
            let angle_match = Math.cos(electrode_angle - sim_intent_angle);
            if (angle_match > 0) {
              for(let f=61; f<=102; f+=5) val += Math.sin(t * f * Math.PI * 2 + electrode_angle) * 8 * angle_match;
            }
          }
        }
        
        state.current.eegBuffer[i][255] = val;
      }
    }, 4); // ~250Hz

    reqRef.current = requestAnimationFrame(gameLoop);
  };

  const startBLE = async () => {
    initAudio();
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

        <div className="text-xs mb-1 flex justify-between items-center uppercase mt-2 text-[#f0f]">INTENT (PAST-FUTURE PAC):</div>
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
          <h1 className="text-[#0ff] text-4xl mb-4 font-bold shadow-[#0ff]" style={{ textShadow: '0 0 20px #0ff' }}>NEURO REACTOR v10.2</h1>
          <p className="text-[#888] max-w-md text-sm mb-5">
            "Frieren's Chests" - PAC Focus Edition.<br /><br />
            1. <b>Move:</b> Auto-move via Alpha/Beta symmetry.<br />
            2. <b>Selective Telekinesis:</b> Focus your intent to align Past/Future Gamma. <b>Direct your focus</b> to pull specific blue energy orbs towards you!<br />
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
