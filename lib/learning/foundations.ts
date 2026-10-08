/** Small, original teaching engine. No model service or external ML runtime. */
export type DatasetId = 'linear' | 'xor';
export type Activation = 'linear' | 'tanh';
export type Example = { id: number; x: [number, number]; target: 0 | 1 };
export type Network = { kind: 'perceptron' | 'mlp'; activation: Activation; parameters: number[] };
export type Trace = { input: [number, number]; sums: number[]; hidden: number[]; logit: number; probability: number; prediction: 0 | 1 };
export type Metrics = { loss: number; accuracy: number; mistakes: number };
export const MAX_UPDATES = 1200;
export const SEED = 0xC0FFEE;

export function examples(id: DatasetId): Example[] {
  const result: Example[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    for (const dx of [-.12, 0, .12]) for (const dy of [-.12, 0, .12]) {
      const x: [number, number] = [.65 * sx + dx, .65 * sy + dy];
      result.push({ id: result.length, x, target: (id === 'xor' ? sx !== sy : x[0] + .6 * x[1] >= 0) ? 1 : 0 });
    }
  }
  return result;
}

export function initialNetwork(kind: Network['kind'], activation: Activation = 'tanh'): Network {
  if (kind === 'perceptron') return { kind, activation: 'linear', parameters: [-.45, .8, -.1] };
  let seed = SEED;
  const random = () => {
    let n = seed += 0x6D2B79F5;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  const hiddenWeights = Array.from({ length: 8 }, () => 2 * random() - 1);
  const outputWeights = Array.from({ length: 4 }, () => (2 * random() - 1) * Math.sqrt(6 / 5));
  return { kind, activation, parameters: [...hiddenWeights, 0, 0, 0, 0, ...outputWeights, 0] };
}

export function sigmoid(z: number) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}
export function binaryLoss(logit: number, target: number) {
  return Math.max(logit, 0) - target * logit + Math.log1p(Math.exp(-Math.abs(logit)));
}
export function forward(model: Network, input: [number, number]): Trace {
  const w = model.parameters;
  if (model.kind === 'perceptron') {
    const logit = w[0] * input[0] + w[1] * input[1] + w[2];
    const prediction = logit >= 0 ? 1 : 0;
    return { input, sums: [], hidden: [], logit, probability: prediction, prediction };
  }
  const sums = Array.from({ length: 4 }, (_, j) => w[j * 2] * input[0] + w[j * 2 + 1] * input[1] + w[8 + j]);
  const hidden = sums.map(z => model.activation === 'tanh' ? Math.tanh(z) : z);
  const logit = hidden.reduce((z, h, j) => z + h * w[12 + j], w[16]);
  return { input, sums, hidden, logit, probability: sigmoid(logit), prediction: logit >= 0 ? 1 : 0 };
}
export function metrics(model: Network, data: Example[]): Metrics {
  let loss = 0, mistakes = 0;
  for (const point of data) {
    const trace = forward(model, point.x);
    mistakes += Number(trace.prediction !== point.target);
    loss += model.kind === 'perceptron' ? Number(trace.prediction !== point.target) : binaryLoss(trace.logit, point.target);
  }
  return { loss: loss / data.length, accuracy: 1 - mistakes / data.length, mistakes };
}
/** Gradients of mean BCE. Every term is evaluated at the same old parameters. */
export function gradients(model: Network, data: Example[]): number[] {
  if (model.kind !== 'mlp') throw new Error('Hard-threshold perceptrons use the mistake update, not BCE backpropagation.');
  const gradient = Array<number>(17).fill(0), w = model.parameters;
  for (const point of data) {
    const trace = forward(model, point.x), d = (trace.probability - point.target) / data.length;
    gradient[16] += d;
    for (let j = 0; j < 4; j++) {
      gradient[12 + j] += d * trace.hidden[j];
      const local = model.activation === 'tanh' ? 1 - trace.hidden[j] ** 2 : 1;
      const q = d * w[12 + j] * local;
      gradient[j * 2] += q * point.x[0];
      gradient[j * 2 + 1] += q * point.x[1];
      gradient[8 + j] += q;
    }
  }
  return gradient;
}
export function applyGradient(model: Network, gradient: number[], rate: number): Network {
  if (gradient.length !== model.parameters.length) throw new Error('Every parameter needs a gradient.');
  return { ...model, parameters: model.parameters.map((value, i) => value - rate * gradient[i]) };
}
export function trainStep(model: Network, data: Example[], rate: number) {
  const gradient = gradients(model, data);
  return { model: applyGradient(model, gradient, rate), gradient };
}
export function correctMistake(model: Network, data: Example[], rate: number) {
  if (model.kind !== 'perceptron') throw new Error('The mistake update is only for a perceptron.');
  const point = data.find(p => forward(model, p.x).prediction !== p.target);
  if (!point) return { model, point: null };
  const error = point.target - forward(model, point.x).prediction;
  const inputs = [...point.x, 1];
  return { model: { ...model, parameters: model.parameters.map((w, i) => w + rate * error * inputs[i]) }, point };
}
export function equivalentLinear(model: Network): [number, number, number] {
  if (model.kind === 'perceptron') return model.parameters as [number, number, number];
  if (model.activation !== 'linear') throw new Error('A tanh hidden layer cannot be collapsed to one affine map.');
  const p = model.parameters;
  return [0, 1, 2].map(k => p.slice(12, 16).reduce((v, weight, j) => v + weight * p[k === 2 ? 8 + j : 2 * j + k], k === 2 ? p[16] : 0)) as [number, number, number];
}
/** Use collapsed affine coefficients for contours, never cancellation-prone hidden values. */
export function decisionLogit(model: Network, input: [number, number]) {
  if (model.activation !== 'linear') return forward(model, input).logit;
  const [a, b, c] = equivalentLinear(model);
  return a * input[0] + b * input[1] + c;
}
export function hasMeaningfulBoundary(model: Network) {
  if (model.activation !== 'linear') return true;
  const [a, b] = equivalentLinear(model);
  return Math.hypot(a, b) > 1e-7;
}
export function parameterName(model: Network, index: number) {
  if (model.kind === 'perceptron') return ['w₁', 'w₂', 'b'][index];
  if (index < 8) return `w${Math.floor(index / 2) + 1}${index % 2 + 1}`;
  if (index < 12) return `b${index - 7}`;
  if (index < 16) return `v${index - 11}`;
  return 'b输出';
}
