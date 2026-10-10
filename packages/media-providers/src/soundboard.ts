import { Track, type TrackProcessor, type AudioProcessorOptions } from 'livekit-client';
/** Mix a user-selected clip into the existing authorized microphone publication. */
export class SoundboardMixer implements TrackProcessor<Track.Kind.Audio,AudioProcessorOptions> {
  name='rooms-soundboard';
  processedTrack?:MediaStreamTrack;
  private input?:MediaStreamAudioSourceNode;
  private destination?:MediaStreamAudioDestinationNode;
  private clip?:AudioBufferSourceNode;
  private gain?:GainNode;
  private context?:AudioContext;
  async init(options:AudioProcessorOptions){this.context=options.audioContext;this.input=this.context.createMediaStreamSource(new MediaStream([options.track]));this.destination=this.context.createMediaStreamDestination();this.input.connect(this.destination);this.processedTrack=this.destination.stream.getAudioTracks()[0];}
  async restart(options:AudioProcessorOptions){await this.destroy();await this.init(options);}
  stop(){const clip=this.clip;this.clip=undefined;if(clip){clip.onended=null;try{clip.stop();}catch{}clip.disconnect();}this.gain?.disconnect();this.gain=undefined;}
  async play(buffer:AudioBuffer,volume:number,canPlay:()=>boolean){if(!this.context||!this.destination)throw new Error('Mikrofon kullanılamıyor.');this.stop();await this.context.resume();if(!canPlay())return;const clip=this.context.createBufferSource(),gain=this.context.createGain();clip.buffer=buffer;gain.gain.value=volume;clip.connect(gain);gain.connect(this.destination);this.clip=clip;this.gain=gain;clip.onended=()=>{if(this.clip===clip)this.stop();};clip.start();}
  async destroy(){this.stop();this.input?.disconnect();this.processedTrack?.stop();this.input=undefined;this.destination=undefined;this.processedTrack=undefined;this.context=undefined;}
}
