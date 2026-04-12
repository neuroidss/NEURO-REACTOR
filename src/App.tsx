import React, { useEffect, useRef, useState } from 'react';
import { BUF_SIZE, ANGLES, RADIUS, ELECTRODES, UV_SCALE, THETA_BIN, GAMMA_BIN, NUM_PAIRS, NUM_SLOTS, WM_DECAY, REF_CH, PAIRS, PAIR_MIDS, fft, applyNotchFilters, get_ciPLV, get_band_ciPLV } from './lib/eeg-math';
import { Maze } from './lib/maze';
import { NeuroReactorAudio } from './lib/audio';
import { renderCanvas } from './lib/renderer';

import { processEEGData, updatePhysics } from './lib/game-logic';
import { Bot } from './lib/bot';

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
  const botsScoreRef = useRef(null);
  const reflectionRef = useRef(null);
  const synapseFillRef = useRef(null);
  const focusFillRef = useRef(null);
  const pointerRef = useRef(null);
  const damageFlashRef = useRef(null);
  const wsStatusRef = useRef(null);

  const [uiVisible, setUiVisible] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [invertDevice, setInvertDevice] = useState(false);
  const [isVR, setIsVR] = useState(false);
  const [moveModeState, setMoveModeState] = useState('crystal');
  const [wmModeState, setWmModeState] = useState('pac_pairs');
  const [cameraViewState, setCameraViewState] = useState('first_person');

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
    slot_re: Array.from({ length: 28 }, () => new Float32Array(NUM_SLOTS)),
    slot_im: Array.from({ length: 28 }, () => new Float32Array(NUM_SLOTS)),
    slot_ciplv: Array.from({ length: 28 }, () => new Float32Array(NUM_SLOTS)),
    intent_angle: 0,
    ws: null,
    floor: 1,
    moveMode: 'crystal',
    wmMode: 'pac_pairs',
    cameraView: 'first_person', // 'first_person', 'world'
    dashCooldown: 0,
    dashThr: 0.8,
    bots: [] as any[],
    reflection_depth: 0,
    demoMode: 'maze', // 'cursor', 'maze', 'drone', 'car'
    debug: {
      showRawSignals: false,
      showCiPLV: false,
      showPAC: false,
      showDirectionVector: false
    },
    demoTargets: [] as any[],
    demoState: { cursorIdeal: 0, cursorActual: 0, rings: [], obstacles: [] },
    extraUsers: [] as any[]
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


  const gameLoop = (time) => {
    const s = state.current;
    if (!s.isConnected) {
      reqRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    processEEGData(s, time, takeDamage);
    updatePhysics(s, invertDevice, takeDamage);

    for (let u of s.extraUsers) {
        u.skillLevel = s.skillLevel;
        u.holoThr = s.holoThr;
        u.moveMode = s.moveMode;
        u.wmMode = s.wmMode;
        u.demoMode = s.demoMode;
        u.cameraView = s.cameraView;
        processEEGData(u, time, () => {});
        updatePhysics(u, invertDevice, () => {});
    }

    for (let bot of s.bots) {
        bot.update(time, s.maze);
    }

    let neScore = 0;
    if (s.demoMode === 'maze') {
        let wastedRatio = Math.max(1, s.effortDist / s.maze.optimalDist);
        neScore = (1000 - 144.27 * Math.log(wastedRatio)) - s.scorePenalty;
    } else {
        neScore = 1000 - s.scorePenalty; // scorePenalty goes negative to add points
    }
    if (neScore < 0) neScore = 0;

    if (scoreRef.current) {
      scoreRef.current.innerText = neScore.toFixed(1);
      scoreRef.current.style.color = neScore > 900 ? '#0f0' : (neScore > 700 ? '#ff0' : '#f00');
    }

    if (reflectionRef.current) {
      reflectionRef.current.innerText = s.reflection_depth.toFixed(1);
    }

    if (botsScoreRef.current && s.bots.length > 0) {
      botsScoreRef.current.innerHTML = s.bots.map(b => 
        `<div style="color: ${b.color}; display: flex; justify-content: space-between;">
          <span>BOT ${b.id}</span>
          <span>${b.score}</span>
        </div>`
      ).join('');
    }

    if (s.demoMode === 'maze') {
      let py = Math.floor(s.player.y);
      let px = Math.floor(s.player.x);
      if (py >= 0 && py < s.maze.dim && px >= 0 && px < s.maze.dim) {
        if (s.maze.grid[py][px] === 2) {
          s.scoresHistory.push(neScore);
          s.floor += 1;
          if (floorRef.current) floorRef.current.innerText = s.floor;
          s.maze = new Maze(11);
          s.player.x = 1.5;
          s.player.y = 1.5;
          s.effortDist = 0;
          s.scorePenalty = 0;
          for (let bot of s.bots) {
            bot.x = 1.5 + (Math.random() - 0.5);
            bot.y = 1.5 + (Math.random() - 0.5);
          }
        }
      }
    }

    if (uiVisible) {
      if (synapseFillRef.current) synapseFillRef.current.style.width = (s.synapticPersistence * 100) + '%';
      if (focusFillRef.current) focusFillRef.current.style.width = Math.min(100, s.smooth_focus * 100) + '%';
      if (pointerRef.current) {
        pointerRef.current.style.left = (50 + s.ctrl.moveX * 5) + '%';
        pointerRef.current.style.top = (50 + s.ctrl.moveY * 5) + '%';
      }
    }

    renderCanvas(canvasRef.current, s, isVR, scoreRef);

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

  const createExtraUser = (id: number, color: string) => {
    return {
      id,
      color,
      skillLevel: 0.05,
      holoThr: 0.50,
      synapticPersistence: 0,
      smooth_focus: 0,
      scorePenalty: 0,
      effortDist: 0,
      lastTargetX: 0,
      lastTargetY: 0,
      ctrl: { moveX: 0, moveY: 0, torque: 0 },
      player: { x: 1.5 + (Math.random() - 0.5), y: 1.5 + (Math.random() - 0.5), angle: 0, altitude: 0 },
      maze: state.current.maze, // Share the same maze
      lastEegProcess: performance.now(),
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
      slot_re: Array.from({ length: 28 }, () => new Float32Array(NUM_SLOTS)),
      slot_im: Array.from({ length: 28 }, () => new Float32Array(NUM_SLOTS)),
      slot_ciplv: Array.from({ length: 28 }, () => new Float32Array(NUM_SLOTS)),
      intent_angle: 0,
      moveMode: state.current.moveMode,
      wmMode: state.current.wmMode,
      dashCooldown: 0,
      dashThr: 0.8,
      demoMode: state.current.demoMode,
      cameraView: state.current.cameraView,
      demoTargets: [],
      demoState: { cursorIdeal: 0, cursorActual: 0, rings: [], obstacles: [] }
    };
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
        let val = 0;
        
        // 1. АВТОПИЛОТ (Движение)
        let electrode_angle = Math.atan2(ELECTRODES[i].y, ELECTRODES[i].x);
        
        if (state.current.moveMode === 'crystal') {
            // Плоская бегущая волна (диполь) вдоль оси X
            val += Math.sin(t * 20 * Math.PI * 2 + ELECTRODES[i].x * 0.5) * 15;
        } else if (state.current.moveMode === 'pointer') {
            // Центр масс смещен (например, вправо-вверх)
            if (ELECTRODES[i].x > 0 && ELECTRODES[i].y > 0) {
                val += Math.sin(t * 20 * Math.PI * 2) * 25;
            }
        } else if (state.current.moveMode === 'traveling_wave') {
            // Радиальная волна (от центра к краям)
            let r = Math.sqrt(ELECTRODES[i].x**2 + ELECTRODES[i].y**2);
            val += Math.sin(t * 20 * Math.PI * 2 - r * 0.5) * 15;
        }

        // 2. РАБОЧАЯ ПАМЯТЬ (Тета-Гамма)
        val += Math.sin(t * 6 * Math.PI * 2) * 20; // Тета-волна (6 Гц)
        
        if (is_focused) {
          if (state.current.wmMode === 'pac_pairs' || state.current.wmMode === 'dash') {
              // Gamma burst at specific theta phase for specific electrodes
              let angle_match = Math.cos(electrode_angle - sim_intent_angle);
              if (theta_phase > 0 && theta_phase < Math.PI/2 && angle_match > 0.5) {
                  val += Math.sin(t * 80 * Math.PI * 2 + electrode_angle) * 15;
              }
          } else if (state.current.wmMode === 'pac_flow') {
              // Симуляция асимметрии: Медленная гамма до пика, Быстрая после пика
              if (theta_phase > -Math.PI/2 && theta_phase < 0) {
                for(let f=31; f<=51; f+=5) val += Math.sin(t * f * Math.PI * 2 + electrode_angle) * 5; // Прошлое
              } else if (theta_phase > 0 && theta_phase < Math.PI/2) {
                let angle_match = Math.cos(electrode_angle - sim_intent_angle);
                if (angle_match > 0) {
                  for(let f=61; f<=102; f+=5) val += Math.sin(t * f * Math.PI * 2 + electrode_angle) * 8 * angle_match;
                }
              }
          } else if (state.current.wmMode === 'aac_envelope') {
              let angle_match = Math.cos(electrode_angle - sim_intent_angle);
              if (angle_match > 0) {
                  val += Math.sin(t * 80 * Math.PI * 2) * 10 * angle_match * Math.max(0, Math.sin(t * 6 * Math.PI * 2));
              }
          }
        }
        
        state.current.eegBuffer[i][255] = val;
        
        for (let u of state.current.extraUsers) {
            if (u.isSim) {
                u.eegBuffer[i].set(u.eegBuffer[i].subarray(1));
                let uval = val + (Math.random() - 0.5) * 10; // Add noise
                if (Math.random() < 0.05) uval += Math.sin(t * 20 * Math.PI * 2 + u.id) * 30; // Random bursts
                u.eegBuffer[i][255] = uval;
            }
        }
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
          <div ref={botsScoreRef} className="text-xs mt-2 flex flex-col gap-1"></div>
        </div>

        <div className="text-xs mb-1 flex justify-between items-center uppercase mt-4 text-[#0ff]">MOVE (ALPHA/BETA):</div>
        <div className="w-full h-1.5 bg-[#111] my-2 border border-[#333]">
          <div ref={synapseFillRef} className="h-full bg-[#0ff] w-0 shadow-[0_0_10px_#0ff] transition-all duration-100"></div>
        </div>

        <div className="text-xs mb-1 flex justify-between items-center uppercase mt-2 text-[#f0f]">INTENT (PAST-FUTURE PAC):</div>
        <div className="w-full h-1.5 bg-[#111] my-2 border border-[#333]">
          <div ref={focusFillRef} className="h-full bg-[#f0f] w-0 shadow-[0_0_10px_#f0f] transition-all duration-100"></div>
        </div>

        <div className="mt-4 pt-4 border-t-2 border-dashed border-[#f0f]">
          <div className="text-xs mb-1 flex justify-between items-center uppercase text-[#ff0]">
            REFLECTION DEPTH: <span ref={reflectionRef} className="text-white text-base font-bold">0.0</span>
          </div>
          <div className="text-[10px] text-[#888] mt-1">PAC Symmetry & Slots</div>
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
            <span className="text-[#ff0]">DASH THRESHOLD</span>
            <span>{state.current.dashThr.toFixed(2)}</span>
          </div>
          <input type="range" min="0.1" max="2.0" step="0.05" defaultValue="0.80" className="w-full accent-[#ff0] cursor-pointer"
            onChange={(e) => { state.current.dashThr = parseFloat(e.target.value); e.target.previousElementSibling.lastChild.textContent = state.current.dashThr.toFixed(2); }} />
        </div>

        <div className="mt-2 border-t border-[#333] pt-2">
          <div className="text-[10px] mb-1 flex justify-between items-center uppercase">
            <span className="text-[#0f0]">CAMERA ZOOM</span>
            <span>{state.current.zoomLevel}</span>
          </div>
          <input type="range" min="20" max="150" step="1" defaultValue="80" className="w-full accent-[#0f0] cursor-pointer"
            onChange={(e) => { state.current.zoomLevel = parseInt(e.target.value); e.target.previousElementSibling.lastChild.textContent = state.current.zoomLevel; }} />
        </div>

        <button onClick={() => { 
          const modes = ['crystal', 'pointer', 'traveling_wave'];
          const newMode = modes[(modes.indexOf(state.current.moveMode) + 1) % modes.length];
          state.current.moveMode = newMode;
          setMoveModeState(newMode);
        }} className={`w-full mt-2 py-2 px-4 border-2 rounded-lg font-mono transition-colors text-xs ${moveModeState === 'crystal' ? 'bg-black text-[#0f0] border-[#0f0] shadow-[0_0_10px_#0f0]' : 'bg-black text-[#f0f] border-[#f0f] shadow-[0_0_10px_#f0f]'}`}>
          MOVE MODE: {moveModeState === 'crystal' ? 'CRYSTAL (DEFAULT)' : moveModeState === 'pointer' ? 'POINTER (MOUSE)' : 'WAVE (TOP-DOWN/BOTTOM-UP)'}
        </button>
        <button onClick={() => { 
          const modes = ['pac_pairs', 'pac_flow', 'aac_envelope', 'dash'];
          const newMode = modes[(modes.indexOf(state.current.wmMode) + 1) % modes.length];
          state.current.wmMode = newMode;
          setWmModeState(newMode);
        }} className={`w-full mt-2 py-2 px-4 border-2 rounded-lg font-mono transition-colors text-xs ${wmModeState === 'pac_pairs' ? 'bg-black text-[#0f0] border-[#0f0] shadow-[0_0_10px_#0f0]' : 'bg-black text-[#f0f] border-[#f0f] shadow-[0_0_10px_#f0f]'}`}>
          WM MODE: {wmModeState === 'pac_pairs' ? 'PAC PAIRS (CRYSTAL)' : wmModeState === 'pac_flow' ? 'PAC FLOW (ASYMMETRY)' : wmModeState === 'aac_envelope' ? 'AAC ENVELOPE' : 'DASH'}
        </button>
        <button onClick={() => { 
          const modes = ['first_person', 'world_rotate', 'world_fixed'];
          const newView = modes[(modes.indexOf(state.current.cameraView) + 1) % modes.length];
          state.current.cameraView = newView;
          setCameraViewState(newView);
        }} className={`w-full mt-2 py-2 px-4 border-2 rounded-lg font-mono transition-colors text-xs ${cameraViewState.startsWith('world') ? 'bg-black text-[#0f0] border-[#0f0] shadow-[0_0_10px_#0f0]' : 'bg-black text-[#f0f] border-[#f0f] shadow-[0_0_10px_#f0f]'}`}>
          CAMERA: {cameraViewState === 'world_fixed' ? 'WORLD (FIXED UP)' : cameraViewState === 'world_rotate' ? 'WORLD (ROTATE)' : 'FIRST PERSON'}
        </button>
        <button onClick={() => {
          const colors = ['#0ff', '#f0f', '#ff0', '#0f0'];
          const id = state.current.bots.length;
          const bot = new Bot(id, colors[id % colors.length], state.current.player.x + (Math.random() - 0.5) * 2, state.current.player.y + (Math.random() - 0.5) * 2);
          state.current.bots.push(bot);
        }} className="w-full mt-2 py-2 px-4 bg-black text-[#ff0] border-2 border-[#ff0] rounded-lg font-mono shadow-[0_0_10px_#ff0] active:bg-[#ff0] active:text-black">
          + ADD BOT
        </button>
        <button onClick={async () => {
          const colors = ['#0ff', '#f0f', '#ff0', '#0f0'];
          const id = state.current.extraUsers.length + 1;
          const newUser = createExtraUser(id, colors[id % colors.length]);
          
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
                  newUser.eegBuffer[i].set(newUser.eegBuffer[i].subarray(1));
                  newUser.eegBuffer[i][255] = v * UV_SCALE;
                }
              }
            });
            state.current.extraUsers.push(newUser);
          } catch (e) {
            alert("Ошибка BLE: " + e);
          }
        }} className="w-full mt-2 py-2 px-4 bg-black text-[#0ff] border-2 border-[#0ff] rounded-lg font-mono shadow-[0_0_10px_#0ff] active:bg-[#0ff] active:text-black">
          + ADD USER (BLE)
        </button>
        <button onClick={() => {
          const colors = ['#0ff', '#f0f', '#ff0', '#0f0'];
          const id = state.current.extraUsers.length + 1;
          const newUser = createExtraUser(id, colors[id % colors.length]);
          newUser.isSim = true;
          state.current.extraUsers.push(newUser);
        }} className="w-full mt-2 py-2 px-4 bg-black text-[#888] border-2 border-[#555] rounded-lg font-mono active:bg-[#555] active:text-black">
          + ADD USER (SIM)
        </button>
        <button onClick={() => setInvertDevice(!invertDevice)} className={`w-full mt-2 py-2 px-4 border-2 rounded-lg font-mono transition-colors ${invertDevice ? 'bg-black text-[#ff0] border-[#ff0] shadow-[0_0_10px_#ff0]' : 'bg-black text-[#0f0] border-[#0f0] shadow-[0_0_10px_#0f0]'}`}>
          USB CABLE: {invertDevice ? 'BOTTOM' : 'TOP'}
        </button>
        <div className="mt-4 pt-4 border-t-2 border-dashed border-[#0ff]">
          <div className="text-[10px] mb-2 text-[#0ff] font-bold">DEMO MODE (EDUCATION)</div>
          <select 
            className="w-full bg-black text-[#0f0] border border-[#0f0] rounded p-1 text-xs mb-2 outline-none"
            onChange={(e) => {
              state.current.demoMode = e.target.value;
              // Reset player position for new mode
              state.current.player.x = 1.5;
              state.current.player.y = 1.5;
              state.current.player.angle = 0;
              state.current.demoTargets = [];
            }}
            defaultValue="maze"
          >
            <option value="cursor">BrainCursor (★☆☆☆☆)</option>
            <option value="maze">BrainMaze (★★☆☆☆)</option>
            <option value="drone">BrainDrone (★★☆☆☆)</option>
            <option value="car">BrainCar (★★☆☆☆)</option>
          </select>

          <div className="text-[10px] mb-2 text-[#0ff] font-bold mt-4">DEBUG OVERLAYS</div>
          {['showRawSignals', 'showCiPLV', 'showPAC', 'showDirectionVector'].map(flag => (
            <label key={flag} className="flex items-center space-x-2 text-xs mb-1 cursor-pointer">
              <input 
                type="checkbox" 
                className="accent-[#0f0]"
                onChange={(e) => {
                  state.current.debug[flag] = e.target.checked;
                }}
              />
              <span>{flag.replace('show', '')}</span>
            </label>
          ))}
        </div>

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
            "Neuro-Chests" - PAC Focus Edition.<br /><br />
            1. <b>Move:</b> Auto-move via Beta/Lower Gamma (18-36 Hz) symmetry.<br />
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
