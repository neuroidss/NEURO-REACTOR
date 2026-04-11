import { BUF_SIZE, ANGLES, RADIUS, ELECTRODES, THETA_BIN, GAMMA_BIN, NUM_PAIRS, NUM_SLOTS, WM_DECAY, REF_CH, PAIRS, PAIR_MIDS, fft, applyNotchFilters, get_ciPLV, get_band_ciPLV } from './eeg-math';

export function processEEGData(s: any, time: number, takeDamage: () => void) {
    if (time - s.lastEegProcess <= 33) return;
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

    // 1. АВТОПИЛОТ (БЕТА/НИЖНЯЯ ГАММА)
    s.target_vx = 0; s.target_vy = 0; s.target_tq = 0; s.electrodePressure.fill(0);
    let global_flow = 0;

    for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
            let raw_val = get_ciPLV(s.reArr, s.imArr, i, j);
            let move_val = raw_val;
            let tq_val = raw_val;

            if (s.moveMode === 'crystal') {
                // The exact logic from neuro_dungeon_gamepad_emulator_crystal
                move_val = raw_val;
                tq_val = raw_val;
            } else if (s.moveMode === 'absolute') {
                move_val = Math.abs(raw_val);
                tq_val = raw_val; // Rotation must be signed to be controllable
            } else if (s.moveMode === 'hybrid') {
                move_val = Math.abs(raw_val);
                tq_val = raw_val;
            } else if (s.moveMode === 'traveling_wave') {
                move_val = Math.abs(raw_val);
                tq_val = raw_val; // Fix rotation to be signed and controllable
                global_flow += raw_val;
            }

            let dx = ELECTRODES[j].x - ELECTRODES[i].x, dy = ELECTRODES[j].y - ELECTRODES[i].y;
            s.target_vx += move_val * dx; s.target_vy += move_val * dy;
            s.target_tq += (tq_val * (ELECTRODES[i].x * dy - ELECTRODES[i].y * dx)) / (RADIUS * 10);
            s.electrodePressure[i] += Math.abs(raw_val); s.electrodePressure[j] += Math.abs(raw_val);
        }
    }

    if (s.moveMode === 'traveling_wave') {
        let flow_dir = global_flow >= 0 ? 1 : -1;
        s.target_vx *= flow_dir;
        s.target_vy *= flow_dir;
    }

    let mag = Math.sqrt(s.target_vx ** 2 + s.target_vy ** 2);
    let dot = s.target_vx * s.lastTargetX + s.target_vy * s.lastTargetY;
    let cosTheta = dot / (mag * Math.sqrt(s.lastTargetX ** 2 + s.lastTargetY ** 2) + 1e-6);
    if (mag > 0.05 && cosTheta > 0.8) s.synapticPersistence = Math.min(1, s.synapticPersistence + 0.05);
    else s.synapticPersistence *= 0.95;
    s.lastTargetX = s.target_vx; s.lastTargetY = s.target_vy;
    if (s.reactor) s.reactor.update(s.target_vx, s.target_vy, s.target_tq, s.synapticPersistence, s.electrodePressure);

    // 2. РАБОЧАЯ ПАМЯТЬ И НАМЕРЕНИЕ (ТЕТА-ГАММА)
    let global_intent = 0;
    let fast_vec_x = 0, fast_vec_y = 0;
    let current_sharpness = 0;

    if (s.wmMode === 'pac_pairs' || s.wmMode === 'dash') {
      // Scientific Basis: The theta-gamma neural code (Lisman & Jensen, 2013)
      // DOI: 10.1016/j.neuron.2013.03.007
      let global_theta_phase = Math.atan2(s.imArr[REF_CH][THETA_BIN], s.reArr[REF_CH][THETA_BIN]);
      let normalized_phase = (global_theta_phase + Math.PI) / (2 * Math.PI);
      let current_slot = Math.floor(normalized_phase * NUM_SLOTS);
      if (current_slot >= NUM_SLOTS) current_slot = NUM_SLOTS - 1;

      let max_val = 0;
      let sum_val = 0;
      let best_p = 0;

      for (let p = 0; p < NUM_PAIRS; p++) {
          let chA = PAIRS[p][0];
          let chB = PAIRS[p][1];

          let gA = Math.atan2(s.imArr[chA][GAMMA_BIN], s.reArr[chA][GAMMA_BIN]);
          let gB = Math.atan2(s.imArr[chB][GAMMA_BIN], s.reArr[chB][GAMMA_BIN]);
          let dGamma = gA - gB; 

          for (let slot = 0; slot < NUM_SLOTS; slot++) {
              if (slot === current_slot) {
                  s.slot_re[p][slot] = s.slot_re[p][slot] * WM_DECAY + Math.cos(dGamma) * (1 - WM_DECAY);
                  s.slot_im[p][slot] = s.slot_im[p][slot] * WM_DECAY + Math.sin(dGamma) * (1 - WM_DECAY);
              } else {
                  s.slot_re[p][slot] *= WM_DECAY;
                  s.slot_im[p][slot] *= WM_DECAY;
              }

              let mRe = s.slot_re[p][slot];
              let mIm = s.slot_im[p][slot];
              let denom = Math.sqrt(Math.max(0, 1.0 - mRe * mRe));
              s.slot_ciplv[p][slot] = denom < 0.001 ? 0 : Math.abs(mIm / denom);
              
              if (s.slot_ciplv[p][slot] > max_val) {
                  max_val = s.slot_ciplv[p][slot];
                  best_p = p;
              }
              sum_val += s.slot_ciplv[p][slot];
          }
      }
      
      global_intent = max_val;
      fast_vec_x = PAIR_MIDS[best_p].x;
      fast_vec_y = PAIR_MIDS[best_p].y;
      let mean_val = sum_val / (NUM_PAIRS * NUM_SLOTS);
      current_sharpness = mean_val > 0 ? ((max_val / mean_val) - 1) / 7 : 0;
      
    } else if (s.wmMode === 'pac_flow') {
      // Scientific Basis: Routing of information via theta-gamma coupling (Bastos et al., 2020)
      // DOI: 10.1038/s41467-019-13638-1
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

        s.slow_gamma_slots[c][slot] = s.slow_gamma_slots[c][slot] * 0.9 + slow_flow * 0.1;
        s.fast_gamma_slots[c][slot] = s.fast_gamma_slots[c][slot] * 0.9 + fast_flow * 0.1;

        // Оценка асимметрии: Медленная гамма в прошлом (слоты 1,2,3), Быстрая в будущем (слоты 4,5,6)
        let past_slow = s.slow_gamma_slots[c][1] + s.slow_gamma_slots[c][2] + s.slow_gamma_slots[c][3];
        let future_fast = s.fast_gamma_slots[c][4] + s.fast_gamma_slots[c][5] + s.fast_gamma_slots[c][6];

        let validity = Math.abs(past_slow) + Math.abs(future_fast);
        global_intent += validity;

        if (future_fast > max_fast_future) {
          max_fast_future = future_fast;
        }
        sum_fast_future += future_fast;

        fast_vec_x += Math.cos(ANGLES[c]) * future_fast;
        fast_vec_y += Math.sin(ANGLES[c]) * future_fast;
      }
      global_intent /= 8;
      let mean_fast_future = sum_fast_future / 8;
      current_sharpness = mean_fast_future > 0 ? ((max_fast_future / mean_fast_future) - 1) / 7 : 0; 
    } else if (s.wmMode === 'aac_envelope') {
      // Scientific Basis: Amplitude-Amplitude Coupling (AAC)
      // DOI: 10.1073/pnas.1006728107 (Shirvalkar et al., 2010)
      let max_val = 0;
      let sum_val = 0;
      let best_c = 0;
      for (let c = 0; c < 8; c++) {
          let thetaAmp = Math.sqrt(s.reArr[c][THETA_BIN]**2 + s.imArr[c][THETA_BIN]**2);
          let gammaAmp = Math.sqrt(s.reArr[c][GAMMA_BIN]**2 + s.imArr[c][GAMMA_BIN]**2);
          // Simple correlation proxy: product of normalized envelopes
          // Normalized to prevent screaming and keep it within 0.0 - 2.0 range
          let aac = Math.min(2.0, (thetaAmp * gammaAmp) / 50000.0); 
          if (aac > max_val) {
              max_val = aac;
              best_c = c;
          }
          sum_val += aac;
      }
      global_intent = max_val;
      fast_vec_x = ELECTRODES[best_c].x;
      fast_vec_y = ELECTRODES[best_c].y;
      let mean_val = sum_val / 8;
      current_sharpness = mean_val > 0 ? ((max_val / mean_val) - 1) / 7 : 0;
    }

    // БЕЗ СГЛАЖИВАНИЯ (MAX REALTIME)
    s.sharpness = current_sharpness;
    s.smooth_focus = global_intent;
    s.intent_angle = Math.atan2(fast_vec_y, fast_vec_x);

    // 3. МЕХАНИКА ИГРЫ: РЫВОК (DASH)
    if (s.wmMode === 'dash' && global_intent > s.dashThr && s.dashCooldown <= 0) {
        s.dashCooldown = 60; // Перезарядка ~2 секунды
    }
    // 4. ЛОГИКА ВЗЛОМА СУНДУКОВ
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

    // 5. ЛОГИКА ТЕЛЕКИНЕЗА (СБОР СФЕР)
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

