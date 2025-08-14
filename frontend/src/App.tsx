import {useEffect, useState} from 'react'; // Added useEffect
import './App.css';
import {main} from "../wailsjs/go/models";
import {CancelMerge, MergeVideos, SelectVideos} from "../wailsjs/go/main/App"; // Added CancelMerge
import {EventsOn, EventsEmit} from "../wailsjs/runtime/runtime"; // Added EventsOn, EventsEmit

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

// Explicitly type VideoFile by referencing the imported Go models
type VideoFile = main.VideoFile;

// Helper to format bytes into something more readable
function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

interface VideoItemProps {
    file: VideoFile;
}

function VideoItem({file}: VideoItemProps) {
    const {attributes, listeners, setNodeRef, transform, transition} = useSortable({id: file.path});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const thumbnailUrl = file.thumbnailBase64 || '';
    const hasThumbnail = !!thumbnailUrl;

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="video-item" role="listitem">
            <div className="drag-handle" {...listeners} aria-label="Drag to reorder video">&#x2261;</div>
            
            <figure className="video-thumbnail-container" aria-hidden="true">
                {hasThumbnail ? (
                    <img 
                        src={thumbnailUrl} 
                        alt={`Thumbnail for ${file.fileName}`} 
                        className="video-thumbnail"
                        width="240" 
                        height="135" 
                        loading="lazy"
                        onError={(e) => {
                            e.currentTarget.onerror = null; // Prevent infinite loop
                            e.currentTarget.src = '/path/to/fallback-video-icon.svg'; // Fallback icon
                            e.currentTarget.classList.add('video-thumbnail-fallback');
                        }}
                    />
                ) : (
                    <div className="video-thumbnail-placeholder" aria-label="Loading video thumbnail or no thumbnail available">
                        <svg className="fallback-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4ZM20 18V6H4V18H20ZM9.5 12L16 16V8L9.5 12Z"/>
                        </svg>
                    </div>
                )}
            </figure>

            <div className="video-info" dir="ltr"> {/* dir=ltr for consistent text direction */}
                <strong className="video-filename" title={file.fileName}>{file.fileName}</strong>
                <span className="video-metadata">Duration: {file.duration.toFixed(2)}s</span>
                <span className="video-metadata">Resolution: {file.resolution}</span>
                <span className="video-metadata">Codec: {file.codec}</span>
                <span className="video-metadata">Size: {formatBytes(file.size)}</span>
            </div>
        </div>
    );
}


    function App() {
    const [videoFiles, setVideoFiles] = useState<VideoFile[]>([]);
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [activeId, setActiveId] = useState<string | null>(null); // State to track active dragging item
    const [isMerging, setIsMerging] = useState<boolean>(false); // New state for merging status
    const [mergeProgress, setMergeProgress] = useState<number>(0); // New state for progress (0-100)
    const [mergeLog, setMergeLog] = useState<string>(""); // New state for ffmpeg log output

    useEffect(() => {
        // Listener for merge progress updates
        EventsOn("mergeProgress", (progressLine: string) => {
            // Basic parsing for demonstration. A more robust parser would extract percentage.
            // For now, we'll just update the log and a dummy progress.
            setMergeLog(prev => prev + progressLine + "\n");
            // Dummy progress update: if line contains "frame=", increment progress slightly
            if (progressLine.includes("frame=")) {
                setMergeProgress(prev => Math.min(prev + 1, 99)); // Increment, but don't reach 100
            }
        });

        // Listener for merge cancellation
        EventsOn("mergeCancelled", () => {
            setStatusMessage("Merge operation cancelled.");
            setIsMerging(false);
            setMergeProgress(0);
            setMergeLog("");
        });

        // Cleanup function to unsubscribe from events when component unmounts
        return () => {
            // Wails EventsOn returns an unsubscribe function, but it's not directly exposed
            // in the current wailsjs/runtime. For simplicity in this example, we'll rely
            // on component unmount to handle cleanup, or assume events are global.
            // In a real app, you might manage subscriptions more explicitly.
        };
    }, []); // Empty dependency array means this effect runs once on mount and cleans up on unmount

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

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
        setStatusMessage("Starting merge...");
        setIsMerging(true); // Set merging status to true
        setMergeProgress(0); // Reset progress
        setMergeLog(""); // Clear previous log

        MergeVideos(videoFiles)
            .then(result => {
                setStatusMessage(result);
                setVideoFiles([]); // Clear the list on success
                setIsMerging(false); // Reset merging status
                setMergeProgress(100); // Set progress to 100 on success
            })
            .catch(err => {
                setStatusMessage(`Error: ${err}`);
                setIsMerging(false); // Reset merging status on error
                setMergeProgress(0); // Reset progress on error
            });
    }

    function handleDragStart(event: any) {
        setActiveId(event.active.id);
    }

    function handleDragEnd(event: any) {
        const {active, over} = event;

        if (active.id !== over.id) {
            setVideoFiles((items) => {
                const oldIndex = items.findIndex(item => item.path === active.id);
                const newIndex = items.findIndex(item => item.path === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
        setActiveId(null);
    }

    function handleDragCancel() {
        setActiveId(null);
    }

    const activeVideoFile = activeId ? videoFiles.find(file => file.path === activeId) : null;

    return (
        <div id="App">
            <div className="container">
                <h2>Stitcher - Batch Video Merger</h2>
                <p>Select two or more compatible videos (same codec and resolution) to merge.</p>

                <div className="controls">
                    <button className="btn" onClick={handleSelectVideos} disabled={isMerging}>Select Videos</button>
                    {!isMerging ? (
                        <button
                            className="btn merge-btn"
                            onClick={handleMergeVideos}
                            disabled={videoFiles.length < 2 || isMerging}>
                            Merge Videos
                        </button>
                    ) : (
                        <button
                            className="btn cancel-btn"
                            onClick={CancelMerge} // Call backend CancelMerge function
                            disabled={!isMerging}>
                            Cancel Merge
                        </button>
                    )}
                </div>

                {statusMessage && <div className="status-message">{statusMessage}</div>}

                {isMerging && (
                    <div className="progress-section">
                        <h3>Merging...</h3>
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${mergeProgress}%` }}></div>
                        </div>
                        <p className="progress-text">{mergeProgress.toFixed(0)}% Complete</p>
                        {mergeLog && (
                            <pre className="merge-log">
                                {mergeLog.split('\n').slice(-10).join('\n')} {/* Show last 10 lines */}
                            </pre>
                        )}
                    </div>
                )}

                {videoFiles.length > 0 && (
                    <div className="video-list">
                        <h3>Selected Videos:</h3>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onDragCancel={handleDragCancel}
                        >
                            <SortableContext
                                items={videoFiles.map(file => file.path)}
                                strategy={verticalListSortingStrategy}
                            >
                                {videoFiles.map((file) => (
                                    <VideoItem key={file.path} file={file}/>
                                ))}
                            </SortableContext>
                            <DragOverlay>
                                {activeId && activeVideoFile ? (
                                    <div className="video-item-drag-overlay">
                                        <div className="video-item-info">
                                            <strong>{activeVideoFile.fileName}</strong>
                                            <span>Duration: {activeVideoFile.duration.toFixed(2)}s</span>
                                            <span>Resolution: {activeVideoFile.resolution}</span>
                                            <span>Codec: {activeVideoFile.codec}</span>
                                            <span>Size: {formatBytes(activeVideoFile.size)}</span>
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    </div>
                )}
            </div>
        </div>
    )
}

export default App