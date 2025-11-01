// Vector-based quantum rhythm generator
// Maps operations to 3D sphere points and applies quantum transformations

/* ------------------ static vocab ------------------- */
export const RHYTHM_VOCAB = [
  'half','double','move','reverse','reset',
  'stutter','phase','fractal','silence'
];

// Simple seedrandom implementation
function seedrandom(seed) {
  let m = 0x80000000; // 2**31
  let a = 1103515245;
  let c = 12345;
  let state = seed ? seed : Math.floor(Math.random() * (m - 1));
  
  return function() {
    state = (a * state + c) % m;
    return state / (m - 1);
  };
}

const rng = seedrandom(Date.now().toString());

/* spread ops quasi-evenly on the sphere */
export const vectorMap = {};
RHYTHM_VOCAB.forEach(word => {
  const θ = rng() * Math.PI * 2;
  const φ = rng() * Math.PI;
  vectorMap[word] = [
    Math.sin(φ) * Math.cos(θ),
    Math.sin(φ) * Math.sin(θ),
    Math.cos(φ)
  ];
});

/* -------- helpers -------- */
const unit = v => {
  const l = Math.hypot(...v) || 1;
  return v.map(x => x / l);
};

const nearestWord = vec => {
  let best = 'silence', bestD = 1e9;
  for (const [w, v] of Object.entries(vectorMap)) {
    const d = Math.hypot(vec[0]-v[0], vec[1]-v[1], vec[2]-v[2]);
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
};

/* -------- public API -------- */
export function transformRhythm(seq, shift = 0.25) {
  const shifted = seq.map(op => {
    const v = vectorMap[op] || [0,0,0];
    return unit([ v[0]+shift, v[1]+shift, v[2]+shift ]);
  });
  return shifted.map(nearestWord);
}

export function quantumRhythm(baseSeq, iterations = 3) {
  let cur = [...baseSeq]; // clone, never mutate caller
  for (let i = 0; i < iterations; i++) {
    const p1 = transformRhythm(cur);
    const p2 = transformRhythm([...cur].reverse()); // safe reverse copy

    cur = p1.map((op, ix) => rng() > 0.7 ? p2[ix] : op);

    if (!(i & 1)) {                 // rotate every other pass (entanglement)
      cur = [...cur.slice(-3), ...cur.slice(0, -3)];
    }
  }
  return cur;
}