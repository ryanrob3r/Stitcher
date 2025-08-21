import { useEffect, useRef, useState } from 'react';
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
    onDelete: (path: string) => void;
}

function VideoItem({ file, onDelete }: VideoItemProps) {
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
                <button
                    className="btn delete-single-btn"
                    onClick={() => onDelete(file.path)}
                    aria-label={`Remove ${file.fileName} from list`}
                    title={`Remove ${file.fileName}`}
                >
                    &times;
                </button>
            </figure>
            <div className="video-item-info" dir="ltr">
                <strong className="video-filename" title={file.fileName}>{file.fileName}</strong>
                <div className="meta-row">
                    <span className="meta-chip">{file.resolution}</span>
                    <span className="meta-chip">{file.codec}</span>
                    <span className="meta-chip">{file.duration.toFixed(1)}s</span>
                    <span className="meta-chip">{formatBytes(file.size)}</span>
                </div>
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
    const mergeStartRef = useRef<number | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

    type Toast = { id: number; type: 'success' | 'error' | 'info'; message: string };
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    function pushToast(type: Toast['type'], message: string, ttl = 4000) {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, ttl);
    }

    function formatEta(seconds: number) {
        if (!isFinite(seconds) || seconds <= 0) return "";
        const s = Math.floor(seconds % 60);
        const m = Math.floor((seconds / 60) % 60);
        const h = Math.floor(seconds / 3600);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }

    function isFastMergeable(files: VideoFile[]) {
        const loaded = files.filter(f => f.status === 'loaded');
        if (loaded.length < 2) return false;
        const b = loaded[0];
        const approx = (a: number, c: number) => Math.abs(a - c) <= 0.05;
        return loaded.every(v => {
            if (v.codec !== b.codec) return false;
            if (v.resolution !== b.resolution) return false;
            if (v.hasAudio !== b.hasAudio) return false;
            if (!approx(v.fps, b.fps)) return false;
            if (v.pixelFormat !== b.pixelFormat) return false;
            if (v.hasAudio) {
                if (v.sampleRate !== b.sampleRate) return false;
                if (v.channelLayout !== b.channelLayout) return false;
            }
            return true;
        });
    }

    function shortEnc(name: string) {
        if (!name) return '';
        if (name.includes('nvenc')) return 'NVENC';
        if (name.includes('qsv')) return 'QSV';
        if (name.includes('amf')) return 'AMF';
        if (name.includes('libx264')) return 'CPU';
        return name;
    }


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
            if (data && typeof data === 'object') {
                if (typeof data.percentage === 'number') {
                    setMergeProgress(data.percentage);
                    const current = typeof data.current === 'number' ? data.current.toFixed(1) : '0.0';
                    const total = typeof data.total === 'number' ? data.total.toFixed(1) : '0.0';
                    const label = data.message || 'Merging...';
                    let etaLabel = '';
                    if (typeof data.current === 'number' && typeof data.total === 'number' && data.current > 0) {
                        const started = mergeStartRef.current ?? Date.now();
                        const elapsed = (Date.now() - started) / 1000;
                        const speed = data.current / Math.max(elapsed, 0.001);
                        const remaining = Math.max(data.total - data.current, 0);
                        const eta = remaining / Math.max(speed, 0.001);
                        etaLabel = ` • ETA ${formatEta(eta)}`;
                    }
                    setProgressText(`${label} ${data.percentage.toFixed(1)}% (${current}s / ${total}s)${etaLabel}`);
                }
                if (typeof data.message === 'string') {
                    const msg = data.message as string;
                    if (msg.startsWith("Using encoder: ")) {
                        setActiveEncoder(msg.replace("Using encoder: ", "").trim());
                    }
                    setMergeLog(prev => prev + msg + "\n");
                    if (typeof data.percentage !== 'number') {
                        setProgressText(msg);
                    }
                }
            }
        });
        
        EventsOn("mergeCancelled", () => {
            setStatusMessage("Merge operation cancelled.");
            setIsMerging(false);
            setMergeProgress(0);
            setProgressText("");
            setMergeLog("");
            pushToast('info', 'Merge cancelled');
        });
    }, []);


    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    async function handleSelectVideos() {
        setStatusMessage("");
        try {
            const newlySelectedFiles = await SelectVideos();
            if (newlySelectedFiles.length === 0) return;

            const existingPaths = new Set(videoFiles.map(f => f.path));
            const uniqueNewFiles = newlySelectedFiles.filter(
                newFile => !existingPaths.has(newFile.path)
            );

            if (uniqueNewFiles.length === 0) {
                setStatusMessage("No new unique videos were selected.");
                return;
            }

            const filesWithStatus: VideoFile[] = uniqueNewFiles.map(file => ({ ...file, status: 'loading' }));

            setVideoFiles(prevFiles => [...prevFiles, ...filesWithStatus]);

            // Now, fetch metadata for each new unique file
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
            pushToast('error', `Error selecting videos: ${err}` as string);
        }
    }

    async function handleAddPaths(paths: string[]) {
        if (!paths || paths.length === 0) return;
        const existingPaths = new Set(videoFiles.map(f => f.path));
        const unique = paths.filter(p => !existingPaths.has(p));
        if (unique.length === 0) {
            pushToast('info', 'All dropped files are already in the list');
            return;
        }
        const placeholders: any[] = unique.map(p => ({ path: p, fileName: p.split(/[/\\]/).pop() || p }));
        const filesWithStatus: VideoFile[] = placeholders.map((file: any) => ({ ...(file as any), status: 'loading' }));
        setVideoFiles(prev => [...prev, ...filesWithStatus]);
        // Fetch metadata
        for (const ph of placeholders) {
            try {
                const md = await GetVideoMetadata(ph.path);
                setVideoFiles(current => current.map(f => f.path === ph.path ? { ...md, status: 'loaded' } as any : f));
            } catch (e) {
                setVideoFiles(current => current.map(f => f.path === ph.path ? { ...f, status: 'error', error: String(e) } : f));
            }
        }
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        const files = Array.from(e.dataTransfer?.files || []);
        const paths = files
            .map((f: any) => f.path || f.webkitRelativePath || '')
            .filter((p: string) => !!p);
        if (paths.length === 0) {
            pushToast('info', 'Drag-and-drop not supported here. Use "Select Videos".');
            return;
        }
        handleAddPaths(paths);
    }

    const handleDeleteVideo = (pathToDelete: string) => {
        setVideoFiles(prevFiles => prevFiles.filter(file => file.path !== pathToDelete));
        setStatusMessage(""); // Clear any previous status message
    };

    const handleClearAll = () => {
        setVideoFiles([]);
        setStatusMessage("");
        setMergeProgress(0);
        setProgressText("");
        setMergeLog("");
    };

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
        mergeStartRef.current = Date.now();

        MergeVideos(filesToMerge)
            .then(result => {
                setStatusMessage(result);
                setVideoFiles([]);
                setIsMerging(false);
                setMergeProgress(100);
                setActiveEncoder(""); // clear
                mergeStartRef.current = null;
                pushToast('success', 'Merge completed successfully');
            })
            .catch(err => {
                setStatusMessage(`Error: ${err}`);
                setIsMerging(false);
                setMergeProgress(0);
                mergeStartRef.current = null;
                pushToast('error', `Merge failed: ${err}` as string);
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
                    <button
                        className="btn clear-all-btn"
                        onClick={handleClearAll}
                        disabled={isMerging || videoFiles.length === 0}
                        aria-label="Clear all selected videos"
                        title="Clear All"
                    >
                        Clear All
                    </button>
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
                            <label htmlFor="gpu-switch">GPU Acceleration</label>
                            <small
                                className="meta-chip"
                                title={
                                    availableGpuEncoders.length > 0
                                        ? `Available: ${availableGpuEncoders.join(', ')}`
                                        : 'No compatible GPU encoders detected'
                                }
                            >
                                {availableGpuEncoders.length === 0
                                    ? 'GPU: Unavailable'
                                    : (useGpu
                                        ? (activeEncoder && shortEnc(activeEncoder) === 'CPU'
                                            ? 'GPU: Unavailable'
                                            : `GPU: On${activeEncoder ? ` (${shortEnc(activeEncoder)})` : ''}`)
                                        : 'GPU: Off')}
                            </small>
                        </div>
                    </div>

                    <div className="compatibility-info">
                        <small className="meta-chip" title="When all clips match codec, resolution, FPS, pixel format, and audio layout, Stitcher can copy streams without re-encoding.">
                            {isFastMergeable(videoFiles) ? 'Fast Merge Ready' : 'Will Normalize (re-encode)'}
                        </small>
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

                {videoFiles.length === 0 && (
                    <div
                        className={`dropzone ${isDraggingOver ? 'dragover' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                        onDragLeave={() => setIsDraggingOver(false)}
                        onDrop={handleDrop}
                        onClick={handleSelectVideos}
                        role="button"
                        title="Drag & drop videos here or click to select"
                        aria-label="Drop videos or click to select"
                    >
                        <div className="dropzone-inner">
                            <div className="dz-icon">📹</div>
                            <div>
                                <div className="dz-title">Drag & Drop Videos</div>
                                <div className="dz-subtitle">or click to select files</div>
                            </div>
                        </div>
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
                                    <VideoItem key={file.path} file={file} onDelete={handleDeleteVideo} />
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
            <div className="toasts" aria-live="polite" aria-atomic="true">
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
                ))}
            </div>
        </div>
    )
}

export default App
