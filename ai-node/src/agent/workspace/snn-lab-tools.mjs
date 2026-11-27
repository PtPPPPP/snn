import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { initialState, policyThrottle, step } from "../../../../lib/rocket/physics.mjs";

const ENERGY_POLICY_PATH = fileURLToPath(new URL("../../../../public/rocket/energy.json", import.meta.url));
let cachedEnergyPolicy = null;

async function loadEnergyPolicy() {
  if (cachedEnergyPolicy) return cachedEnergyPolicy;
  const text = await readFile(ENERGY_POLICY_PATH, "utf8");
  cachedEnergyPolicy = JSON.parse(text);
  return cachedEnergyPolicy;
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

/**
 * Run a deterministic SNN rocket landing simulation using the real physics engine.
 */
export async function runRocketSimulation(args = {}) {
  const initialHeight = clamp(args.initial_height, 10, 120, 50);
  const initialFuel = clamp(args.initial_fuel, 0.5, 10, 5);
  const strategy =
    args.strategy === "energy_brake" || args.strategy === "constant_throttle"
      ? args.strategy
      : "energy_ppo";
  const constantThrottle = clamp(args.constant_throttle, 0, 1, 0.45);

  const policy = strategy === "energy_ppo" ? await loadEnergyPolicy() : null;
  let state = { ...initialState(initialHeight), fuel: initialFuel };
  let throttle = 0;
  let steps = 0;
  let firstBurnHeight = null;
  let maxThrust = 0;
  const keyframes = [];

  const recordFrame = () => {
    keyframes.push({
      t: Number(state.t.toFixed(2)),
      h: Number(state.h.toFixed(2)),
      v: Number(state.v.toFixed(2)),
      fuel: Number(state.fuel.toFixed(3)),
      thrust: Number(state.thrust.toFixed(1)),
      throttle: Number(throttle.toFixed(3)),
    });
  };

  recordFrame();

  while (!state.result && steps < 4000) {
    if (steps % 5 === 0) {
      if (strategy === "energy_ppo" && policy) {
        throttle = policyThrottle(state, policy);
      } else if (strategy === "energy_brake") {
        const mass = 10 + state.fuel;
        const maxDecel = Math.max(0.1, 300 / mass - 9.81);
        const stoppingDist = state.v < 0 ? (state.v * state.v) / (2 * maxDecel) : 0;
        const hover = (mass * 9.81) / 300;
        if (state.v < -1.5 && state.h <= stoppingDist * 1.18 + 2.2) {
          throttle = Math.min(1, hover + Math.min(0.65, (-state.v - 1.2) * 0.14));
        } else if (state.h < 4 && state.v < -0.8) {
          throttle = hover;
        } else {
          throttle = 0;
        }
      } else {
        throttle = constantThrottle;
      }
    }

    if (firstBurnHeight === null && throttle * 300 > 15) {
      firstBurnHeight = Number(state.h.toFixed(2));
    }
    state = step(state, throttle);
    if (state.thrust > maxThrust) maxThrust = state.thrust;
    steps += 1;
    if (steps % 100 === 0 || state.result) {
      recordFrame();
    }
  }

  return {
    simulation: "snn-rocket-landing-v1",
    parameters: {
      initialHeightMeters: initialHeight,
      initialFuelKg: initialFuel,
      strategy,
      ...(strategy === "constant_throttle" ? { constantThrottle } : {}),
    },
    outcome: state.result || "timeout",
    softLandingSuccess: state.result === "success",
    durationSeconds: Number(state.t.toFixed(2)),
    terminalHeightMeters: Number(state.h.toFixed(2)),
    terminalVelocityMps: Number(state.v.toFixed(2)),
    remainingFuelKg: Number(state.fuel.toFixed(3)),
    fuelConsumedKg: Number((initialFuel - state.fuel).toFixed(3)),
    firstBurnHeightMeters: firstBurnHeight,
    maxThrustNewtons: Number(maxThrust.toFixed(1)),
    keyframes: keyframes.slice(0, 24),
  };
}

/**
 * Deterministic 2D classification neural network lab evaluation & training tool.
 */
export function runNetworkLabSimulation(args = {}) {
  const dataset = args.dataset === "linear" ? "linear" : "xor";
  const activation =
    args.activation === "linear" || args.activation === "tanh" ? args.activation : "relu";
  const steps = Math.round(clamp(args.steps, 0, 400, 120));
  const lr = clamp(args.learning_rate, 0.01, 1.0, 0.25);

  const samples =
    dataset === "linear"
      ? [
          { x: [-0.75, -0.5], y: 0 },
          { x: [-0.5, -0.75], y: 0 },
          { x: [-0.25, -0.5], y: 0 },
          { x: [0.5, 0.5], y: 1 },
          { x: [0.75, 0.25], y: 1 },
          { x: [0.25, 0.75], y: 1 },
        ]
      : [
          { x: [-0.75, -0.75], y: 0 },
          { x: [0.75, 0.75], y: 0 },
          { x: [-0.75, 0.75], y: 1 },
          { x: [0.75, -0.75], y: 1 },
        ];

  // 2 -> 3 -> 1 network: 3 hidden units (w1, w2, b) + 3 output weights + 1 output bias = 13 parameters
  let params = [
    1.1, 1.0, -0.45,
    1.0, 1.1, 0.45,
    -0.8, 0.9, 0.15,
    1.2, -1.3, 0.7, -0.2,
  ];

  const act = (z) => {
    if (activation === "relu") return z > 0 ? z : 0;
    if (activation === "tanh") return Math.tanh(z);
    return z;
  };
  const dAct = (z) => {
    if (activation === "relu") return z > 0 ? 1 : 0;
    if (activation === "tanh") {
      const t = Math.tanh(z);
      return 1 - t * t;
    }
    return 1;
  };
  const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

  const forwardSample = (p, x) => {
    const z = [
      p[0] * x[0] + p[1] * x[1] + p[2],
      p[3] * x[0] + p[4] * x[1] + p[5],
      p[6] * x[0] + p[7] * x[1] + p[8],
    ];
    const h = z.map(act);
    const logit = p[9] * h[0] + p[10] * h[1] + p[11] * h[2] + p[12];
    const prob = sigmoid(logit);
    return { z, h, logit, prob, predicted: prob >= 0.5 ? 1 : 0 };
  };

  const evaluate = (p) => {
    let totalLoss = 0;
    let correct = 0;
    const details = samples.map((s) => {
      const f = forwardSample(p, s.x);
      const eps = 1e-12;
      const loss = -(s.y * Math.log(Math.max(eps, f.prob)) + (1 - s.y) * Math.log(Math.max(eps, 1 - f.prob)));
      totalLoss += loss;
      if (f.predicted === s.y) correct += 1;
      return {
        input: s.x,
        target: s.y,
        logit: Number(f.logit.toFixed(4)),
        probability: Number(f.prob.toFixed(4)),
        predicted: f.predicted,
      };
    });
    return {
      loss: Number((totalLoss / samples.length).toFixed(5)),
      accuracy: Number((correct / samples.length).toFixed(4)),
      details,
    };
  };

  const initial = evaluate(params);

  for (let stepIdx = 0; stepIdx < steps; stepIdx += 1) {
    const grad = new Array(13).fill(0);
    for (const s of samples) {
      const f = forwardSample(params, s.x);
      const dLogit = (f.prob - s.y) / samples.length;
      grad[9] += dLogit * f.h[0];
      grad[10] += dLogit * f.h[1];
      grad[11] += dLogit * f.h[2];
      grad[12] += dLogit;
      for (let u = 0; u < 3; u += 1) {
        const dz = dLogit * params[9 + u] * dAct(f.z[u]);
        grad[u * 3] += dz * s.x[0];
        grad[u * 3 + 1] += dz * s.x[1];
        grad[u * 3 + 2] += dz;
      }
    }
    params = params.map((v, i) => v - lr * grad[i]);
  }

  const final = evaluate(params);

  return {
    simulation: "snn-neural-network-lab-v1",
    dataset,
    activation,
    steps,
    learningRate: lr,
    initialLoss: initial.loss,
    finalLoss: final.loss,
    initialAccuracy: initial.accuracy,
    finalAccuracy: final.accuracy,
    samplePredictions: final.details,
  };
}

/**
 * Compute a bounded line-level diff between two texts.
 */
export function computeWorkspaceTextDiff(beforeText, afterText, { labelA = "a", labelB = "b", maxHunks = 40 } = {}) {
  const linesA = String(beforeText ?? "").replace(/\r\n/g, "\n").split("\n");
  const linesB = String(afterText ?? "").replace(/\r\n/g, "\n").split("\n");
  const maxLen = Math.max(linesA.length, linesB.length);
  let addedLines = 0;
  let removedLines = 0;
  let unchangedLines = 0;
  const hunks = [];

  for (let i = 0; i < maxLen; i += 1) {
    const a = i < linesA.length ? linesA[i] : undefined;
    const b = i < linesB.length ? linesB[i] : undefined;
    if (a === b) {
      unchangedLines += 1;
      continue;
    }
    if (a !== undefined) removedLines += 1;
    if (b !== undefined) addedLines += 1;
    if (hunks.length < maxHunks) {
      hunks.push({
        line: i + 1,
        ...(a !== undefined ? { before: a.slice(0, 300) } : {}),
        ...(b !== undefined ? { after: b.slice(0, 300) } : {}),
      });
    }
  }

  return {
    labelA,
    labelB,
    identical: addedLines === 0 && removedLines === 0,
    totalLinesBefore: linesA.length,
    totalLinesAfter: linesB.length,
    addedLines,
    removedLines,
    unchangedLines,
    truncatedHunks: hunks.length >= maxHunks,
    hunks,
  };
}
