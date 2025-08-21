package main

import (
    "bufio" // Used for reading ffmpeg progress from stdout
    "bytes"
    "context"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "math"
    "log"
    "os"
    "os/exec"
    "path/filepath"
    "strconv"
	"strings" // Added for string manipulation
	"sync"
	"sync/atomic"
	"time"

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
	ThumbnailBase64 string  `json:"thumbnailBase64"`
	HasAudio        bool    `json:"hasAudio"`
	FPS             float64 `json:"fps"`
	PixelFormat     string  `json:"pixelFormat"`
	SampleRate      int     `json:"sampleRate"`
	ChannelLayout   string  `json:"channelLayout"`
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
	ctx        context.Context
	cancelFunc context.CancelFunc

	useHW    bool // Whether to use hardware acceleration
	encAvail map[string]bool
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

func detectEncoders() (map[string]bool, error) {
	cmd := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-encoders")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	s := string(out)
	have := map[string]bool{
		"h264_nvenc": strings.Contains(s, "h264_nvenc"),
		"hevc_nvenc": strings.Contains(s, "hevc_nvenc"),
		"h264_qsv":   strings.Contains(s, "h264_qsv"),
		"hevc_qsv":   strings.Contains(s, "hevc_qsv"),
		"h264_amf":   strings.Contains(s, "h264_amf"),
		"hevc_amf":   strings.Contains(s, "hevc_amf"),
		// Nếu cần macOS:
		// "h264_videotoolbox": strings.Contains(s, "h264_videotoolbox"),
		// "hevc_videotoolbox": strings.Contains(s, "hevc_videotoolbox"),
	}
	return have, nil
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
	// detect once
	enc, err := detectEncoders()
	if err == nil {
		a.encAvail = enc
	} else {
		a.encAvail = map[string]bool{}
		log.Printf("detectEncoders error: %v", err)
	}
}

// gọi từ UI khi người dùng bật/tắt toggle
func (a *App) SetUseHardwareEncoder(use bool) {
	a.useHW = use
}

// UI có thể gọi để biết có GPU encoder nào khả dụng không & tên nào
func (a *App) GetHardwareEncoders() []string {
	names := []string{}
	for k, ok := range a.encAvail {
		if ok {
			names = append(names, k)
		}
	}
	return names
}

type EncArgs struct {
	Codec []string
	Name  string // tên encoder dùng thực tế (để hiển thị nếu muốn)
}

func buildVideoEncoderArgs(useHW bool, have map[string]bool) EncArgs {
	if useHW {
		switch {
		case have["h264_nvenc"]:
			return EncArgs{
				Name:  "h264_nvenc",
				Codec: []string{"-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr_hq", "-cq", "23", "-b:v", "0", "-pix_fmt", "yuv420p"},
			}
		case have["h264_qsv"]:
			return EncArgs{
				Name:  "h264_qsv",
				Codec: []string{"-c:v", "h264_qsv", "-preset", "medium", "-rc", "icq", "-global_quality", "23", "-pix_fmt", "yuv420p"},
			}
		case have["h264_amf"]:
			return EncArgs{
				Name:  "h264_amf",
				Codec: []string{"-c:v", "h264_amf", "-quality", "quality", "-rc", "vbr", "-qvbr_quality_level", "23", "-pix_fmt", "yuv420p"},
			}
		}
		// không có encoder HW khả dụng → rơi xuống CPU
	}
	return EncArgs{
		Name:  "libx264",
		Codec: []string{"-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"},
	}
}

// FFProbeStream defines the structure for a stream in ffprobe output
type FFProbeStream struct {
	CodecType     string `json:"codec_type"`
	CodecName     string `json:"codec_name"`
	Width         int    `json:"width"`
	Height        int    `json:"height"`
	AvgFrameRate  string `json:"avg_frame_rate"`
	PixFmt        string `json:"pix_fmt"`
	SampleRate    string `json:"sample_rate"`
	ChannelLayout string `json:"channel_layout"`
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

func parseFrameRate(rate string) float64 {
	parts := strings.Split(rate, "/")
	if len(parts) == 2 {
		num, err1 := strconv.ParseFloat(parts[0], 64)
		den, err2 := strconv.ParseFloat(parts[1], 64)
		if err1 == nil && err2 == nil && den != 0 {
			return num / den
		}
	}
	v, _ := strconv.ParseFloat(rate, 64)
	return v
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
	var audioStream FFProbeStream
	hasAudio := false
	for _, stream := range ffprobeData.Streams {
		if stream.CodecType == "video" {
			videoStream = stream
		} else if stream.CodecType == "audio" && !hasAudio {
			audioStream = stream
			hasAudio = true
		}
	}

	// Validate that a valid video stream was found
	if videoStream.Width == 0 || videoStream.Height == 0 {
		return VideoFile{}, fmt.Errorf("no valid video stream found in %s", path)
	}

	duration, _ := strconv.ParseFloat(ffprobeData.Format.Duration, 64)
	size, _ := strconv.ParseInt(ffprobeData.Format.Size, 10, 64)

	fps := parseFrameRate(videoStream.AvgFrameRate)
	sampleRate, _ := strconv.Atoi(audioStream.SampleRate)

	videoFile := VideoFile{
		Path:          path,
		FileName:      filepath.Base(path),
		Size:          size,
		Duration:      duration,
		Resolution:    fmt.Sprintf("%dx%d", videoStream.Width, videoStream.Height),
		Codec:         videoStream.CodecName,
		HasAudio:      hasAudio,
		FPS:           fps,
		PixelFormat:   videoStream.PixFmt,
		SampleRate:    sampleRate,
		ChannelLayout: audioStream.ChannelLayout,
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
	// Use -ss before -i for fast seeking. Output as mjpeg for correct data URI.
	cmd := exec.Command("ffmpeg",
		"-ss", "1",
		"-i", videoPath,
		"-frames:v", "1",
		"-f", "mjpeg",
		"-",
	)

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("failed to generate thumbnail for %s: %s\n%s", videoPath, err.Error(), stderr.String())
	}

	encodedString := base64.StdEncoding.EncodeToString(out.Bytes())
	return "data:image/jpeg;base64," + encodedString, nil
}

// escapeFFConcatPath escapes a path for use in ffmpeg's concat demuxer file.
func escapeFFConcatPath(p string) string {
    // Escape single quotes for ffconcat syntax
    s := strings.ReplaceAll(p, "'", "'\\''")
    // On Windows, also escape backslashes for ffmpeg concat demuxer paths
    if os.PathSeparator == '\\' {
        s = strings.ReplaceAll(s, "\\", "\\\\")
    }
    return s
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

// viết list concat cho ffmpeg
func writeConcatList(paths []string) (string, error) {
	f, err := os.CreateTemp("", "ffmpeg-list-*.txt")
	if err != nil {
		return "", err
	}
	for _, p := range paths {
		if _, err := fmt.Fprintf(f, "file '%s'\n", escapeFFConcatPath(p)); err != nil {
			f.Close()
			os.Remove(f.Name())
			return "", err
		}
	}
	f.Close()
	return f.Name(), nil
}

// thử concat -c copy (fast merge). Trả về nil nếu thành công.
func tryFastMerge(ctx context.Context, inputPaths []string, output string) error {
	listFile, err := writeConcatList(inputPaths)
	if err != nil {
		return err
	}
	defer os.Remove(listFile)

	// -xerror: coi warning nghiêm trọng là lỗi để fail sớm
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-y", "-hide_banner", "-loglevel", "error", "-xerror",
		"-f", "concat", "-safe", "0", "-i", listFile,
		"-c", "copy",
		output,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("fast merge failed: %v\nffmpeg: %s", err, string(out))
	}
	return nil
}

func looksFastMergeable(vs []VideoFile) bool {
    if len(vs) == 0 {
        return false
    }
    // Fast merge heuristics (approximate, to avoid false negatives from float rounding)
    base := vs[0]
    for _, v := range vs[1:] {
        if v.Codec != base.Codec {
            return false
        }
        if v.Resolution != base.Resolution {
            return false
        }
        if v.HasAudio != base.HasAudio {
            return false
        }
        // Allow small FPS rounding differences (e.g., 29.97 vs 29.9701)
        if math.Abs(v.FPS-base.FPS) > 0.05 {
            return false
        }
        // Pixel format is generally consistent for compressed streams; keep strict
        if v.PixelFormat != base.PixelFormat {
            return false
        }
        // Only check audio params if audio is present
        if v.HasAudio {
            if v.SampleRate != base.SampleRate || v.ChannelLayout != base.ChannelLayout {
                return false
            }
        }
    }
    return true
}

func audioMismatch(vs []VideoFile) (has, no bool) {
	for _, v := range vs {
		if v.HasAudio {
			has = true
		} else {
			no = true
		}
	}
	return
}

// MergeVideos normalizes all videos to a standard format and then merges them.
func (a *App) MergeVideos(videoFiles []VideoFile) (string, error) {
	if len(videoFiles) < 2 {
		return "", fmt.Errorf("at least two videos are required to merge")
	}

	// 1) Hỏi nơi lưu trước: dùng chung cho fast + fallback
	outputFile, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save Merged Video As...",
		DefaultFilename: fmt.Sprintf("merged-video-%s.mp4", time.Now().Format("20060102-150405")),
	})
	if err != nil {
		return "", err
	}
	if outputFile == "" {
		return "", fmt.Errorf("save operation cancelled")
	}

	// 2) Thử fast merge nếu “có vẻ” hợp lệ
	inputPaths := make([]string, len(videoFiles))
	for i, v := range videoFiles {
		inputPaths[i] = v.Path
	}

	if looksFastMergeable(videoFiles) {
    runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
        "message": "Trying fast merge (stream copy)...",
    })
		ctx, cancel := context.WithCancel(a.ctx)
		a.cancelFunc = cancel
		defer func() { cancel(); a.cancelFunc = nil }()

		if err := tryFastMerge(ctx, inputPaths, outputFile); err == nil {
			return fmt.Sprintf("Successfully merged videos to %s (fast merge)", outputFile), nil
		} else {
            log.Printf("[fast-merge] %v", err)
            runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
                "message": "Fast merge failed, falling back to normalization...",
            })
		}
	}

	// --- Universal Normalization Workflow ---
    runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
        "message": "Starting normalization process...",
    })

	// Determine the highest resolution to use as the target
	highestWidth := 0
	highestHeight := 0
	for _, video := range videoFiles {
		var w, h int
		fmt.Sscanf(video.Resolution, "%dx%d", &w, &h)
		if w > highestWidth {
			highestWidth = w
			highestHeight = h
		}
	}

	hasAud, noAud := audioMismatch(videoFiles)
	needAudioNormalize := hasAud && noAud

	// Create a temporary directory for the normalized files
	tempDir, err := os.MkdirTemp("", "stitcher-normalized-*")
	if err != nil {
		return "", fmt.Errorf("failed to create temp dir for normalization: %w", err)
	}
	defer os.RemoveAll(tempDir)

	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelFunc = cancel
	defer func() { cancel(); a.cancelFunc = nil }()

	enc := buildVideoEncoderArgs(a.useHW, a.encAvail)
	runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
		"message": fmt.Sprintf("Using encoder: %s", enc.Name),
	})

	processedFilePaths := make([]string, len(videoFiles))
	var wg sync.WaitGroup
	errCh := make(chan error, 1)
	var completed int32
	total := len(videoFiles)

	for i, video := range videoFiles {
		wg.Add(1)
		i, video := i, video
		go func() {
			defer wg.Done()
            runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
                "message": fmt.Sprintf("Normalizing %s...", video.FileName),
            })
			outputFileName := filepath.Join(tempDir, fmt.Sprintf("normalized-%d-%s", i, filepath.Base(video.Path)))

			// 1) Filter video (scale + pad + fps + SAR)
			vf := fmt.Sprintf(
				"scale=%d:%d:force_original_aspect_ratio=decrease,setsar=1,format=yuv420p,"+
					"pad=%d:%d:(ow-iw)/2:(oh-ih)/2,fps=30",
				highestWidth, highestHeight, highestWidth, highestHeight)

			// 2) BẮT BUỘC: đưa tất cả -i (input) TRƯỚC khi -map
			args := []string{
				"-y", "-hide_banner", "-loglevel", "error",
				"-i", video.Path, // input 0: file gốc
			}

			// Nếu file này không có audio và đang cần đồng bộ audio -> thêm anullsrc làm input 1
			synthSilence := needAudioNormalize && !video.HasAudio
			if synthSilence {
				args = append(args,
					"-f", "lavfi", "-t", "999999", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", // input 1
				)
			}

			// 3) Áp filter + chọn encoder video (GPU/CPU) từ enc.Codec
			args = append(args, "-vf", vf)
			args = append(args, enc.Codec...)

			// 4) Map stream & audio để mọi file có cùng layout
			//    - map video chính
			//    - bỏ phụ đề/data/metadata/chapters để không lệch số lượng stream
			args = append(args, "-map", "0:v:0", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1")

			if needAudioNormalize {
				if video.HasAudio {
					// Có audio -> chuẩn hóa AAC 48k stereo
					args = append(args, "-map", "0:a:0", "-c:a", "aac", "-ar", "48000", "-ac", "2")
				} else {
					// Không audio -> lấy audio im lặng từ input 1
					args = append(args, "-map", "1:a:0", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest")
				}
			} else {
				// Tất cả cùng có hoặc cùng không có audio
				if video.HasAudio {
					args = append(args, "-map", "0:a:0", "-c:a", "aac", "-ar", "48000", "-ac", "2")
				} else {
					args = append(args, "-an")
				}
			}

			// 5) Output đích
			args = append(args, outputFileName)

			// 6) Chạy FFmpeg
			cmd := exec.CommandContext(ctx, "ffmpeg", args...)
			var stderr bytes.Buffer
			cmd.Stderr = &stderr

			if err := cmd.Run(); err != nil {
				select {
				case errCh <- fmt.Errorf("failed to normalize %s: %v\nffmpeg:\n%s", video.FileName, err, stderr.String()):
				default:
				}
				return
			}

			processedFilePaths[i] = outputFileName

            done := atomic.AddInt32(&completed, 1)
            runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
                "message": fmt.Sprintf("Normalized %s (%d/%d)", video.FileName, done, total),
            })
		}()
	}

	doneCh := make(chan struct{})
	go func() {
		wg.Wait()
		close(doneCh)
	}()

	select {
	case err := <-errCh:
		cancel()
		<-doneCh
		return "", err
	case <-doneCh:
	}

    runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
        "message": "Normalization complete. Starting final merge...",
    })

	// --- Final Concat Step ---

	// Create a temporary file to list the inputs for ffmpeg
	tempFile, err := os.CreateTemp("", "ffmpeg-list-*.txt")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file for ffmpeg: %w", err)
	}
	defer os.Remove(tempFile.Name())

	for _, path := range processedFilePaths {
		line := fmt.Sprintf("file '%s'\n", escapeFFConcatPath(path))
		if _, err := tempFile.WriteString(line); err != nil {
			return "", fmt.Errorf("failed to write to temp file: %w", err)
		}
	}
	tempFile.Close()

	// Calculate total duration for progress reporting
	var totalDuration float64
	for _, video := range videoFiles {
		totalDuration += video.Duration
	}

	// All files are now standardized, so a fast stream copy is safe and reliable.
	// Use "-nostats -progress -" to pipe structured progress to stdout.
	cmd := exec.CommandContext(ctx, "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", tempFile.Name(), "-c", "copy", "-nostats", "-progress", "-", outputFile)

	// Stderr will be used to capture actual errors, since stdout is for progress
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("failed to create stdout pipe for progress: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start ffmpeg command: %w", err)
	}

	// Goroutine to read and parse ffmpeg's structured progress from stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])

			if key == "out_time_ms" {
				outTimeUs, err := strconv.ParseInt(value, 10, 64)
				if err != nil {
					continue
				}
				// FFmpeg reports progress in microseconds
				progressSeconds := float64(outTimeUs) / 1_000_000
				if totalDuration > 0 {
					percentage := (progressSeconds / totalDuration) * 100
					if percentage > 100 {
						percentage = 100
					}
                runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
                    "percentage": percentage,
                    "current":    progressSeconds,
                    "total":      totalDuration,
                    "message":    "Merging...",
                })
				}
			} else if key == "progress" && value == "end" {
				// Ensure the progress bar hits 100% on completion
                runtime.EventsEmit(a.ctx, "mergeProgress", map[string]interface{}{
                    "percentage": 100.0,
                    "current":    totalDuration,
                    "total":      totalDuration,
                    "message":    "Merge complete",
                })
			}
		}
		if err := scanner.Err(); err != nil {
			log.Printf("Error reading ffmpeg stdout for progress: %v", err)
		}
	}()

	err = cmd.Wait()
	if err != nil {
		if ctx.Err() == context.Canceled {
			return "", fmt.Errorf("merge cancelled by user")
		}
		// Include ffmpeg's stderr in the error message for better debugging
		return "", fmt.Errorf("ffmpeg execution failed: %w\nffmpeg stderr:\n%s", err, stderr.String())
	}

	return fmt.Sprintf("Successfully merged videos to %s", outputFile), nil
}
