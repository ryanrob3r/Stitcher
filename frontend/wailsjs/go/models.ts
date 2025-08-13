export namespace main {
	
	export class VideoFile {
	    path: string;
	    fileName: string;
	    size: number;
	    duration: number;
	    resolution: string;
	    codec: string;
	
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
	    }
	}

}

