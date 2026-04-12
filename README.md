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
Neuro-Reactor supports 3 distinct mathematical modes for decoding motor intent from the micro-array. You can toggle these in the UI (👁️ button):

1. **CRYSTAL (DEFAULT)** - *Legacy Mode*
   - The exact logic from the original `neuro_dungeon_gamepad_emulator_crystal`.
   - **Mechanism:** Uses **signed** ciPLV values for movement vectors (sensitive to local dipoles/anatomy) but absolute values for electrode pressure. Highly responsive to the direction of the cortical traveling wave.

2. **POINTER (MOUSE)**
   - Calculates the spatial Center of Mass (CoM) of the absolute coherence network (electrode pressure).
   - **Mechanism:** Maps the physical distribution of brain synchronization directly to a 2D coordinate on the screen. Acts as an absolute pointing device (like a mouse) rather than a velocity joystick. The avatar will attempt to walk towards the targeted point.

3. **WAVE (TOP-DOWN / BOTTOM-UP)**
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

## Camera & View Modes
Neuro-Reactor supports multiple camera perspectives to suit different experimental setups and multiplayer scenarios:

1. **FIRST PERSON:** The camera is attached to the player. The world (maze/track) rotates around the player, who always faces "up" on the screen. Best for immersive single-player navigation.
2. **WORLD (ROTATE):** The world is fixed in place. The player's avatar rotates and moves relative to its own rotation. Useful for observing the avatar's orientation in a fixed environment.
3. **WORLD (FIXED UP):** The world is fixed, and the player's avatar is locked to always face "up". Movement is translated directly to screen coordinates (True Absolute mode is forced). Ideal for multi-user arenas and cursor-control tasks.

## Multiplayer & Multi-Hemisphere Support
You can add multiple users to the arena simultaneously. This is particularly useful for:
- **Multi-Hemisphere Control:** Connect two separate FreeEEG8-alpha modules (one to each hemisphere) and control two independent avatars simultaneously to study inter-hemispheric cooperation.
- **Competitive/Cooperative BCI:** Connect multiple users via BLE to the same arena.
- Use the **+ ADD USER (BLE)** button to connect a new hardware node, or **+ ADD USER (SIM)** to add a simulated node for testing.

## Educational Demo Modes (Benchmarks)
Neuro-Reactor includes several simplified modes designed for education, demonstrations, and specific cognitive benchmarking:

- **BrainCursor (★☆☆☆☆):** A simple 2D cursor control task. The user must navigate a cursor to a target on a blank screen. Benchmarks pure directional intent and efficiency (ideal path vs. actual path).
- **BrainMaze (★★☆☆☆):** The standard extraction-looter maze. Benchmarks sustained goal-directed navigation and spatial memory.
- **BrainDrone (★★☆☆☆):** A 3D-style drone flight simulation. The user must steer left/right and control altitude (via focus/working memory) to fly through rings.
- **BrainCar (★★☆☆☆):** An endless runner. The car moves forward automatically; the user must steer left/right to dodge obstacles.

## Neuro ADC Test Bench
Included in the `public/testbench.html` is a dedicated tool for hardware validation and scientific calibration (e.g., for MSU Biofac).
- **Hardware Noise Validation:** Run the "NOISE (Shorted)" test to verify the baseline RMS noise of the ADC (should be < 2µV).
- **DC Signal Test:** Verify the internal test signal and scaling.
- **PGA & SPS Control:** Dynamically adjust the Programmable Gain Amplifier (PGA) and Samples Per Second (SPS) to optimize signal quality or prevent saturation.
- **Register Verification:** The test bench reads back SPI registers after writing to ensure the hardware state matches the software configuration.
- **Real-time Scope & FFT:** Visualize the raw waveforms and frequency spectrum directly from the hardware.

## Debug Overlays & Neurofeedback
The UI includes toggles for advanced debug overlays, separating scientific analysis from pure neurofeedback:

- **Raw Signals:** Displays the raw EEG waveforms for all 8 channels.
- **ciPLV Connectivity:** Visualizes the raw Phase-Locking Value network between all electrode pairs.
- **PAC Histogram:** Shows the distribution of Slow and Fast Gamma across Theta phase slots.
- **Direction Vector:** Displays the raw calculated movement vector before smoothing.
*Note: Debug overlays are intended for scientific validation and setup. For active neurofeedback training, rely on the in-game audio and the Theta-Gamma "Mandala" rendered directly around the player's avatar.*

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
