package main

import (
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
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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

// SelectVideos opens a file dialog and returns metadata for selected video files
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
		cmd := exec.Command("ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path)
		out, err := cmd.Output()
		if err != nil {
			log.Printf("Error running ffprobe for %s: %v", path, err)
			continue // Skip this file
		}

		var ffprobeData FFProbeResult
		err = json.Unmarshal(out, &ffprobeData)
		if err != nil {
			log.Printf("Error parsing ffprobe output for %s: %v", path, err)
			continue // Skip this file
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
			// Continue without thumbnail, or set a default fallback
			videoFile.ThumbnailBase64 = ""
		} else {
			videoFile.ThumbnailBase64 = thumbnail
		}

		videoFiles = append(videoFiles, videoFile)
	}

	return videoFiles, nil
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

// MergeVideos takes a list of video files and merges them into a single output file.
func (a *App) MergeVideos(videoFiles []VideoFile) (string, error) {
    if len(videoFiles) < 2 {
        return "", fmt.Errorf("at least two videos are required to merge")
    }

    // Compatibility Check
    firstVideo := videoFiles[0]
    for _, video := range videoFiles[1:] {
        if video.Resolution != firstVideo.Resolution || video.Codec != firstVideo.Codec {
            return "", fmt.Errorf("incompatible videos: all videos must have the same resolution and codec for a fast merge. Mismatched file: %s", video.FileName)
        }
    }

    // Ask user for save location
    ext := filepath.Ext(firstVideo.Path)
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

    for _, video := range videoFiles {
        // FFmpeg's concat demuxer requires file paths to be quoted if they contain special characters.
        if _, err := tempFile.WriteString(fmt.Sprintf("file '%s'\n", video.Path)); err != nil {
            return "", fmt.Errorf("failed to write to temp file: %w", err)
        }
    }
    tempFile.Close()

    // Execute FFmpeg command
    cmd := exec.Command("ffmpeg", "-f", "concat", "-safe", "0", "-i", tempFile.Name(), "-c", "copy", outputFile)
    output, err := cmd.CombinedOutput() // CombinedOutput gets stdout and stderr
    if err != nil {
        return "", fmt.Errorf("ffmpeg execution failed: %s\n%s", err, string(output))
    }

    return fmt.Sprintf("Successfully merged videos to %s", outputFile), nil
}

