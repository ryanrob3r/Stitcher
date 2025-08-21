export namespace main {
	
	export class MergePreset {
	    name: string;
	    format: string;
	    quality: number;
	
	    static createFrom(source: any = {}) {
	        return new MergePreset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.format = source["format"];
	        this.quality = source["quality"];
	    }
	}
        export class VideoFile {
            path: string;
            fileName: string;
            size: number;
            duration: number;
            resolution: string;
            codec: string;
            thumbnailBase64: string;
            hasAudio: boolean;
            fps: number;
            pixelFormat: string;
            sampleRate: number;
            channelLayout: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.fileName = source["fileName"];
	        this.size = source["size"];
	        this.duration = source["duration"];
	        this.resolution = source["resolution"];
                this.codec = source["codec"];
                this.thumbnailBase64 = source["thumbnailBase64"];
                this.hasAudio = source["hasAudio"];
                this.fps = source["fps"];
                this.pixelFormat = source["pixelFormat"];
                this.sampleRate = source["sampleRate"];
                this.channelLayout = source["channelLayout"];
            }
        }

}

