export function detectLoop(buffer) {
  return { startSample: 0, endSample: buffer.length };
}

export function halfLoop(loop) {
  const mid = loop.startSample + Math.floor((loop.endSample - loop.startSample) / 2);
  return { startSample: loop.startSample, endSample: mid };
}

export function doubleLoop(loop, maxSamples) {
  const len = loop.endSample - loop.startSample;
  const end = Math.min(loop.endSample + len, maxSamples);
  return { startSample: loop.startSample, endSample: end };
}

export function moveForward(loop, steps, maxSamples) {
  const len = loop.endSample - loop.startSample;
  const start = Math.min(loop.startSample + steps, maxSamples - len);
  return { startSample: start, endSample: start + len };
}

export function resetLoop(buffer) {
  return detectLoop(buffer);
}

export function reverseBufferSection(buffer, start, end) {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    let i = 0;
    let j = end - start - 1;
    while (i < j) {
      const a = data[start + i];
      data[start + i] = data[start + j];
      data[start + j] = a;
      i++;
      j--;
    }
  }
  return buffer;
}
