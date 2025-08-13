import {useState} from 'react';
import './App.css';
import {main} from "../wailsjs/go/models";
import {MergeVideos, SelectVideos} from "../wailsjs/go/main/App";

// Explicitly type VideoFile by referencing the imported Go models
type VideoFile = main.VideoFile;

function App() {
    const [videoFiles, setVideoFiles] = useState<VideoFile[]>([]);
    const [statusMessage, setStatusMessage] = useState<string>("");

    function handleSelectVideos() {
        setStatusMessage("");
        SelectVideos()
            .then(setVideoFiles)
            .catch(err => setStatusMessage(`Error: ${err}`));
    }

    function handleMergeVideos() {
        if (videoFiles.length < 2) {
            setStatusMessage("Please select at least two videos to merge.");
            return;
        }
        setStatusMessage("Merging videos...");
        MergeVideos(videoFiles)
            .then(result => {
                setStatusMessage(result);
                setVideoFiles([]); // Clear the list on success
            })
            .catch(err => setStatusMessage(`Error: ${err}`));
    }

    // Helper to format bytes into something more readable
    function formatBytes(bytes: number, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    return (
        <div id="App">
            <div className="container">
                <h2>Stitcher - Batch Video Merger</h2>
                <p>Select two or more compatible videos (same codec and resolution) to merge.</p>

                <div className="controls">
                    <button className="btn" onClick={handleSelectVideos}>Select Videos</button>
                    <button
                        className="btn merge-btn"
                        onClick={handleMergeVideos}
                        disabled={videoFiles.length < 2}>
                        Merge Videos
                    </button>
                </div>

                {statusMessage && <div className="status-message">{statusMessage}</div>}

                {videoFiles.length > 0 && (
                    <div className="video-list">
                        <h3>Selected Videos:</h3>
                        <table className="video-table">
                            <thead>
                            <tr>
                                <th>File Name</th>
                                <th>Duration</th>
                                <th>Resolution</th>
                                <th>Codec</th>
                                <th>Size</th>
                            </tr>
                            </thead>
                            <tbody>
                            {videoFiles.map((file) => (
                                <tr key={file.path}>
                                    <td>{file.fileName}</td>
                                    <td>{file.duration.toFixed(2)}s</td>
                                    <td>{file.resolution}</td>
                                    <td>{file.codec}</td>
                                    <td>{formatBytes(file.size)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

export default App