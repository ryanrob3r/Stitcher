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

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="video-item">
            <div className="drag-handle" {...listeners}>&#x2261;</div> {/* Drag handle icon */}
            <div className="video-item-info">
                <strong>{file.fileName}</strong>
                <span>Duration: {file.duration.toFixed(2)}s</span>
                <span>Resolution: {file.resolution}</span>
                <span>Codec: {file.codec}</span>
                <span>Size: {formatBytes(file.size)}</span>
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