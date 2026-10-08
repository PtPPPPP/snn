/** A one-input numeric regression example, distinct from the later threshold classifiers. */
export type FitSample = { x: number; y: number };
export type FitParameters = { w: number; b: number };
export const FIT_SAMPLES: readonly FitSample[] = [{x:0,y:1},{x:1,y:3},{x:2,y:5}];
export const initialFit = (): FitParameters => ({w:1,b:1});
export const FIT_RATE = .3;
export const predictValue = (parameters: FitParameters, x: number) => parameters.w * x + parameters.b;

export function fitTrace(parameters: FitParameters, samples: readonly FitSample[]) {
  if (!samples.length) throw new Error('A fitting example requires at least one sample.');
  const rows = samples.map(sample => {
    const prediction = predictValue(parameters, sample.x);
    const residual = prediction - sample.y;
    return { ...sample, prediction, residual, squaredError: residual * residual, sampleLoss: residual * residual / 2, derivativeW: residual * sample.x, derivativeB: residual };
  });
  return {
    rows,
    loss: rows.reduce((total, row) => total + row.sampleLoss, 0) / rows.length,
    gradient: {
      w: rows.reduce((total, row) => total + row.derivativeW, 0) / rows.length,
      b: rows.reduce((total, row) => total + row.derivativeB, 0) / rows.length,
    },
  };
}

export function updateFit(parameters: FitParameters, gradient: FitParameters, rate: number): FitParameters {
  return { w: parameters.w - rate * gradient.w, b: parameters.b - rate * gradient.b };
}
