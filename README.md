# NEURO-REACTOR

**Live Demo:** 
- [https://dmitry-sukhoruchkin.github.io/NEURO-REACTOR/](https://dmitry-sukhoruchkin.github.io/NEURO-REACTOR/)
- [https://neuroidss.github.io/NEURO-REACTOR/](https://neuroidss.github.io/NEURO-REACTOR/)

Neuro-Reactor is a real-time Brain-Computer Interface (BCI) simulation and game designed to test and decode spatial attention, motor intent, and cognitive states using raw EEG data (8 channels).

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

## How to Test
1. Click **CONNECT BLE** to pair your 8-channel EEG headset.
2. Use motor intent (Beta/Lower Gamma symmetry, 18-36 Hz) to navigate the maze.
3. To interact with Orbs or Chests, direct your spatial attention towards them. You will see your "Attention Radar" (magenta polygon) stretch in the direction of your focus.
4. Achieve high "Sharpness" to lock on and trigger the telekinesis/unlock mechanics.

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
