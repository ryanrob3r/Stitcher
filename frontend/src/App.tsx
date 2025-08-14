import {useState} from 'react';
import './App.css';
import {main} from "../wailsjs/go/models";
import {MergeVideos, SelectVideos} from "../wailsjs/go/main/App";

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
        setStatusMessage("Merging videos...");
        MergeVideos(videoFiles)
            .then(result => {
                setStatusMessage(result);
                setVideoFiles([]); // Clear the list on success
            })
            .catch(err => setStatusMessage(`Error: ${err}`));
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