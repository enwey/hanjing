class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer=new Float32Array(2048); this.offset=0; }
  process(inputs) {
    const input=inputs[0];
    if(input?.[0])for(const value of input[0]){
      this.buffer[this.offset++]=value;
      if(this.offset===this.buffer.length){this.port.postMessage(this.buffer,[this.buffer.buffer]);this.buffer=new Float32Array(2048);this.offset=0;}
    }
    return true;
  }
}
registerProcessor('patient-pcm-capture',PcmCapture);
