package main

import (
	"bufio" // Added for reading ffmpeg stderr
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings" // Added for string manipulation

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// VideoFile represents a single video file to be processed.
type VideoFile struct {
	Path            string  `json:"path"`
	FileName        string  `json:"fileName"`
	Size            int64   `json:"size"`
	Duration        float64 `json:"duration"`
	Resolution      string  `json:"resolution"`
	Codec           string  `json:"codec"`
	ThumbnailBase64 string  `json:"thumbnailBase64"` // Base64 encoded thumbnail image
}

// MergePreset defines the settings for the output video.
type MergePreset struct {
	Name    string `json:"name"`
	Format  string `json:"format"`  // e.g., "mp4", "mkv"
	Quality int    `json:"quality"` // e.g., 22 (CRF value for H.264)
}

// JobStatus represents the current state of a merge job.
type JobStatus string

const (
	StatusPending  JobStatus = "pending"
	StatusRunning  JobStatus = "running"
	StatusComplete JobStatus = "complete"
	StatusError    JobStatus = "error"
)

// MergeJob represents a single project of merging multiple videos.
type MergeJob struct {
	ID          string      `json:"id"`
	ProjectName string      `json:"projectName"`
	VideoFiles  []VideoFile `json:"videoFiles"`
	Preset      MergePreset `json:"preset"`
	OutputName  string      `json:"outputName"`
	Status      JobStatus   `json:"status"`
	Progress    float64     `json:"progress"` // 0.0 to 100.0
}

// App struct
type App struct {
	ctx context.Context
	cancelFunc context.CancelFunc
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	_, err := exec.LookPath("ffmpeg")
	if err != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Error: FFmpeg not found",
			Message: "FFmpeg is required for this application to function. Please install it and ensure it is in your system's PATH.\n\nFor installation instructions, please visit: https://ffmpeg.org/download.html",
		})
		os.Exit(1)
	}
}

