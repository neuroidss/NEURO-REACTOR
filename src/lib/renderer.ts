import { BUF_SIZE, ANGLES, RADIUS, ELECTRODES, THETA_BIN, GAMMA_BIN, NUM_PAIRS, NUM_SLOTS, WM_DECAY, REF_CH, PAIRS, PAIR_MIDS, fft, applyNotchFilters, get_ciPLV, get_band_ciPLV } from './eeg-math';
import { Maze } from './maze';

export function drawScene(ctx: CanvasRenderingContext2D, width: number, height: number, playerDisparity: number, s: any, isVR: boolean, scoreRef: any) {
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
          ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
        else if (s.maze.grid[r][c] === 2) {
          ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, cellSize / 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    for (let chest of s.maze.chests) {
      if (chest.state === 'looted') continue;
      let cx = chest.x * cellSize;
      let cy = chest.y * cellSize;
      let cSize = cellSize * 0.4;
      
      if (chest.isTargeted) {
        ctx.strokeStyle = '#f0f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(s.player.x * cellSize, s.player.y * cellSize);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }

      if (chest.state === 'closed') {
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = chest.isTargeted ? 20 : 5;
        ctx.fillRect(cx - cSize/2, cy - cSize/2, cSize, cSize);
        ctx.shadowBlur = 0;
        
        if (chest.scanProgress > 0) {
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, cSize, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * chest.scanProgress));
            ctx.stroke();
        }
      } else if (chest.state === 'revealed') {
        if (chest.isMimic) {
            ctx.fillStyle = '#f00';
            ctx.beginPath();
            ctx.moveTo(cx - cSize/2, cy - cSize/2);
            ctx.lineTo(cx + cSize/2, cy - cSize/2);
            ctx.lineTo(cx, cy + cSize/2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.moveTo(cx, cy - cSize/2);
            ctx.lineTo(cx + cSize/2, cy);
            ctx.lineTo(cx, cy + cSize/2);
            ctx.lineTo(cx - cSize/2, cy);
            ctx.fill();
        }
      }
    }

    for (let orb of s.maze.orbs) {
      if (orb.collected) continue;

      let ox = orb.x * cellSize;
      let oy = orb.y * cellSize;

      ctx.fillStyle = '#0ff';
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(ox, oy, cellSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (orb.isTargeted) {
        ctx.strokeStyle = `rgba(255, 0, 255, ${(s.smooth_focus - s.holoThr) * 2})`;
        ctx.lineWidth = 2 + Math.random() * 4;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(s.player.x * cellSize, s.player.y * cellSize);
        ctx.stroke();
      }
    }

    for (let bot of s.bots) {
      ctx.save();
      ctx.translate(bot.x * cellSize, bot.y * cellSize);
      ctx.rotate(bot.angle);

      const MANDALA_SCALE = (cellSize * 2.0) / RADIUS; 
      for (let p = 0; p < NUM_PAIRS; p++) {
          let px = PAIR_MIDS[p].x * MANDALA_SCALE;
          let py = PAIR_MIDS[p].y * MANDALA_SCALE;
          for (let slot = 0; slot < NUM_SLOTS; slot++) {
              let val = bot.slot_ciplv[p][slot];
              if (val > 0.3) { 
                  ctx.fillStyle = bot.color;
                  ctx.globalAlpha = Math.min(1.0, (val - 0.3) / 0.7); 
                  ctx.beginPath(); 
                  ctx.arc(px, py, 2 + (val * 20), (slot/NUM_SLOTS)*Math.PI*2, ((slot+1)/NUM_SLOTS)*Math.PI*2); 
                  ctx.lineTo(px, py); 
                  ctx.fill();
              }
          }
      }

      ctx.globalAlpha = 1.0;
      ctx.fillStyle = bot.color; 
      ctx.beginPath(); 
      ctx.arc(0, 0, cellSize*0.3, 0, Math.PI*2); 
      ctx.fill();
      ctx.fillStyle = '#fff'; 
      ctx.beginPath(); 
      ctx.moveTo(0, -cellSize*0.4); 
      ctx.lineTo(-cellSize*0.2, cellSize*0.1); 
      ctx.lineTo(cellSize*0.2, cellSize*0.1); 
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    ctx.save();
    ctx.translate(width / 2 + playerDisparity, height / 2);

    let pSize = cellSize * 0.25;

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

    ctx.lineWidth = 1;
    
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

    if (s.smooth_focus > s.holoThr) {
      let draw_angle = s.intent_angle - Math.PI/2;
      let cone_angle = Math.PI / 4 * (1.5 - s.sharpness);

      ctx.fillStyle = `rgba(255, 0, 255, ${(s.smooth_focus - s.holoThr) * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, pSize * 6, draw_angle - cone_angle, draw_angle + cone_angle);
      ctx.lineTo(0, 0);
      ctx.fill();

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
}

export function renderCanvas(canvas: HTMLCanvasElement, s: any, isVR: boolean, scoreRef: any) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (isVR) {
      const halfW = canvas.width / 2;
      const playerDisparity = 3;

      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, halfW, canvas.height); ctx.clip();
      drawScene(ctx, halfW, canvas.height, playerDisparity, s, isVR, scoreRef);
      ctx.restore();

      ctx.save();
      ctx.beginPath(); ctx.rect(halfW, 0, halfW, canvas.height); ctx.clip();
      ctx.translate(halfW, 0);
      drawScene(ctx, halfW, canvas.height, -playerDisparity, s, isVR, scoreRef);
      ctx.restore();

      ctx.fillStyle = '#020202';
      ctx.fillRect(halfW - 2, 0, 4, canvas.height);
    } else {
      drawScene(ctx, canvas.width, canvas.height, 0, s, isVR, scoreRef);
    }
}
