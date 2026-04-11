import { BUF_SIZE, ANGLES, RADIUS, ELECTRODES, THETA_BIN, GAMMA_BIN, NUM_PAIRS, NUM_SLOTS, WM_DECAY, REF_CH, PAIRS, PAIR_MIDS, fft, applyNotchFilters, get_ciPLV, get_band_ciPLV } from './eeg-math';

export class Bot {
    id: number;
    color: string;
    eegBuffer: Float32Array[];
    reArr: Float32Array[];
    imArr: Float32Array[];
    centered: Float32Array[];
    
    slot_re: Float32Array[];
    slot_im: Float32Array[];
    slot_ciplv: Float32Array[];

    lastTargetX: number = 0;
    lastTargetY: number = 0;
    synapticPersistence: number = 0;
    ctrl = { moveX: 0, moveY: 0, torque: 0 };
    
    x: number;
    y: number;
    angle: number = 0;
    
    lastEegProcess: number = 0;
    score: number = 0;

    constructor(id: number, color: string, startX: number, startY: number) {
        this.id = id;
        this.color = color;
        this.x = startX;
        this.y = startY;
        
        this.eegBuffer = Array.from({length: 8}, () => new Float32Array(BUF_SIZE));
        this.reArr = Array.from({length: 8}, () => new Float32Array(BUF_SIZE));
        this.imArr = Array.from({length: 8}, () => new Float32Array(BUF_SIZE));
        this.centered = Array.from({length: 8}, () => new Float32Array(BUF_SIZE));
        
        this.slot_re = Array.from({length: NUM_PAIRS}, () => new Float32Array(NUM_SLOTS));
        this.slot_im = Array.from({length: NUM_PAIRS}, () => new Float32Array(NUM_SLOTS));
        this.slot_ciplv = Array.from({length: NUM_PAIRS}, () => new Float32Array(NUM_SLOTS));
    }

    simulateData() {
        for(let i=0; i<8; i++) {
            this.eegBuffer[i].set(this.eegBuffer[i].subarray(1));
            this.eegBuffer[i][BUF_SIZE-1] = (Math.random()-0.5) * 50; 
            // Random bursts of "intent"
            if(Math.random() < 0.05) {
                this.eegBuffer[i][BUF_SIZE-1] += Math.sin(Date.now()*0.02 + this.id) * 100;
            }
        }
    }

