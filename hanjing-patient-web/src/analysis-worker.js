import { analyzePcmOnClient } from './generated/mini-analysis.js';
self.onmessage = ({ data }) => {
  try {
    const pcm = new Int16Array(data.pcm);
    self.postMessage({ analysis: analyzePcmOnClient(pcm, data.duration) });
  } catch {
    self.postMessage({ error: '录音分析失败，请重新录制' });
  }
};
