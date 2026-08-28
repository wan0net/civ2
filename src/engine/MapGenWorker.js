import { MapGen } from './MapGen.js';

self.onmessage = function(e) {
  const { cols, rows, worldType, climate, temperature, age, landMass, seed } = e.data;
  
  self.postMessage({ type: 'progress', message: 'Generating map...' });
  
  const gen = new MapGen({ seed });
  const result = gen.generate(cols, rows, worldType, climate, temperature, age, landMass);
  
  // Send back raw array buffers/data
  self.postMessage({ type: 'done', result });
};
