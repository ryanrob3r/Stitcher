import { useEffect, useState } from 'react';
import './App.css';
import { main } from "../wailsjs/go/models";
import {
    CancelMerge,
    GetHardwareEncoders,
    GetVideoMetadata,
    MergeVideos,
    SelectVideos,
    SetUseHardwareEncoder
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

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
import { CSS } from '@dnd-kit/utilities';

// Extend the Go model type for frontend state management
type VideoFile = main.VideoFile & {
    status: 'loading' | 'loaded' | 'error';
    error?: string;
};

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

function VideoItem({ file }: VideoItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: file.path });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    if (file.status === 'loading') {
        return (
            <div ref={setNodeRef} style={style} {...attributes} className="video-item" role="listitem">
                <div className="drag-handle" {...listeners} aria-label="Drag to reorder video">&#x2261;</div>
                <div className="video-thumbnail-placeholder"></div>
                <div className="video-info" dir="ltr">
                    <strong className="video-filename" title={file.fileName}>{file.fileName}</strong>
                    <span className="video-metadata">Loading details...</span>
                </div>
            </div>
        );
    }

    if (file.status === 'error') {
        return (
            <div ref={setNodeRef} style={style} {...attributes} className="video-item video-item-error" role="listitem">
                <div className="drag-handle" {...listeners} aria-label="Drag to reorder video">&#x2261;</div>
                <div className="video-thumbnail-placeholder"></div>
                <div className="video-info" dir="ltr">
                    <strong className="video-filename" title={file.fileName}>{file.fileName}</strong>
                    <span className="video-metadata error-text">Error: {file.error || 'Failed to load metadata.'}</span>
                </div>
            </div>
        );
    }

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
                    />
                ) : (
                    <div className="video-thumbnail-placeholder" aria-label="No thumbnail available">
                        <svg className="fallback-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4ZM20 18V6H4V18H20ZM9.5 12L16 16V8L9.5 12Z" />
                        </svg>
                    </div>
                )}
            </figure>
            <div className="video-info" dir="ltr">
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
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isMerging, setIsMerging] = useState<boolean>(false);
    const [mergeProgress, setMergeProgress] = useState<number>(0);
    const [progressText, setProgressText] = useState<string>("");
    const [mergeLog, setMergeLog] = useState<string>("");
    const [useGpu, setUseGpu] = useState<boolean>(false);
    const [availableGpuEncoders, setAvailableGpuEncoders] = useState<string[]>([]);
    const [activeEncoder, setActiveEncoder] = useState<string>(""); // hiển thị encoder đang dùng


    useEffect(() => {
        (async () => {
            try {
                const encs = await GetHardwareEncoders();
                setAvailableGpuEncoders(encs || []);
                // lấy trạng thái đã lưu, chỉ bật nếu có encoder khả dụng
                const saved = localStorage.getItem("useHW") === "true";
                const next = !!saved && (encs && encs.length > 0);
                setUseGpu(next);
                await SetUseHardwareEncoder(next);
            } catch (e) {
                setAvailableGpuEncoders([]);
                setUseGpu(false);
                await SetUseHardwareEncoder(false);
            }
        })();
    }, []);

    useEffect(() => {
        EventsOn("mergeProgress", (data: any) => {
            if (typeof data === 'object' && data !== null && typeof data.percentage === 'number') {
                setMergeProgress(data.percentage);
                const current = data.current?.toFixed(1) || '0.0';
                const total = data.total?.toFixed(1) || '0.0';
                setProgressText(`Merging: ${data.percentage.toFixed(1)}% (${current}s / ${total}s)`);
            } else if (typeof data === 'string') {
                // Bắt encoder đang dùng nếu backend emit "Using encoder: xxx"
                if (data.startsWith("Using encoder: ")) {
                    setActiveEncoder(data.replace("Using encoder: ", "").trim());
                }
                setProgressText(data);
                setMergeLog(prev => prev + data + "\n");
            }
        });

        EventsOn("mergeCancelled", () => {
            setStatusMessage("Merge operation cancelled.");
            setIsMerging(false);
            setMergeProgress(0);
            setProgressText("");
            setMergeLog("");
        });
    }, []);


    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    async function handleSelectVideos() {
        setStatusMessage("");
        try {
            const initialFiles = await SelectVideos();
            if (initialFiles.length === 0) return;

            const filesWithStatus: VideoFile[] = initialFiles.map(file => ({ ...file, status: 'loading' }));
            setVideoFiles(filesWithStatus);

            // Now, fetch metadata for each file
            filesWithStatus.forEach(async (file) => {
                try {
                    const metadata = await GetVideoMetadata(file.path);
                    setVideoFiles(currentFiles =>
                        currentFiles.map(f => f.path === file.path ? { ...metadata, status: 'loaded' } : f)
                    );
                } catch (err) {
                    console.error(`Failed to get metadata for ${file.fileName}:`, err);
                    setVideoFiles(currentFiles =>
                        currentFiles.map(f => f.path === file.path ? { ...f, status: 'error', error: String(err) } : f)
                    );
                }
            });
        } catch (err) {
            setStatusMessage(`Error: ${err}`);
        }
    }

    async function handleToggleGpu(checked: boolean) {
        const allowed = checked && availableGpuEncoders.length > 0 && !isMerging;
        setUseGpu(allowed);
        localStorage.setItem("useHW", allowed ? "true" : "false");
        await SetUseHardwareEncoder(allowed);
    }


    function handleMergeVideos() {
        const filesToMerge = videoFiles.filter(f => f.status === 'loaded');
        if (filesToMerge.length < 2) {
            setStatusMessage("Please select at least two loaded videos to merge.");
            return;
        }
        setStatusMessage("Starting merge...");
        setIsMerging(true);
        setMergeProgress(0);
        setProgressText("");
        setMergeLog("");

        MergeVideos(filesToMerge)
            .then(result => {
                setStatusMessage(result);
                setVideoFiles([]);
                setIsMerging(false);
                setMergeProgress(100);
                setActiveEncoder(""); // clear
            })
            .catch(err => {
                setStatusMessage(`Error: ${err}`);
                setIsMerging(false);
                setMergeProgress(0);
            });
    }

    function handleDragStart(event: any) {
        setActiveId(event.active.id);
    }

    function handleDragEnd(event: any) {
        const { active, over } = event;
        if (!over) { setActiveId(null); return; }
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
                <h2>Batch Video Merger</h2>
                <p>Select two or more compatible videos to merge. Incompatible resolutions can be re-encoded.</p>

                <div className="controls">
                    <button className="btn" onClick={handleSelectVideos} disabled={isMerging}>Select Videos</button>
                    {!isMerging ? (
                        <button
                            className="btn merge-btn"
                            onClick={handleMergeVideos}
                            disabled={videoFiles.length < 2 || isMerging || videoFiles.some(f => f.status !== 'loaded')}>
                            Merge Videos
                        </button>
                    ) : (
                        <button
                            className="btn cancel-btn"
                            onClick={CancelMerge}
                            disabled={!isMerging}>
                            Cancel Merge
                        </button>
                    )}
                    <div className="toggle-switch-container">
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                id="gpu-switch"
                                checked={useGpu}
                                onChange={(e) => handleToggleGpu(e.target.checked)}
                                disabled={availableGpuEncoders.length === 0 || isMerging}
                                title={
                                    availableGpuEncoders.length === 0
                                        ? "No hardware encoders detected"
                                        : (isMerging ? "Disabled while merging" : "Enable hardware acceleration for faster processing")
                                }
                            />
                            <span className="slider"></span>
                        </label>
                        <div className="toggle-info">
                            <label htmlFor="gpu-switch">Hardware Acceleration</label>
                            <small>
                                {availableGpuEncoders.length === 0
                                    ? "No compatible GPU detected. Using CPU (libx264)."
                                    : `Available: ${availableGpuEncoders.join(", ")}`}
                                {activeEncoder && ` | Active: ${activeEncoder}`}
                            </small>
                        </div>
                    </div>

                </div>

                {statusMessage && <div className="status-message">{statusMessage}</div>}

                {isMerging && (
                    <div className="progress-section">
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${mergeProgress}%` }}></div>
                        </div>
                        <p className="progress-text">{progressText || 'Starting...'}</p>
                        {mergeLog && (
                            <pre className="merge-log">
                                {mergeLog.split('\n').slice(-10).join('\n')}
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
                                    <VideoItem key={file.path} file={file} />
                                ))}
                            </SortableContext>
                            <DragOverlay>
                                {activeId && activeVideoFile && activeVideoFile.status === 'loaded' ? (
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
