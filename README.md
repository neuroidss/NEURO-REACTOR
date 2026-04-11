# NEURO-REACTOR

**Live Demo:** 
- [https://dmitry-sukhoruchkin.github.io/NEURO-REACTOR/](https://dmitry-sukhoruchkin.github.io/NEURO-REACTOR/)
- [https://neuroidss.github.io/NEURO-REACTOR/](https://neuroidss.github.io/NEURO-REACTOR/)

Neuro-Reactor is a real-time, zero-lag Brain-Computer Interface (BCI) game designed for ultra-high-density local EEG modules (micro-arrays). It decodes proactive, continuous brain states using pure phase coherence and real-time audio-visual biofeedback.

Unlike traditional P300 spellers that rely on reactive evoked potentials, Neuro-Reactor decodes **proactive, continuous brain states** using advanced signal processing and real-time audio-visual biofeedback.

## Core Mechanics & Science

### 1. Zero-Lag Realtime & Pure Phase Coherence (ciPLV)
The system operates with **zero algorithmic latency**. There are no moving averages (EMA), no buffering, and no artificial baselines. 
- All calculations are based on **Complex Imaginary Phase-Locking Value (ciPLV)**.
- We measure the *directed flow* of phase synchronization between all 28 pairs of electrodes.
- Because there are no artificial baselines, the system exposes raw hardware and biological asymmetries. The brain must learn to find its own "zero" (auto-baseline) and compensate for these constant vector shifts through neuroplasticity and operant conditioning.

### 2. Movement (Motor Intent via Beta/Lower Gamma ciPLV, 18-36 Hz)
Avatar movement is controlled by analyzing the **symmetry breaking and directed phase coherence** in the Beta and Lower Gamma bands (18-36 Hz) across the hemispheres. 
- The brain learns to navigate (forward, backward, turn) by modulating these symmetries. 
- This acts as a "virtual gamepad" that the brain adapts to.

### 3. Telekinesis & Interaction (Working Memory & Attention via Theta-Gamma PAC)
Interaction with objects (pulling energy orbs, unlocking chests) is driven by **Theta-Gamma Phase-Amplitude Coupling (PAC)** combined with ciPLV. This represents the structure of working memory and spatial attention.

We decode the temporal structure of the EEG signal relative to the Theta peak (The "Present"):
- **The Present (Theta, ~6Hz):** Acts as the internal clock and phase reference.
- **The Past (Slow Gamma, 31-51Hz):** Appears on the descending phase of Theta. Represents memory retrieval and context.
- **The Future (Fast Gamma, 61-102Hz):** Appears on the ascending phase of Theta. Represents sensory prediction and spatial intent.

### 4. Structural Analytics: The 8-Channel Radar
Instead of reducing the complex 8-channel EEG data to a single "focus" number, the system visualizes the **spatial distribution and directed flow** of working memory:
- **Cyan Polygon (Past):** Shows the flow of Slow Gamma synchronization. Where the brain is pulling context from.
- **Magenta Polygon (Future):** Shows the flow of Fast Gamma synchronization. Where the brain is directing its intent.
- **Population Vector (Direction):** By mapping the 8 electrodes to physical angles, we calculate a 2D vector representing the exact direction of spatial attention (the "Radar Beam").
- **Sharpness (Focus Quality):** We measure the variance/entropy of the Fast Gamma across the 8 channels. 
  - *Diffuse Attention:* All channels show equal phase flow. The radar is a wide, weak circle.
  - *Sharp Attention:* 1 or 2 channels spike significantly higher than the rest. The radar becomes a sharp, highly directional beam capable of locking onto specific objects.

## Audio Biofeedback (The Brain's Mirror)
To help the brain recognize its own states, the app features real-time sonification:
- A base frequency pulses at the Theta rate (6Hz).
- The volume and harmonic richness increase as the Theta-Gamma PAC strengthens.
- When the Population Vector successfully locks onto an interactable object, the frequency shifts to a resonant 432Hz, providing instant reward and confirmation to the neural networks.

## Movement Modes (Scientific Basis)
Neuro-Reactor supports 4 distinct mathematical modes for decoding motor intent from the micro-array. You can toggle these in the UI (👁️ button):

1. **CRYSTAL (DEFAULT)** - *Legacy Mode*
   - The exact logic from the original `neuro_dungeon_gamepad_emulator_crystal`.
   - **Mechanism:** Uses **signed** ciPLV values for movement vectors (sensitive to local dipoles/anatomy) but absolute values for electrode pressure. Highly responsive to the direction of the cortical traveling wave.

2. **TRUE ABSOLUTE**
   - Uses the absolute magnitude of ciPLV for both vectors and pressure.
   - **Mechanism:** Measures the raw energy of local phase synchronization. Ignores the direction of the cortical traveling wave. Highly robust against micro-shifts in electrode placement, but may feel less directional than CRYSTAL.
   - **DOI:** 10.1126/science.1107027 (Schoffelen et al., 2005)

3. **HYBRID (ENERGY + SPIRALS)**
   - Uses absolute ciPLV for forward/backward movement (Energy), but signed ciPLV for rotation (Torque).
   - **Mechanism:** Decodes Phase Singularities (cortical spirals). The brain learns to "spin" the local phase field to turn the avatar.
   - **DOI:** 10.1038/nrn.2018.20 (Muller et al., 2018 - Cortical traveling waves and spirals)

4. **WAVE (TOP-DOWN / BOTTOM-UP)**
   - Uses absolute ciPLV for movement magnitude, but calculates a "Global Flow" direction from the sum of all signs to act as a forward/reverse gearbox.
   - **Mechanism:** Decodes the macroscopic routing of information. Top-down waves (expectations/intent) drive forward, bottom-up waves drive backward.
   - **DOI:** 10.1371/journal.pbio.3000487 (Alamia & VanRullen, 2019)

## Working Memory Modes (Scientific Basis)
Neuro-Reactor supports 3 mathematical modes for decoding spatial attention and working memory from the micro-array. You can toggle these in the UI (🧠 button):

1. **PAC PAIRS (CRYSTAL)** - *Default*
   - Calculates Phase-Amplitude Coupling (PAC) between a global Theta phase and Gamma amplitude across all 28 possible electrode pairs.
   - **Mechanism:** The theta-gamma neural code. The brain multiplexes spatial targets into discrete theta phase slots.
   - **DOI:** 10.1016/j.neuron.2013.03.007 (Lisman & Jensen, 2013)

2. **PAC FLOW (ASYMMETRY)**
   - Analyzes the asymmetry of information flow. Slow Gamma (31-51Hz) on the descending Theta phase (Past), Fast Gamma (61-102Hz) on the ascending phase (Future).
   - **Mechanism:** Routing of information via theta-gamma coupling. The brain predicts the future target using fast gamma bursts.
   - **DOI:** 10.1038/s41467-019-13638-1 (Bastos et al., 2020)

3. **AAC ENVELOPE**
   - Uses Amplitude-Amplitude Coupling (AAC) between Theta and Gamma envelopes.
   - **Mechanism:** A simpler correlation metric where the overall power of Gamma fluctuates with the power of Theta, indicating general cognitive load and attention.
   - **DOI:** 10.1073/pnas.1006728107 (Shirvalkar et al., 2010)

## Synaptic Persistence (Hebbian Learning)
The game features a "Synaptic Stability" meter. Holding a consistent vector triggers simulated Spike-Timing-Dependent Plasticity (STDP), giving the avatar a speed boost.
- **DOI:** 10.1523/JNEUROSCI.18-24-10464.1998 (Bi & Poo, 1998 - Synaptic plasticity)

## How to Test
1. Click **CONNECT BLE** to pair your 8-channel ultra-high-density local EEG module (FreeEEG8-alpha micro-array).
2. Use motor intent (Beta/Lower Gamma symmetry, 18-36 Hz) to navigate the maze.
3. To interact with Orbs or Chests, direct your spatial attention towards them. You will see your "Attention Radar" (magenta polygon) stretch in the direction of your focus.
4. Achieve high "Sharpness" to lock on and trigger the telekinesis/unlock mechanics.

### Electrode Placement Recommendations (FreeEEG8-alpha)
The FreeEEG8-alpha is an ultra-high-density micro-array. Its placement significantly affects the decoding of different modes:

- **Pz (Parietal Midline):** *Highly Recommended.* Excellent for spatial attention, working memory (Theta-Gamma PAC), and general motor intent. Provides a balanced signal for most modes.
- **Cz (Central Midline):** Good for strong motor intent (Beta/Lower Gamma) and the `ABSOLUTE` movement mode. May be less sensitive to spatial working memory tasks compared to Pz.
- **Oz (Occipital Midline):** Primarily captures visual processing. Useful if you are experimenting with visual evoked potentials or visual attention, but less optimal for pure motor control.
- **Orientation:** The orientation of the array (e.g., USB cable pointing UP vs. DOWN) will invert the Y-axis of the decoded dipoles. Use the `USB CABLE: TOP/BOTTOM` toggle in the UI to correct this without physically rotating the device.

## Scientific References & DOIs
The algorithms and frequency bands used in Neuro-Reactor are grounded in neurophysiological research:

1. **Motor Intent & Coherence (18-36 Hz):** 
   Continuous motor control and corticomuscular interaction are strongly mediated by coherence in the High Beta and Lower Gamma bands, rather than just classical Mu-rhythm desynchronization.
   - *Schoffelen, J. M., Oostenveld, R., & Fries, P. (2005). Neuronal coherence as a mechanism of effective corticospinal interaction. Science.* **DOI: 10.1126/science.1107027**
   - *Pfurtscheller, G., & Lopes da Silva, F. H. (1999). Event-related EEG/MEG synchronization and desynchronization: basic principles. Clinical neurophysiology.* **DOI: 10.1016/s1388-2457(99)00141-8**

2. **Working Memory & Spatial Attention (Theta-Gamma PAC):** 
   The coupling between Theta phase (~6 Hz) and Gamma amplitude (Slow: 31-51 Hz, Fast: 61-102 Hz) is the fundamental neural code for ordering items in working memory and spatial navigation.
   - *Lisman, J. E., & Jensen, O. (2013). The theta-gamma neural code. Neuron.* **DOI: 10.1016/j.neuron.2013.03.007**
   - *Canolty, R. T., & Knight, R. T. (2010). The functional role of cross-frequency coupling. Trends in cognitive sciences.* **DOI: 10.1016/j.tics.2010.09.001**
