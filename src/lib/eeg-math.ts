export const BUF_SIZE = 256;
export const ANGLES = [-72, -36, 36, 72, 108, 144, -144, -108].map(d => d * Math.PI / 180);
export const RADIUS = 1.0;
export const ELECTRODES = ANGLES.map(a => ({ x: Math.cos(a) * RADIUS, y: Math.sin(a) * RADIUS }));
export const UV_SCALE = (1.2 / 4.0 / 8388607.0) * 1e6;

export const THETA_BIN = 6; // ~6Hz
export const NUM_SLOTS = 8; // 8 фазовых слотов для теты

export function fft(re: Float32Array, im: Float32Array) {
  let n = re.length;
  for (let i = 0; i < n; i++) {
    let j = 0;
    for (let k = 0, p = i; k < 8; k++, p >>= 1) j = (j << 1) | (p & 1);
    if (j > i) {
      let tRe = re[i], tIm = im[i];
      re[i] = re[j]; im[i] = im[j];
      re[j] = tRe; im[j] = tIm;
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    let half = size / 2;
    let wRe = Math.cos(-2 * Math.PI / size), wIm = Math.sin(-2 * Math.PI / size);
    for (let i = 0; i < n; i += size) {
      let currRe = 1, currIm = 0;
      for (let j = 0; j < half; j++) {
        let uRe = re[i + j], uIm = im[i + j];
        let vRe = re[i + j + half] * currRe - im[i + j + half] * currIm;
        let vIm = re[i + j + half] * currIm + im[i + j + half] * currRe;
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe; im[i + j + half] = uIm - vIm;
        let nextRe = currRe * wRe - currIm * wIm;
        currIm = currRe * wIm + currIm * wRe;
        currRe = nextRe;
      }
    }
  }
}

export function applyNotchFilters(re: Float32Array, im: Float32Array) {
  for (let k of [51, 102]) {
    for (let i = -1; i <= 1; i++) {
      if (re[k + i] !== undefined) re[k + i] = im[k + i] = 0;
    }
  }
}

/**
 * Calculates Complex Imaginary Phase-Locking Value (ciPLV) for a specific frequency band.
 * Used for Motor Intent decoding (Beta/Lower Gamma 18-36 Hz).
 * 
 * Scientific Basis: Neuronal coherence as a mechanism of effective corticospinal interaction.
 * DOI: 10.1126/science.1107027
 */
export function get_ciPLV(reArr: Float32Array[], imArr: Float32Array[], i: number, j: number) {
  return get_band_ciPLV(reArr, imArr, i, j, 18, 36);
}

export function get_band_ciPLV(reArr: Float32Array[], imArr: Float32Array[], i: number, j: number, k_start: number, k_end: number) {
  let sumRe = 0, sumIm = 0;
  let count = k_end - k_start + 1;
  for (let k = k_start; k <= k_end; k++) {
    let magI = Math.sqrt(reArr[i][k] ** 2 + imArr[i][k] ** 2) || 1e-6;
    let magJ = Math.sqrt(reArr[j][k] ** 2 + imArr[j][k] ** 2) || 1e-6;
    let pI_re = reArr[i][k] / magI, pI_im = imArr[i][k] / magI;
    let pJ_re = reArr[j][k] / magJ, pJ_im = imArr[j][k] / magJ;
    sumRe += pI_re * pJ_re + pI_im * pJ_im;
    sumIm += pI_im * pJ_re - pI_re * pJ_im;
  }
  return sumIm / count; 
}