    update(time: number, maze: any) {
        this.simulateData();

        if (time - this.lastEegProcess > 33) {
            this.lastEegProcess = time;
            
            for(let t=0; t<BUF_SIZE; t++) {
                let avg = 0; for(let c=0; c<8; c++) avg += this.eegBuffer[c][t]; avg *= 0.125;
                for(let c=0; c<8; c++) this.centered[c][t] = this.eegBuffer[c][t] - avg;
            }

            for(let c = 0; c < 8; c++) {
                for(let t=0; t<BUF_SIZE; t++) { this.reArr[c][t] = this.centered[c][t]; this.imArr[c][t] = 0; }
                fft(this.reArr[c], this.imArr[c]); applyNotchFilters(this.reArr[c], this.imArr[c]);
            }

            let target_vx = 0, target_vy = 0, target_tq = 0;
            for (let i = 0; i < 8; i++) {
                for(let j = i + 1; j < 8; j++) {
                    let val = get_ciPLV(this.reArr, this.imArr, i, j);
                    let dx = ELECTRODES[j].x - ELECTRODES[i].x, dy = ELECTRODES[j].y - ELECTRODES[i].y;
                    target_vx += val * dx; target_vy += val * dy;
                    target_tq += (val * (ELECTRODES[i].x * dy - ELECTRODES[i].y * dx)) / (RADIUS * 10);
                }
            }
            
            let mag = Math.sqrt(target_vx**2 + target_vy**2);
            let dot = target_vx * this.lastTargetX + target_vy * this.lastTargetY;
            let cosTheta = dot / (mag * Math.sqrt(this.lastTargetX**2 + this.lastTargetY**2) + 1e-6);
            if (mag > 0.05 && cosTheta > 0.8) this.synapticPersistence = Math.min(1, this.synapticPersistence + 0.05);
            else this.synapticPersistence *= 0.95;
            this.lastTargetX = target_vx; this.lastTargetY = target_vy;

            let global_theta = Math.atan2(this.imArr[REF_CH][THETA_BIN], this.reArr[REF_CH][THETA_BIN]);
            let norm_phase = (global_theta + Math.PI) / (2 * Math.PI);
            let current_slot = Math.floor(norm_phase * NUM_SLOTS);
            if (current_slot >= NUM_SLOTS) current_slot = NUM_SLOTS - 1;

            let max_intent = 0;
            let intent_x = 0, intent_y = 0;

            for (let p = 0; p < NUM_PAIRS; p++) {
                let chA = PAIRS[p][0], chB = PAIRS[p][1];
                let gA = Math.atan2(this.imArr[chA][GAMMA_BIN], this.reArr[chA][GAMMA_BIN]);
                let gB = Math.atan2(this.imArr[chB][GAMMA_BIN], this.reArr[chB][GAMMA_BIN]);
                let dGamma = gA - gB; 

                for (let s = 0; s < NUM_SLOTS; s++) {
                    if (s === current_slot) {
                        this.slot_re[p][s] = this.slot_re[p][s] * WM_DECAY + Math.cos(dGamma) * (1 - WM_DECAY);
                        this.slot_im[p][s] = this.slot_im[p][s] * WM_DECAY + Math.sin(dGamma) * (1 - WM_DECAY);
                    } else {
                        this.slot_re[p][s] *= WM_DECAY;
                        this.slot_im[p][s] *= WM_DECAY;
                    }
                    let denom = Math.sqrt(Math.max(0, 1.0 - this.slot_re[p][s]**2));
                    this.slot_ciplv[p][s] = denom < 0.001 ? 0 : Math.abs(this.slot_im[p][s] / denom);
                    
                    if (this.slot_ciplv[p][s] > max_intent) {
                        max_intent = this.slot_ciplv[p][s];
                        intent_x = PAIR_MIDS[p].x;
                        intent_y = PAIR_MIDS[p].y;
                    }
                }
            }

            let skillLevel = 0.05; // Bots have fixed skill level
            let smooth = 0.98 - (skillLevel * 0.1), gain = skillLevel * 1.5, boost = (1.0 + this.synapticPersistence * 4.0);
            this.ctrl.moveX = this.ctrl.moveX * smooth + target_vx * gain * (1 - smooth);
            this.ctrl.moveY = this.ctrl.moveY * smooth + target_vy * gain * (1 - smooth);
            this.ctrl.torque = this.ctrl.torque * smooth + target_tq * gain * 0.5 * (1 - smooth);

            this.angle += this.ctrl.torque * boost * 0.5;
            let forwardSpeed = -this.ctrl.moveY * boost * 0.2;
            let strafeSpeed = this.ctrl.moveX * boost * 0.2;
            
            let rawDx = Math.sin(this.angle) * forwardSpeed + Math.cos(this.angle) * strafeSpeed;
            let rawDy = -Math.cos(this.angle) * forwardSpeed + Math.sin(this.angle) * strafeSpeed;
            
            let speed = Math.sqrt(rawDx**2 + rawDy**2);
            if (speed > 0.15) { rawDx = (rawDx/speed)*0.15; rawDy = (rawDy/speed)*0.15; }
            
            const hit = (tx: number, ty: number) => {
                let gx = Math.floor(tx), gy = Math.floor(ty);
                if(gy<0||gy>=maze.dim||gx<0||gx>=maze.dim) return true;
                return maze.grid[gy][gx] === 1;
            };

            if(!hit(this.x + rawDx + Math.sign(rawDx)*0.2, this.y)) this.x += rawDx; 
            if(!hit(this.x, this.y + rawDy + Math.sign(rawDy)*0.2)) this.y += rawDy; 

            // Bot interaction with chests and orbs
            for (let chest of maze.chests) {
                if (chest.state === 'looted') continue;
                let dx = chest.x - this.x;
                let dy = chest.y - this.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < 0.5) {
                    chest.state = 'looted';
                    if (!chest.isMimic) this.score += 500;
                    else this.score -= 500;
                } else if (dist < 3.0 && chest.state === 'closed') {
                    // Bots randomly focus on chests
                    if (max_intent > 0.3) {
                        chest.scanProgress += (max_intent - 0.3) * 0.05;
                        if (chest.scanProgress >= 1.0) chest.state = 'revealed';
                    }
                }
            }

            for (let orb of maze.orbs) {
                if (orb.collected) continue;
                let dx = orb.x - this.x;
                let dy = orb.y - this.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < 0.5) {
                    orb.collected = true;
                    this.score += 100;
                } else if (dist < 4.0 && max_intent > 0.3) {
                    // Bots pull orbs
                    let pullForce = (max_intent - 0.3) * 0.15;
                    orb.x -= (dx / dist) * pullForce;
                    orb.y -= (dy / dist) * pullForce;
                }
            }
        }
    }
}