// FFProbeStream defines the structure for a stream in ffprobe output
type FFProbeStream struct {
	CodecType string `json:"codec_type"`
	CodecName string `json:"codec_name"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
}

// FFProbeFormat defines the structure for the format section in ffprobe output
type FFProbeFormat struct {
	Duration string `json:"duration"`
	Size     string `json:"size"`
}

// FFProbeResult defines the overall structure of the ffprobe JSON output
type FFProbeResult struct {
	Streams []FFProbeStream `json:"streams"`
	Format  FFProbeFormat   `json:"format"`
}

// SelectVideos opens a file dialog and returns a list of video files with basic info.
// Detailed metadata is fetched separately.
func (a *App) SelectVideos() ([]VideoFile, error) {
	filePaths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Video Files",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Video Files (*.mp4, *.mkv, *.mov, *.avi, *.webm)",
				Pattern:     "*.mp4;*.mkv;*.mov;*.avi;*.webm",
			},
		},
	})
	if err != nil {
		return nil, err
	}

	if filePaths == nil {
		return []VideoFile{}, nil
	}

	var videoFiles []VideoFile
	for _, path := range filePaths {
		videoFiles = append(videoFiles, VideoFile{
			Path:     path,
			FileName: filepath.Base(path),
		})
	}

	return videoFiles, nil
}

// GetVideoMetadata fetches detailed information for a single video file.
func (a *App) GetVideoMetadata(path string) (VideoFile, error) {
	cmd := exec.Command("ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path)
	out, err := cmd.Output()
	if err != nil {
		log.Printf("Error running ffprobe for %s: %v", path, err)
		return VideoFile{}, fmt.Errorf("failed to run ffprobe for %s", path)
	}

	var ffprobeData FFProbeResult
	err = json.Unmarshal(out, &ffprobeData)
	if err != nil {
		log.Printf("Error parsing ffprobe output for %s: %v", path, err)
		return VideoFile{}, fmt.Errorf("failed to parse ffprobe data for %s", path)
	}

	var videoStream FFProbeStream
	for _, stream := range ffprobeData.Streams {
		if stream.CodecType == "video" {
			videoStream = stream
			break
		}
	}

	duration, _ := strconv.ParseFloat(ffprobeData.Format.Duration, 64)
	size, _ := strconv.ParseInt(ffprobeData.Format.Size, 10, 64)

	videoFile := VideoFile{
		Path:       path,
		FileName:   filepath.Base(path),
		Size:       size,
		Duration:   duration,
		Resolution: fmt.Sprintf("%dx%d", videoStream.Width, videoStream.Height),
		Codec:      videoStream.CodecName,
	}

	// Generate thumbnail
	thumbnail, err := a.GenerateThumbnail(path)
	if err != nil {
		log.Printf("Error generating thumbnail for %s: %v", path, err)
		videoFile.ThumbnailBase64 = "" // Continue without thumbnail
	} else {
		videoFile.ThumbnailBase64 = thumbnail
	}

	return videoFile, nil
}

// GenerateThumbnail generates a base64 encoded thumbnail for a given video path.
func (a *App) GenerateThumbnail(videoPath string) (string, error) {
	// Use ffmpeg to extract a frame at 1 second mark and output as base64
	cmd := exec.Command("ffmpeg", "-i", videoPath, "-ss", "00:00:01.000", "-vframes", "1", "-f", "image2pipe", "-")

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf(`failed to generate thumbnail for %s: %s\n%s`, videoPath, err.Error(), stderr.String())
	}

	encodedString := base64.StdEncoding.EncodeToString(out.Bytes())
	return "data:image/jpeg;base64," + encodedString, nil
}

// GetPresets returns a list of predefined merge presets.
func (a *App) GetPresets() []MergePreset {
	return []MergePreset{
		{Name: "Fast Copy (Same Codec/Res)", Format: "copy", Quality: 0},
		{Name: "MP4 (H.264) - High Quality", Format: "mp4", Quality: 18},
		{Name: "MP4 (H.264) - Medium Quality", Format: "mp4", Quality: 23},
		{Name: "WebM (VP9) - Medium Quality", Format: "webm", Quality: 28},
	}
}

// CancelMerge cancels the ongoing video merge operation.
func (a *App) CancelMerge() {
	if a.cancelFunc != nil {
		a.cancelFunc()
		a.cancelFunc = nil                          // Clear the cancel function after use
		runtime.EventsEmit(a.ctx, "mergeCancelled") // Emit an event to the frontend
	}
}

// handleIncompatibleVideos checks for codec and resolution mismatches and handles re-encoding.
// It returns a new list of video files (if re-encoding was needed) and a temporary directory path to be cleaned up.
func (a *App) handleIncompatibleVideos(videoFiles []VideoFile) ([]VideoFile, string, error) {
	if len(videoFiles) == 0 {
		return nil, "", fmt.Errorf("no video files provided")
	}

	firstVideo := videoFiles[0]
	codecMismatch := false
	resolutionMismatch := false
	highestWidth := 0
	highestHeight := 0

	// First pass: check for mismatches and find the highest resolution
	for _, video := range videoFiles {
		if video.Codec != firstVideo.Codec {
			codecMismatch = true
			break
		}
		if video.Resolution != firstVideo.Resolution {
			resolutionMismatch = true
		}

		// Parse resolution to find the highest for the re-encoding target
		var w, h int
		fmt.Sscanf(video.Resolution, "%dx%d", &w, &h)
		if w > highestWidth {
			highestWidth = w
			highestHeight = h
		}
	}

	// Handle codec mismatch: this is a hard stop
	if codecMismatch {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Codec Mismatch",
			Message: fmt.Sprintf("All videos must have the same codec. The first video uses '%s', but at least one other video uses a different codec.", firstVideo.Codec),
		})
		return nil, "", fmt.Errorf("codec mismatch")
	}

	// If no resolution mismatch, we can proceed with a fast merge
	if !resolutionMismatch {
		return videoFiles, "", nil
	}

	// Handle resolution mismatch: ask the user if they want to re-encode
	targetResolution := fmt.Sprintf("%dx%d", highestWidth, highestHeight)
	dialogResult, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.QuestionDialog,
		Title:   "Resolution Mismatch",
		Message: fmt.Sprintf("The selected videos have different resolutions. Do you want to re-encode them all to the highest resolution (%s) to proceed with the merge?", targetResolution),
		Buttons: []string{"Yes", "No"},
	})
	if err != nil {
		return nil, "", err
	}
	if dialogResult == "No" {
		return nil, "", fmt.Errorf("user cancelled re-encoding")
	}

	// --- Re-encoding process starts ---
	runtime.EventsEmit(a.ctx, "mergeProgress", "Starting re-encoding process...")

	// Create a temporary directory for the scaled files
	tempDir, err := os.MkdirTemp("", "stitcher-scaled-*")
	if err != nil {
		return nil, "", fmt.Errorf("failed to create temp dir for scaling: %w", err)
	}

	processedFiles := make([]VideoFile, len(videoFiles))
	for i, video := range videoFiles {
		if video.Resolution == targetResolution {
			// This video is already the correct resolution, just copy its data
			processedFiles[i] = video
			continue
		}

		// This video needs to be scaled
		runtime.EventsEmit(a.ctx, "mergeProgress", fmt.Sprintf("Scaling %s...", video.FileName))
		outputFileName := filepath.Join(tempDir, fmt.Sprintf("scaled-%d-%s", i, video.FileName))

		cmd := exec.Command("ffmpeg",
			"-i", video.Path,
			"-vf", fmt.Sprintf("scale=%s:force_original_aspect_ratio=decrease,pad=%s:(ow-iw)/2:(oh-ih)/2", targetResolution, targetResolution),
			"-c:a", "copy",
			outputFileName,
		)

		// Run the command and wait for it to finish
		if err := cmd.Run(); err != nil {
			// Attempt to clean up before failing
			os.RemoveAll(tempDir)
			return nil, "", fmt.Errorf("failed to scale video %s: %w", video.FileName, err)
		}

		// Create a new VideoFile entry for the scaled video
		processedFiles[i] = VideoFile{
			Path:       outputFileName,
			FileName:   video.FileName, // Keep original name for reference
			Resolution: targetResolution,
			Codec:      video.Codec,
			// Other fields like size, duration could be re-calculated, but path is the most critical one
		}
	}

	runtime.EventsEmit(a.ctx, "mergeProgress", "Re-encoding complete. Starting final merge...")
	return processedFiles, tempDir, nil
}


// MergeVideos takes a list of video files and merges them into a single output file.
func (a *App) MergeVideos(videoFiles []VideoFile) (string, error) {
	if len(videoFiles) < 2 {
		return "", fmt.Errorf("at least two videos are required to merge")
	}

	// Handle potential incompatibilities (re-encoding if necessary)
	processedFiles, tempDir, err := a.handleIncompatibleVideos(videoFiles)
	if err != nil {
		return "", fmt.Errorf("failed to process videos: %w", err)
	}
	// If a temp directory was created, make sure it's cleaned up
	if tempDir != "" {
		defer os.RemoveAll(tempDir)
	}

	// Ask user for save location
	ext := filepath.Ext(processedFiles[0].Path)
	if ext == "" { // If the scaled file has no extension, default to mp4
		ext = ".mp4"
	}
	outputFile, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save Merged Video As...",
		DefaultFilename: fmt.Sprintf("merged-video%s", ext),
	})
	if err != nil {
		return "", err
	}
	if outputFile == "" {
		return "", fmt.Errorf("save operation cancelled")
	}

	// Create a temporary file to list the inputs for ffmpeg
	tempFile, err := os.CreateTemp("", "ffmpeg-list-*.txt")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file for ffmpeg: %w", err)
	}
	defer os.Remove(tempFile.Name()) // Clean up the temp file

	for _, video := range processedFiles {
		// FFmpeg's concat demuxer requires file paths to be quoted if they contain special characters.
		if _, err := tempFile.WriteString(fmt.Sprintf("file '%s'\n", video.Path)); err != nil {
			return "", fmt.Errorf("failed to write to temp file: %w", err)
		}
	}
	tempFile.Close()

	// Create a context with cancellation for the ffmpeg command
	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelFunc = cancel // Store the cancel function
	defer func() {        // Ensure cancel is called when function exits
		cancel()
		a.cancelFunc = nil
	}()

	// Execute FFmpeg command - always use -c copy because inputs are now compatible
	cmd := exec.CommandContext(ctx, "ffmpeg", "-f", "concat", "-safe", "0", "-i", tempFile.Name(), "-c", "copy", outputFile)

	// Capture stderr for progress monitoring
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start ffmpeg command: %w", err)
	}

	// Goroutine to read and parse ffmpeg progress
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			// This is a simplified example, actual parsing will be more complex
			if strings.Contains(line, "frame=") && strings.Contains(line, "time=") {
				runtime.EventsEmit(a.ctx, "mergeProgress", line)
			}
		}
		if err := scanner.Err(); err != nil {
			log.Printf("Error reading ffmpeg stderr: %v", err)
		}
	}()

	// Wait for the command to finish
	err = cmd.Wait()
	if err != nil {
		// Check if the error was due to cancellation
		if ctx.Err() == context.Canceled {
			return "", fmt.Errorf("merge cancelled by user")
		}
		return "", fmt.Errorf("ffmpeg execution failed: %w", err)
	}

	return fmt.Sprintf("Successfully merged videos to %s", outputFile), nil
}