export function updatePhysics(s: any, invertDevice: boolean) {
    let out_vx = invertDevice ? -s.target_vx : s.target_vx;
    let out_vy = invertDevice ? -s.target_vy : s.target_vy;

    let smooth = 0.98 - (s.skillLevel * 0.1), gain = s.skillLevel * 1.5;
    
    let activeBoost = (1.0 + s.synapticPersistence * 4.0);
    if (s.wmMode === 'dash' && s.dashCooldown > 45) {
        activeBoost *= 5.0;
    }
    if (s.dashCooldown > 0) s.dashCooldown--;

    s.ctrl.moveX = s.ctrl.moveX * smooth + out_vx * gain * (1 - smooth);
    s.ctrl.moveY = s.ctrl.moveY * smooth + out_vy * gain * (1 - smooth);
    s.ctrl.torque = s.ctrl.torque * smooth + s.target_tq * gain * 0.5 * (1 - smooth);

    if (s.ws && s.ws.readyState === WebSocket.OPEN) {
        s.ws.send(JSON.stringify({ 
            mx: (s.ctrl.moveX * activeBoost) / 10.0, 
            my: (-s.ctrl.moveY * activeBoost) / 10.0, 
            tq: (s.ctrl.torque * activeBoost) / 10.0,
            atk: s.dashCooldown > 45,
            int: s.smooth_focus > s.holoThr
        }));
    }

    s.player.angle += s.ctrl.torque * activeBoost * 0.5;
    
    let forwardSpeed = -s.ctrl.moveY * activeBoost * 0.2;
    let strafeSpeed = s.ctrl.moveX * activeBoost * 0.2;
    
    let rawDx = Math.sin(s.player.angle) * forwardSpeed + Math.cos(s.player.angle) * strafeSpeed;
    let rawDy = -Math.cos(s.player.angle) * forwardSpeed + Math.sin(s.player.angle) * strafeSpeed;
    
    s.effortDist += Math.sqrt(rawDx*rawDx + rawDy*rawDy);
    
    const MAX_SPEED = 0.15 * (s.dashCooldown > 45 ? 5.0 : 1.0);
    let intendedMove = Math.sqrt(rawDx*rawDx + rawDy*rawDy);
    let targetDx = rawDx, targetDy = rawDy;
    if (intendedMove > MAX_SPEED) {
        targetDx = (rawDx / intendedMove) * MAX_SPEED;
        targetDy = (rawDy / intendedMove) * MAX_SPEED;
    }

    const hit = (tx: number, ty: number) => {
        let gx = Math.floor(tx), gy = Math.floor(ty);
        if(gy<0||gy>=s.maze.dim||gx<0||gx>=s.maze.dim) return true;
        return s.maze.grid[gy][gx] === 1;
    };
    
    let steps = Math.ceil(Math.max(Math.abs(targetDx), Math.abs(targetDy)) / 0.05);
    if (steps < 1) steps = 1;
    
    let sdx = targetDx / steps;
    let sdy = targetDy / steps;

    for(let i=0; i<steps; i++) {
        if(!hit(s.player.x + sdx + Math.sign(sdx)*0.2, s.player.y)) s.player.x += sdx; 
        if(!hit(s.player.x, s.player.y + sdy + Math.sign(sdy)*0.2)) s.player.y += sdy; 
    }
}
