import { BUF_SIZE, ANGLES, RADIUS, ELECTRODES, THETA_BIN, GAMMA_BIN, NUM_PAIRS, NUM_SLOTS, WM_DECAY, REF_CH, PAIRS, PAIR_MIDS, fft, applyNotchFilters, get_ciPLV, get_band_ciPLV } from './eeg-math';
import { Maze } from './maze';

export function drawScene(ctx: CanvasRenderingContext2D, width: number, height: number, playerDisparity: number, s: any, isVR: boolean, scoreRef: any) {
    const cellSize = s.zoomLevel;

    let camX = s.player.x * cellSize;
    let camY = s.player.y * cellSize;
    let camAngle = s.player.angle;

    if (s.cameraView === 'world_fixed' || s.cameraView === 'world_rotate') {
        camAngle = 0;
        if (s.demoMode === 'maze') {
            camX = (s.maze.dim * cellSize) / 2;
            camY = (s.maze.dim * cellSize) / 2;
        } else {
            camX = 0;
            camY = 0;
        }
    } else {
        if (s.demoMode === 'cursor') {
            camX = 0; camY = 0; camAngle = 0;
        } else if (s.demoMode === 'car') {
            camX = 0;
            camY = s.player.y * cellSize - height / 4;
            camAngle = 0;
        } else if (s.demoMode === 'drone') {
            camAngle = 0;
        }
    }

    ctx.save();
    ctx.fillStyle = s.demoMode === 'drone' ? '#051020' : '#111';
    if (s.demoMode === 'maze') ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    ctx.translate(width / 2, height / 2);
    ctx.rotate(-camAngle);
    ctx.translate(-camX, -camY);

    if (s.demoMode === 'maze') {
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
    } else if (s.demoMode === 'cursor') {
        for (let t of s.demoTargets) {
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(t.x * cellSize, t.y * cellSize, cellSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (s.demoMode === 'car') {
        ctx.fillStyle = '#222';
        ctx.fillRect(-3 * cellSize, s.player.y * cellSize - height, 6 * cellSize, height * 2);
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(0, s.player.y * cellSize - height);
        ctx.lineTo(0, s.player.y * cellSize + height);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let obs of s.demoState.obstacles) {
            ctx.fillStyle = '#888';
            ctx.fillRect(obs.x * cellSize - cellSize*0.4, obs.y * cellSize - cellSize*0.4, cellSize*0.8, cellSize*0.8);
        }
    } else if (s.demoMode === 'drone') {
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = -20; i <= 20; i++) {
            ctx.beginPath(); ctx.moveTo(i * cellSize, -20 * cellSize); ctx.lineTo(i * cellSize, 20 * cellSize); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-20 * cellSize, i * cellSize); ctx.lineTo(20 * cellSize, i * cellSize); ctx.stroke();
        }
        for (let ring of s.demoState.rings) {
            let rx = ring.x * cellSize;
            let ry = ring.y * cellSize;
            ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
            ctx.beginPath(); ctx.arc(rx, ry, cellSize*0.4, 0, Math.PI*2); ctx.fill();
            ctx.save();
            ctx.translate(rx, ry);
            let rScale = 1.0 + ring.alt * 2.0;
            ctx.scale(rScale, rScale);
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, cellSize*0.4, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
        }
    }

    if (s.moveMode === 'pointer') {
        let px = s.pointer_world_x * cellSize;
        let py = s.pointer_world_y * cellSize;
        
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 10, py);
        ctx.lineTo(px + 10, py);
        ctx.moveTo(px, py - 10);
        ctx.lineTo(px, py + 10);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
        ctx.beginPath();
        ctx.moveTo(s.player.x * cellSize, s.player.y * cellSize);
        ctx.lineTo(px, py);
        ctx.stroke();
    }

    for (let bot of s.bots) {
      ctx.save();
      ctx.translate(bot.x * cellSize, bot.y * cellSize);
      ctx.rotate(bot.angle);

      for (let slot = 0; slot < NUM_SLOTS; slot++) {
          let hue = Math.floor((slot * 360) / NUM_SLOTS);
          ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.5)`;
          ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.15)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          
          for (let c = 0; c < 8; c++) {
              let energy = 0;
              for (let p = 0; p < NUM_PAIRS; p++) {
                  if (PAIRS[p][0] === c || PAIRS[p][1] === c) {
                      energy += bot.slot_ciplv[p][slot];
                  }
              }
              energy = Math.max(0, energy - 0.3 * 7) / 7.0; // 0.3 is bot holoThr
              
              let radius = cellSize * 0.4 + (energy * cellSize * 2.0);
              let px = Math.cos(ANGLES[c]) * radius;
              let py = Math.sin(ANGLES[c]) * radius;
              
              if (c === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
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

    for (let u of s.extraUsers) {
      ctx.save();
      ctx.translate(u.player.x * cellSize, u.player.y * cellSize);
      ctx.rotate(u.player.angle);

      for (let slot = 0; slot < NUM_SLOTS; slot++) {
          let hue = Math.floor((slot * 360) / NUM_SLOTS);
          ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.5)`;
          ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.15)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          
          for (let c = 0; c < 8; c++) {
              let energy = 0;
              for (let p = 0; p < NUM_PAIRS; p++) {
                  if (PAIRS[p][0] === c || PAIRS[p][1] === c) {
                      energy += u.slot_ciplv[p][slot];
                  }
              }
              energy = Math.max(0, energy - u.holoThr * 7) / 7.0; 
              
              let radius = cellSize * 0.4 + (energy * cellSize * 2.0);
              let px = Math.cos(ANGLES[c]) * radius;
              let py = Math.sin(ANGLES[c]) * radius;
              
              if (c === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
      }

      ctx.globalAlpha = 1.0;
      ctx.fillStyle = u.color; 
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
    
    // Position player correctly relative to camera
    if (s.cameraView === 'world_fixed' || s.cameraView === 'world_rotate') {
        if (s.demoMode === 'maze') {
            ctx.translate(s.player.x * cellSize - (s.maze.dim * cellSize) / 2, s.player.y * cellSize - (s.maze.dim * cellSize) / 2);
        } else {
            ctx.translate(s.player.x * cellSize, s.player.y * cellSize);
        }
    } else {
        if (s.demoMode === 'car') {
            ctx.translate(s.player.x * cellSize, height / 4);
        }
    }
    
    // Rotate player
    if (s.cameraView !== 'first_person') {
        ctx.rotate(s.player.angle);
    }

    // Render Theta-Gamma Mandala (Working Memory) as Polygons
    for (let slot = 0; slot < NUM_SLOTS; slot++) {
        let hue = Math.floor((slot * 360) / NUM_SLOTS);
        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.5)`;
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.15)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let c = 0; c < 8; c++) {
            let energy = 0;
            for (let p = 0; p < NUM_PAIRS; p++) {
                if (PAIRS[p][0] === c || PAIRS[p][1] === c) {
                    energy += s.slot_ciplv[p][slot];
                }
            }
            energy = Math.max(0, energy - s.holoThr * 7) / 7.0; // Subtract threshold and normalize
            
            let radius = cellSize * 0.4 + (energy * cellSize * 2.0);
            let px = Math.cos(ANGLES[c]) * radius;
            let py = Math.sin(ANGLES[c]) * radius;
            
            if (c === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    if (s.demoMode === 'car') {
        ctx.fillStyle = '#f00';
        ctx.fillRect(-cellSize*0.3, -cellSize*0.5, cellSize*0.6, cellSize);
    } else if (s.demoMode === 'drone') {
        let altScale = 1.0 + (s.player.altitude || 0) * 2.0;
        ctx.scale(altScale, altScale);
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -cellSize*0.4);
        ctx.lineTo(cellSize*0.3, cellSize*0.3);
        ctx.lineTo(-cellSize*0.3, cellSize*0.3);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = `rgba(0, 255, 255, ${0.5 + Math.random()*0.5})`;
        ctx.beginPath(); ctx.arc(0, -cellSize*0.4, cellSize*0.1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cellSize*0.3, cellSize*0.3, cellSize*0.1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-cellSize*0.3, cellSize*0.3, cellSize*0.1, 0, Math.PI*2); ctx.fill();
    } else if (s.demoMode === 'cursor') {
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        ctx.arc(0, 0, cellSize * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(0, 255, 255, ${s.synapticPersistence})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, cellSize * 0.4 + s.synapticPersistence * 20, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        let pSize = cellSize * 0.3;
        ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(0, 0, pSize, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -pSize * 1.5); ctx.lineTo(-pSize * 0.7, pSize * 0.5); ctx.lineTo(pSize * 0.7, pSize * 0.5); ctx.fill();
    }
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

    if (s.debug) {
        drawDebug(ctx, canvas.width, canvas.height, s);
    }
}

function drawDebug(ctx: CanvasRenderingContext2D, width: number, height: number, s: any) {
    ctx.save();
    
    // 1. Raw Signals (Bottom Left)
    if (s.debug.showRawSignals) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(10, height - 220, 300, 210);
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 1;
        ctx.font = '10px monospace';
        ctx.fillStyle = '#0f0';
        ctx.fillText('RAW EEG (8 CH)', 15, height - 205);
        
        for (let c = 0; c < 8; c++) {
            ctx.beginPath();
            let yOffset = height - 190 + c * 25;
            for (let t = 0; t < BUF_SIZE; t++) {
                let val = s.eegBuffer[c][t] / 100.0; // Scale
                let x = 15 + (t / BUF_SIZE) * 290;
                let y = yOffset - val;
                if (t === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }

    // 2. ciPLV Matrix/Graph (Bottom Right)
    if (s.debug.showCiPLV) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(width - 220, height - 220, 210, 210);
        ctx.fillStyle = '#0ff';
        ctx.fillText('ciPLV CONNECTIVITY', width - 210, height - 205);
        
        let cx = width - 115;
        let cy = height - 115;
        let r = 80;
        
        // Draw lines
        for (let p = 0; p < NUM_PAIRS; p++) {
            let chA = PAIRS[p][0];
            let chB = PAIRS[p][1];
            let val = s.debug_ciplv ? Math.abs(s.debug_ciplv[p]) : 0;
            if (val > 0.2) {
                ctx.strokeStyle = `rgba(0, 255, 255, ${val})`;
                ctx.lineWidth = val * 5;
                ctx.beginPath();
                ctx.moveTo(cx + ELECTRODES[chA].x * (r/RADIUS), cy + ELECTRODES[chA].y * (r/RADIUS));
                ctx.lineTo(cx + ELECTRODES[chB].x * (r/RADIUS), cy + ELECTRODES[chB].y * (r/RADIUS));
                ctx.stroke();
            }
        }
        
        // Draw nodes
        for (let c = 0; c < 8; c++) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(cx + ELECTRODES[c].x * (r/RADIUS), cy + ELECTRODES[c].y * (r/RADIUS), 4, 0, Math.PI*2);
            ctx.fill();
        }
    }

    // 3. PAC Histogram (Top Right)
    if (s.debug.showPAC) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(width - 320, 10, 310, 150);
        ctx.fillStyle = '#f0f';
        ctx.fillText('PAC: THETA-GAMMA SLOTS', width - 310, 25);
        
        let barW = 15;
        let spacing = 20;
        
        // Average across channels for debug
        let avgSlow = new Float32Array(NUM_SLOTS);
        let avgFast = new Float32Array(NUM_SLOTS);
        for(let c=0; c<8; c++) {
            for(let slot=0; slot<NUM_SLOTS; slot++) {
                avgSlow[slot] += s.slow_gamma_slots[c][slot];
                avgFast[slot] += s.fast_gamma_slots[c][slot];
            }
        }
        
        for(let slot=0; slot<NUM_SLOTS; slot++) {
            let x = width - 300 + slot * spacing * 2;
            
            // Slow Gamma (Past)
            let hSlow = Math.abs(avgSlow[slot] / 8) * 50;
            ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
            ctx.fillRect(x, 150 - hSlow, barW, hSlow);
            
            // Fast Gamma (Future)
            let hFast = Math.abs(avgFast[slot] / 8) * 50;
            ctx.fillStyle = 'rgba(255, 0, 255, 0.8)';
            ctx.fillRect(x + barW, 150 - hFast, barW, hFast);
            
            ctx.fillStyle = '#fff';
            ctx.fillText(`S${slot}`, x + 5, 145);
        }
    }

    // 4. Direction Vector (Center)
    if (s.debug.showDirectionVector) {
        let cx = width / 2;
        let cy = height / 2;
        
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 100, 0, Math.PI*2);
        ctx.stroke();
        
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + s.target_vx * 200, cy + s.target_vy * 200);
        ctx.stroke();
        
        ctx.fillStyle = '#ff0';
        ctx.fillText(`VX: ${s.target_vx.toFixed(2)} VY: ${s.target_vy.toFixed(2)}`, cx + 10, cy - 10);
    }

    ctx.restore();
}
