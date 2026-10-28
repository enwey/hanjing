import {livePcmFrame} from './generated/mini-analysis.js';
export class Recorder {
  constructor(onLevel) {
    this.onLevel = onLevel;
    this.chunks = [];
    this.length = 0;
    this.disposed = false;
    this.stopping = false;
    this.running = false;
  }
  async start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
      throw new Error(
        '当前浏览器不支持录音，请使用新版 Chrome、Edge 或 Safari，并通过 HTTPS 访问',
      );
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      if (this.disposed) {
        this.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // Match the mini-program's 8 kHz mono PCM capture where supported.
      try { this.context = new AudioContext({sampleRate:8000}); }
      catch(error) { if(error.name!=='NotSupportedError')throw error;this.context=new AudioContext(); }
      await this.context.audioWorklet.addModule('/pcm-capture.js');
      if (this.disposed) {
        await this.context.close();
        return;
      }
      this.source = this.context.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.context, 'patient-pcm-capture');
      this.node.port.onmessage = (event) => {
        if (!this.running) return;
        const chunk = event.data;
        this.chunks.push(chunk);
        this.length += chunk.length;
        const now = performance.now();
        if (!this.lastLevel || now - this.lastLevel >= 120) {
          this.lastLevel = now;
          const pcm=Int16Array.from(chunk,v=>Math.max(-32768,Math.min(32767,Math.round(v*32768))));
          const {decibel,audioLevels}=livePcmFrame(pcm);
          this.onLevel({
            seconds: Math.floor(this.length / this.context.sampleRate),
            decibel,audioLevels,
          });
        }
      };
      // Worklet has no output samples, so microphone audio is never played back.
      this.source.connect(this.node);
      this.node.connect(this.context.destination);
      await this.context.resume();
      this.running = true;
      this.stream.getAudioTracks()[0].addEventListener('ended', () => {
        if (this.running || this.paused) {
          this.running = false;
          this.dispose();
          this.onLevel({
            seconds: 0,
            decibel:30,audioLevels:new Array(16).fill(6),
            error: '麦克风已断开，请重新录音',
          });
        }
      });
    } catch (error) {
      this.dispose();
      throw new Error(
        error.name === 'NotAllowedError'
          ? '麦克风授权被拒绝，请在浏览器权限设置中允许录音'
          : error.name === 'NotFoundError'
            ? '未找到可用麦克风'
            : error.message || '无法启动录音',
      );
    }
  }
  async pause() {
    if(!this.running||this.stopping||this.disposed)return;
    this.running=false;
    await this.context.suspend();
    this.paused=true;
  }
  async resume() {
    if(!this.paused||this.stopping||this.disposed)return;
    await this.context.resume();
    this.running=true;
    this.paused=false;
  }
  async stop() {
    this.stopping = true;
    this.running = false;
    const sampleRate = this.context?.sampleRate || 48000;
    const duration = Math.min(600, Math.floor(this.length / sampleRate));
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.node?.disconnect();
    await this.context?.close();
    if (duration < 5) {
      this.chunks = [];
      throw new Error('录音不足 5 秒，请重新录制');
    }
    const offline = new OfflineAudioContext(1, duration * 8000, 8000),
      buffer = offline.createBuffer(
        1,
        Math.min(this.length, duration * sampleRate),
        sampleRate,
      ),
      channel = buffer.getChannelData(0);
    let offset = 0;
    for (const chunk of this.chunks) {
      const count = Math.min(chunk.length, channel.length - offset);
      if (count <= 0) break;
      channel.set(chunk.subarray(0, count), offset);
      offset += count;
    }
    this.chunks = [];
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    const resampled = await offline.startRendering();
    if (this.disposed) throw new Error('录音已结束');
    const floats = resampled.getChannelData(0),
      pcm = new Int16Array(floats.length);
    for (let i = 0; i < floats.length; i++)
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(floats[i] * 32768)));
    return new Promise((resolve, reject) => {
      this.reject = reject;
      this.worker = new Worker(
        new URL('./analysis-worker.js', import.meta.url),
        { type: 'module' },
      );
      const finish = () => {
        this.worker.terminate();
        this.worker = null;
        this.reject = null;
      };
      this.worker.onmessage = ({ data }) => {
        finish();
        if (data.error) reject(new Error(data.error));
        else resolve({ duration, analysis: data.analysis });
      };
      this.worker.onerror = () => {
        finish();
        reject(new Error('录音分析失败，请重试'));
      };
      this.worker.postMessage({ pcm: pcm.buffer, duration }, [pcm.buffer]);
    });
  }
  dispose() {
    this.disposed = true;
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.node?.disconnect();
    if (this.context && this.context.state !== 'closed')
      this.context.close().catch(() => {});
    this.worker?.terminate();
    this.reject?.(new Error('录音已取消'));
    this.chunks = [];
  }
}
